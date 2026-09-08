import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Reanimated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppPalette, AppTint, FontFamily } from '@/constants/palette';
import { useAppTheme } from '@/hooks/use-app-theme';
import * as chatRepo from '@/lib/db/chat-repository';
import type {
  ChatMessageRole,
  ChatPlanItem,
  ConversationSummary,
  StoredMessage,
} from '@/lib/db/chat-repository';
import { AI_SYSTEM_PROMPT, ChatMessage, chatWithGroq, isAiConfigured } from '@/lib/services/ai';
import { reportError } from '@/lib/services/observability';
import { useAuthStore } from '@/store/auth-store';

/* -------------------------------------------------------------------------- */
/* Constants + seed conversation                                              */
/* -------------------------------------------------------------------------- */

const SUGGESTIONS = ['Generate Timetable', 'Optimize Schedule', 'Study Tips'];

/** Greeting shown on an empty thread. Not persisted — it's UI, not history. */
const GREETING =
  '👋 Hi! I can help you plan your day, break down tasks and build schedules. What would you like to do?';

/**
 * How many stored messages to replay to the model. History is now permanent, so
 * without a cap a long-running thread would eventually blow the context window.
 */
const MAX_CONTEXT_MESSAGES = 20;

const STUDY_PLAN: ChatPlanItem[] = [
  { day: 'Day 1', detail: 'Mathematics — 3 hours' },
  { day: 'Day 2', detail: 'Physics — 3 hours' },
  { day: 'Day 3', detail: 'Computer Science — 4 hours' },
  { day: 'Day 4', detail: 'Mathematics — 2 hours' },
  { day: 'Day 5', detail: 'Physics — 3 hours' },
  { day: 'Day 6', detail: 'Computer Science — 3 hours' },
  { day: 'Day 7', detail: 'Revision & Practice Tests' },
];

/* -------------------------------------------------------------------------- */
/* Offline fallback reply (used when no Groq key is configured)                */
/* -------------------------------------------------------------------------- */

function aiReply(prompt: string): { text: string; plan?: ChatPlanItem[] } {
  const p = prompt.toLowerCase();
  if (p.includes('timetable')) {
    return { text: "Done! I've generated a balanced weekly timetable and spread your sessions evenly across the week." };
  }
  if (p.includes('optimize')) {
    return { text: "I've optimized your schedule — reduced back-to-back classes and added short breaks between study blocks." };
  }
  if (p.includes('tip')) {
    return { text: 'Try the Pomodoro technique: 25 minutes focused study, 5 minutes rest. Review notes within 24 hours to boost retention.' };
  }
  if (p.includes('plan') || p.includes('exam')) {
    return { text: "Here's a fresh 7-day study plan tailored to your subjects:", plan: STUDY_PLAN };
  }
  return { text: "Got it! I'll help you with that. Could you share a little more detail so I can tailor the plan?" };
}

/** Short "when" label for a history row. */
function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/* -------------------------------------------------------------------------- */
/* Screen                                                                     */
/* -------------------------------------------------------------------------- */

export default function AiAssistantScreen() {
  const router = useRouter();
  const { seed } = useLocalSearchParams<{ seed?: string }>();
  const insets = useSafeAreaInsets();
  const { Palette, Tint, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette, Tint), [Palette, Tint]);
  const uid = useAuthStore((s) => s.fbUser?.uid);

  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<ConversationSummary[] | null>(null);
  const [renaming, setRenaming] = useState<ConversationSummary | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const abortRef = useRef<AbortController | null>(null);
  const seedSentRef = useRef(false);
  // Held in a ref so async callbacks always see the live id, never a stale closure.
  const conversationIdRef = useRef<string | null>(null);

  // Android edge-to-edge disables the OS's window-resize keyboard avoidance,
  // so we track the keyboard height natively (insets-based, not resize-based)
  // and pad the content, subtracting the safe-area inset already applied below.
  const keyboard = useAnimatedKeyboard({ isStatusBarTranslucentAndroid: true });

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  /* ---------------------------------------------------------------------- */
  /* Load persisted history                                                 */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!uid) {
        setLoading(false);
        return;
      }
      try {
        // Arriving from the AI Generator with a prompt: start a fresh thread so
        // the generated plan isn't appended to an unrelated conversation.
        if (seed) {
          await chatRepo.pruneEmptyConversations(uid);
          const created = await chatRepo.createConversation(uid);
          if (cancelled) return;
          conversationIdRef.current = created.id;
          setMessages([]);
          return;
        }
        const existing = await chatRepo.getLatestConversation(uid);
        const conversation = existing ?? (await chatRepo.createConversation(uid));
        const stored = existing ? await chatRepo.getMessages(conversation.id) : [];
        if (cancelled) return;
        conversationIdRef.current = conversation.id;
        setMessages(stored);
      } catch (e) {
        reportError(e, 'ai-assistant.loadHistory');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, seed]);

  /* ---------------------------------------------------------------------- */
  /* Persistence helpers                                                    */
  /* ---------------------------------------------------------------------- */

  const ensureConversation = async (): Promise<string | null> => {
    if (conversationIdRef.current) return conversationIdRef.current;
    if (!uid) return null;
    const created = await chatRepo.createConversation(uid);
    conversationIdRef.current = created.id;
    return created.id;
  };

  /**
   * Writes a message to SQLite and appends it to the view. If the write fails
   * we still show the message so the conversation isn't visibly broken.
   */
  const appendMessage = async (
    conversationId: string | null,
    role: ChatMessageRole,
    text: string,
    plan?: ChatPlanItem[],
  ): Promise<void> => {
    const showLocally = () =>
      setMessages((prev) => [
        ...prev,
        {
          id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          conversationId: conversationId ?? '',
          role,
          text,
          ...(plan ? { plan } : {}),
          createdAt: new Date().toISOString(),
        },
      ]);

    // No conversation (signed out, or the insert failed): the chat still has to
    // work, it just won't be remembered.
    if (!conversationId) {
      showLocally();
      return;
    }
    try {
      const saved = await chatRepo.addMessage({ conversationId, role, text, plan });
      setMessages((prev) => [...prev, saved]);
    } catch (e) {
      reportError(e, 'ai-assistant.addMessage');
      showLocally();
    }
  };

  /* ---------------------------------------------------------------------- */
  /* Sending                                                                */
  /* ---------------------------------------------------------------------- */

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || typing || loading) return;
    setInput('');

    const conversationId = await ensureConversation();
    const isFirstMessage = messages.length === 0;
    const context = [...messages, { role: 'user' as ChatMessageRole, text }];
    await appendMessage(conversationId, 'user', text);
    setTyping(true);

    // Name the thread after its opening message so the history list is scannable.
    if (conversationId && isFirstMessage) {
      try {
        await chatRepo.renameConversation(conversationId, chatRepo.deriveTitle(text));
      } catch (e) {
        reportError(e, 'ai-assistant.renameConversation');
      }
    }

    // No key configured → keep the offline canned reply so the UI still works.
    if (!isAiConfigured) {
      const reply = aiReply(text);
      await appendMessage(conversationId, 'ai', reply.text, reply.plan);
      setTyping(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const payload: ChatMessage[] = [
        { role: 'system', content: AI_SYSTEM_PROMPT },
        ...context.slice(-MAX_CONTEXT_MESSAGES).map((m) => ({
          role: m.role === 'ai' ? ('assistant' as const) : ('user' as const),
          content: m.text,
        })),
      ];
      const reply = await chatWithGroq(payload, controller.signal);
      await appendMessage(conversationId, 'ai', reply);
    } catch (err) {
      if (!controller.signal.aborted) {
        reportError(err, 'ai-assistant.send');
        await appendMessage(
          conversationId,
          'ai',
          "Sorry, I couldn't reach the assistant just now. Please check your connection and try again.",
        );
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setTyping(false);
    }
  };

  // Arriving from the AI Generator screen with a pre-built prompt: send it once.
  useEffect(() => {
    if (seed && !seedSentRef.current && !loading) {
      seedSentRef.current = true;
      void send(seed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, loading, uid]);

  /* ---------------------------------------------------------------------- */
  /* History sheet                                                          */
  /* ---------------------------------------------------------------------- */

  const refreshHistory = async () => {
    if (!uid) return;
    try {
      setHistory(await chatRepo.listConversations(uid));
    } catch (e) {
      reportError(e, 'ai-assistant.listConversations');
      setHistory([]);
    }
  };

  const openHistory = () => {
    setHistoryOpen(true);
    setHistory(null);
    void refreshHistory();
  };

  const startNewChat = async () => {
    setHistoryOpen(false);
    if (!uid || typing) return;
    // Already sitting on a blank thread — reuse it instead of piling up empties.
    if (messages.length === 0 && conversationIdRef.current) return;
    try {
      await chatRepo.pruneEmptyConversations(uid);
      const created = await chatRepo.createConversation(uid);
      conversationIdRef.current = created.id;
      setMessages([]);
    } catch (e) {
      reportError(e, 'ai-assistant.startNewChat');
    }
  };

  const openConversation = async (id: string) => {
    setHistoryOpen(false);
    if (typing || id === conversationIdRef.current) return;
    setLoading(true);
    try {
      const stored = await chatRepo.getMessages(id);
      conversationIdRef.current = id;
      setMessages(stored);
    } catch (e) {
      reportError(e, 'ai-assistant.openConversation');
    } finally {
      setLoading(false);
    }
  };

  const performDelete = async (id: string) => {
    if (!uid) return;
    try {
      await chatRepo.deleteConversation(id);
      const next = await chatRepo.listConversations(uid);
      setHistory(next);
      // Deleted the open thread → fall back to the newest one, or a fresh blank.
      if (id === conversationIdRef.current) {
        const fallbackId = next[0]?.id ?? (await chatRepo.createConversation(uid)).id;
        conversationIdRef.current = fallbackId;
        setMessages(await chatRepo.getMessages(fallbackId));
      }
    } catch (e) {
      reportError(e, 'ai-assistant.deleteConversation');
    }
  };

  const confirmDelete = (item: ConversationSummary) => {
    Alert.alert('Delete chat', `Delete “${item.title}”? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void performDelete(item.id) },
    ]);
  };

  const performRename = async (id: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    try {
      await chatRepo.renameConversation(id, trimmed);
      await refreshHistory();
    } catch (e) {
      reportError(e, 'ai-assistant.renameConversation');
    }
    setRenaming(null);
  };

  /* ---------------------------------------------------------------------- */
  /* Render                                                                 */
  /* ---------------------------------------------------------------------- */

  const keyboardSpacerStyle = useAnimatedStyle(() => ({
    height: Math.max(keyboard.height.value - insets.bottom, 0),
  }));
  const canSend = input.trim().length > 0 && !typing && !loading;

  const scrollToEnd = () => scrollRef.current?.scrollToEnd({ animated: true });

  return (
    <View style={styles.root}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            hitSlop={10}
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
            <Ionicons name="chevron-back" size={22} color={Palette.ink} />
          </Pressable>
          <View style={styles.headerCenter}>
            <View style={styles.aiBadge}>
              <Ionicons name="sparkles" size={16} color="#FFFFFF" />
            </View>
            <View>
              <Text style={styles.headerTitle}>AI Assistant</Text>
              <Text style={styles.headerStatus}>Online</Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              hitSlop={10}
              onPress={openHistory}
              accessibilityLabel="Chat history"
              style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}>
              <Ionicons name="time-outline" size={20} color={Palette.primary} />
            </Pressable>
            <Pressable
              hitSlop={10}
              onPress={() => router.push('/ai-schedule')}
              accessibilityLabel="AI generator"
              style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}>
              <Ionicons name="create-outline" size={20} color={Palette.primary} />
            </Pressable>
          </View>
        </View>

        <View style={styles.flex}>
          {/* Messages */}
          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={Palette.primary} />
            </View>
          ) : (
            <ScrollView
              ref={scrollRef}
              style={styles.flex}
              contentContainerStyle={styles.messages}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              onContentSizeChange={scrollToEnd}>
              {messages.length === 0 ? <AiBubble text={GREETING} /> : null}

              {messages.map((m) =>
                m.role === 'user' ? (
                  <View key={m.id} style={styles.userRow}>
                    <View style={styles.userBubble}>
                      <Text style={styles.userText}>{m.text}</Text>
                    </View>
                  </View>
                ) : (
                  <AiBubble key={m.id} text={m.text} plan={m.plan} />
                ),
              )}

              {typing ? <TypingBubble /> : null}
            </ScrollView>
          )}

          {/* Composer: suggestion chips grouped together with the input bar */}
          <View style={styles.composer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.chipsRow}>
              {SUGGESTIONS.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => send(s)}
                  style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}>
                  <Ionicons name="sparkles-outline" size={13} color={Palette.primary} />
                  <Text style={styles.chipText}>{s}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={styles.inputBar}>
              <Pressable
                onPress={() => {
                  /* TODO(backend): start voice input. */
                }}
                style={({ pressed }) => [styles.micBtn, pressed && styles.pressed]}>
                <Ionicons name="mic" size={20} color={Palette.primary} />
              </Pressable>
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder="Type a message..."
                placeholderTextColor={Palette.subtle}
                style={styles.textInput}
                multiline
                onSubmitEditing={() => send(input)}
                returnKeyType="send"
              />
              <Pressable
                onPress={() => send(input)}
                disabled={!canSend}
                style={({ pressed }) => [
                  styles.sendBtn,
                  !canSend && styles.sendDisabled,
                  pressed && canSend && styles.sendPressed,
                ]}>
                <Ionicons name="send" size={18} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>

          {/* Keyboard spacer: reserves room above the keyboard so the input bar isn't covered */}
          <Reanimated.View style={keyboardSpacerStyle} />
        </View>
      </SafeAreaView>

      {/* History sheet */}
      <Modal
        visible={historyOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setHistoryOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setHistoryOpen(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Chat history</Text>
            <Pressable
              onPress={() => void startNewChat()}
              style={({ pressed }) => [styles.newChatBtn, pressed && styles.pressed]}>
              <Ionicons name="add" size={16} color="#FFFFFF" />
              <Text style={styles.newChatText}>New chat</Text>
            </Pressable>
          </View>

          {history === null ? (
            <View style={styles.sheetLoading}>
              <ActivityIndicator color={Palette.primary} />
            </View>
          ) : history.length === 0 ? (
            <View style={styles.sheetEmpty}>
              <Ionicons name="chatbubbles-outline" size={34} color={Palette.subtle} />
              <Text style={styles.sheetEmptyText}>
                No saved chats yet. Your conversations appear here automatically.
              </Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.sheetList} showsVerticalScrollIndicator={false}>
              {history.map((item) => {
                const active = item.id === conversationIdRef.current;
                return (
                  <View key={item.id} style={[styles.historyRow, active && styles.historyRowActive]}>
                    <Pressable
                      onPress={() => void openConversation(item.id)}
                      style={styles.historyMain}>
                      <Text style={styles.historyTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={styles.historyPreview} numberOfLines={1}>
                        {item.preview || 'No messages yet'}
                      </Text>
                      <Text style={styles.historyMeta}>
                        {formatWhen(item.updatedAt)} · {item.messageCount}{' '}
                        {item.messageCount === 1 ? 'message' : 'messages'}
                      </Text>
                    </Pressable>
                    <Pressable
                      hitSlop={8}
                      onPress={() => setRenaming(item)}
                      accessibilityLabel={`Rename ${item.title}`}
                      style={({ pressed }) => [styles.historyDelete, pressed && styles.pressed]}>
                      <Ionicons name="pencil-outline" size={17} color={Palette.subtle} />
                    </Pressable>
                    <Pressable
                      hitSlop={8}
                      onPress={() => confirmDelete(item)}
                      accessibilityLabel={`Delete ${item.title}`}
                      style={({ pressed }) => [styles.historyDelete, pressed && styles.pressed]}>
                      <Ionicons name="trash-outline" size={18} color={Palette.subtle} />
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </Modal>

      <RenameDialog
        visible={!!renaming}
        initial={renaming?.title ?? ''}
        onCancel={() => setRenaming(null)}
        onConfirm={(title) => {
          if (renaming) void performRename(renaming.id, title);
        }}
      />
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Rename dialog                                                             */
/* -------------------------------------------------------------------------- */

function RenameDialog({
  visible,
  initial,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  initial: string;
  onCancel: () => void;
  onConfirm: (title: string) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
      {visible ? <RenameSheet initial={initial} onCancel={onCancel} onConfirm={onConfirm} /> : null}
    </Modal>
  );
}

function RenameSheet({
  initial,
  onCancel,
  onConfirm,
}: {
  initial: string;
  onCancel: () => void;
  onConfirm: (title: string) => void;
}) {
  const { Palette, Tint } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette, Tint), [Palette, Tint]);
  const [text, setText] = useState(initial);

  return (
    <Pressable style={styles.renameBackdrop} onPress={onCancel}>
      <Pressable style={styles.renameSheet} onPress={() => {}}>
        <Text style={styles.renameTitle}>Rename chat</Text>
        <TextInput
          value={text}
          onChangeText={setText}
          autoFocus
          selectTextOnFocus
          placeholder="Chat name"
          placeholderTextColor={Palette.subtle}
          style={styles.renameInput}
          onSubmitEditing={() => text.trim() && onConfirm(text)}
        />
        <View style={styles.renameActions}>
          <Pressable onPress={onCancel} style={({ pressed }) => [styles.renameGhostBtn, pressed && styles.pressed]}>
            <Text style={styles.renameGhostText}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={() => text.trim() && onConfirm(text)}
            disabled={!text.trim()}
            style={({ pressed }) => [
              styles.renamePrimaryBtn,
              !text.trim() && styles.renamePrimaryDisabled,
              pressed && !!text.trim() && styles.pressed,
            ]}>
            <Text style={styles.renamePrimaryText}>Save</Text>
          </Pressable>
        </View>
      </Pressable>
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/* Assistant bubble                                                           */
/* -------------------------------------------------------------------------- */

function AiBubble({ text, plan }: { text: string; plan?: ChatPlanItem[] }) {
  const { Palette, Tint } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette, Tint), [Palette, Tint]);

  return (
    <View style={styles.aiRow}>
      <View style={styles.aiAvatar}>
        <Ionicons name="sparkles" size={14} color={Palette.primary} />
      </View>
      <View style={styles.aiBubble}>
        <Text style={styles.aiText}>{text}</Text>
        {plan ? (
          <View style={styles.plan}>
            {plan.map((item) => (
              <View key={item.day} style={styles.planRow}>
                <View style={styles.planDayChip}>
                  <Text style={styles.planDayText}>{item.day}</Text>
                </View>
                <Text style={styles.planDetail}>{item.detail}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Typing indicator                                                           */
/* -------------------------------------------------------------------------- */

function TypingBubble() {
  const { Palette, Tint } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette, Tint), [Palette, Tint]);
  const pulse = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.3, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={styles.aiRow}>
      <View style={styles.aiAvatar}>
        <Ionicons name="sparkles" size={14} color={Palette.primary} />
      </View>
      <View style={[styles.aiBubble, styles.typingBubble]}>
        <Animated.View style={[styles.typingDot, { opacity: pulse }]} />
        <Animated.View style={[styles.typingDot, { opacity: pulse }]} />
        <Animated.View style={[styles.typingDot, { opacity: pulse }]} />
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

function createStyles(Palette: AppPalette, Tint: AppTint) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },
  safe: { flex: 1 },
  flex: { flex: 1 },
  pressed: { opacity: 0.5 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: Palette.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: Tint.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  aiBadge: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: Palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontFamily: FontFamily, fontSize: 17, fontWeight: '800', color: Palette.ink },
  headerStatus: { fontFamily: FontFamily, fontSize: 12, fontWeight: '600', color: Palette.green },

  messages: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 12, gap: 14 },

  userRow: { alignItems: 'flex-end' },
  userBubble: {
    maxWidth: '82%',
    backgroundColor: Palette.primary,
    borderRadius: 20,
    borderBottomRightRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  userText: { fontFamily: FontFamily, fontSize: 15, fontWeight: '500', color: '#FFFFFF', lineHeight: 21 },

  aiRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, maxWidth: '90%' },
  aiAvatar: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: Tint.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiBubble: {
    flexShrink: 1,
    backgroundColor: Palette.card,
    borderRadius: 20,
    borderBottomLeftRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#3A2E7A',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  aiText: { fontFamily: FontFamily, fontSize: 15, fontWeight: '500', color: Palette.ink, lineHeight: 21 },

  plan: { marginTop: 12, gap: 8 },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  planDayChip: {
    backgroundColor: Tint.primary,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 48,
    alignItems: 'center',
  },
  planDayText: { fontFamily: FontFamily, fontSize: 12, fontWeight: '800', color: Palette.primary },
  planDetail: { flex: 1, fontFamily: FontFamily, fontSize: 14, fontWeight: '600', color: Palette.ink },

  typingBubble: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 16 },
  typingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Palette.secondary },

  composer: {
    borderTopWidth: 1,
    borderTopColor: Palette.hairline,
    backgroundColor: Palette.bg,
  },
  chipsRow: { gap: 10, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Palette.card,
    borderWidth: 1.5,
    borderColor: Palette.hairline,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 40,
  },
  chipPressed: { opacity: 0.6 },
  chipText: { fontFamily: FontFamily, fontSize: 13, fontWeight: '700', color: Palette.primary },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  micBtn: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: Tint.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textInput: {
    flex: 1,
    maxHeight: 120,
    minHeight: 46,
    backgroundColor: Palette.card,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: Palette.hairline,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    fontFamily: FontFamily,
    fontSize: 15,
    fontWeight: '500',
    color: Palette.ink,
  },
  sendBtn: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: Palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { backgroundColor: '#C9C2EC' },
  sendPressed: { backgroundColor: Palette.primaryDark, transform: [{ scale: 0.95 }] },

  /* History sheet */
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(17, 12, 46, 0.35)' },
  sheet: {
    maxHeight: '72%',
    backgroundColor: Palette.bg,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: Palette.hairline,
    marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sheetTitle: { fontFamily: FontFamily, fontSize: 18, fontWeight: '800', color: Palette.ink },
  newChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Palette.primary,
    borderRadius: 13,
    paddingHorizontal: 12,
    height: 38,
  },
  newChatText: { fontFamily: FontFamily, fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  sheetLoading: { paddingVertical: 40, alignItems: 'center' },
  sheetEmpty: { paddingVertical: 36, alignItems: 'center', gap: 10 },
  sheetEmptyText: {
    fontFamily: FontFamily,
    fontSize: 14,
    fontWeight: '500',
    color: Palette.subtle,
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 20,
  },
  sheetList: { gap: 10, paddingBottom: 8 },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Palette.card,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Palette.hairline,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  historyRowActive: { borderColor: Palette.primary },
  historyMain: { flex: 1, gap: 3 },
  historyTitle: { fontFamily: FontFamily, fontSize: 15, fontWeight: '700', color: Palette.ink },
  historyPreview: { fontFamily: FontFamily, fontSize: 13, fontWeight: '500', color: Palette.subtle },
  historyMeta: { fontFamily: FontFamily, fontSize: 11, fontWeight: '600', color: Palette.subtle },
  historyDelete: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  renameBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(12,10,28,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  renameSheet: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: Palette.card,
    borderRadius: 26,
    padding: 22,
    shadowColor: '#000000',
    shadowOpacity: 0.28,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 16 },
    elevation: 16,
  },
  renameTitle: { fontFamily: FontFamily, fontSize: 17, fontWeight: '800', color: Palette.ink, marginBottom: 14 },
  renameInput: {
    backgroundColor: Palette.bg,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Palette.hairline,
    paddingHorizontal: 16,
    height: 52,
    fontFamily: FontFamily,
    fontSize: 15,
    fontWeight: '600',
    color: Palette.ink,
  },
  renameActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  renameGhostBtn: {
    flex: 1,
    height: 50,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Palette.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  renameGhostText: { fontFamily: FontFamily, fontSize: 15, fontWeight: '700', color: Palette.muted },
  renamePrimaryBtn: {
    flex: 1,
    height: 50,
    borderRadius: 16,
    backgroundColor: Palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  renamePrimaryDisabled: { opacity: 0.4 },
  renamePrimaryText: { fontFamily: FontFamily, fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  });
}
