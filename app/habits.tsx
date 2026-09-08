import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProgressRing } from '@/components/progress-ring';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { AppPalette, AppTint, FontFamily } from '@/constants/palette';
import { useAppTheme } from '@/hooks/use-app-theme';
import { usePremium } from '@/hooks/use-premium';
import {
  type Habit,
  type HabitColorKey,
  useHabitProgress,
  useHabitsStore,
} from '@/store/habits-store';

type IoniconName = keyof typeof Ionicons.glyphMap;

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const animateNext = () =>
  LayoutAnimation.configureNext(LayoutAnimation.create(200, 'easeInEaseOut', 'opacity'));

/** Free tier cap — matches the "Up to 3" line on the premium screen. */
const FREE_HABIT_LIMIT = 3;

/* -------------------------------------------------------------------------- */
/* Editor presets                                                             */
/* -------------------------------------------------------------------------- */

const ICON_CHOICES: IoniconName[] = [
  'water-outline',
  'barbell-outline',
  'book-outline',
  'moon-outline',
  'walk-outline',
  'leaf-outline',
  'musical-notes-outline',
  'heart-outline',
];

const COLOR_CHOICES: HabitColorKey[] = ['primary', 'blue', 'green', 'orange', 'pink'];

/** Starting points so a new habit is one tap away from being useful. */
const TEMPLATES: { name: string; icon: IoniconName; colorKey: HabitColorKey; unit: string; step: number; target: number }[] = [
  { name: 'Drink water', icon: 'water-outline', colorKey: 'blue', unit: 'glasses', step: 1, target: 8 },
  { name: 'Exercise', icon: 'barbell-outline', colorKey: 'pink', unit: 'min', step: 15, target: 30 },
  { name: 'Read', icon: 'book-outline', colorKey: 'primary', unit: 'pages', step: 5, target: 20 },
  { name: 'Sleep early', icon: 'moon-outline', colorKey: 'orange', unit: '', step: 1, target: 1 },
];

type Draft = {
  name: string;
  icon: IoniconName;
  colorKey: HabitColorKey;
  unit: string;
  step: number;
  target: number;
};

const BLANK_DRAFT: Draft = {
  name: '',
  icon: 'leaf-outline',
  colorKey: 'primary',
  unit: '',
  step: 1,
  target: 1,
};

function progressText(current: number, target: number, unit: string): string {
  if (!unit) return current >= target ? 'Completed' : 'Not done';
  return `${current} / ${target} ${unit}`;
}

/* -------------------------------------------------------------------------- */
/* Screen                                                                     */
/* -------------------------------------------------------------------------- */

export default function HabitsScreen() {
  const router = useRouter();
  const toast = useToast();
  const { Palette, Tint, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette, Tint), [Palette, Tint]);
  const { isPremium } = usePremium();

  const rows = useHabitProgress();
  const addHabit = useHabitsStore((s) => s.addHabit);
  const updateHabit = useHabitsStore((s) => s.updateHabit);
  const removeHabit = useHabitsStore((s) => s.removeHabit);
  const bumpHabit = useHabitsStore((s) => s.bumpHabit);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Habit | null>(null);
  const [draft, setDraft] = useState<Draft>(BLANK_DRAFT);

  const doneCount = rows.filter((r) => r.done).length;
  const completion = rows.length ? rows.reduce((sum, r) => sum + r.pct, 0) / rows.length : 0;
  const bestStreak = rows.reduce((max, r) => Math.max(max, r.streak), 0);

  const atLimit = !isPremium && rows.length >= FREE_HABIT_LIMIT;

  /** Resolves a stored palette key into the real colors for the active theme. */
  const look = (key: HabitColorKey) => ({
    color: (Palette as unknown as Record<string, string>)[key] ?? Palette.primary,
    tint: (Tint as unknown as Record<string, string>)[key] ?? Tint.primary,
  });

  const openCreate = () => {
    if (atLimit) {
      toast.show(`Free plan tracks up to ${FREE_HABIT_LIMIT} habits. Upgrade for unlimited.`, 'error');
      router.push('/premium');
      return;
    }
    setEditing(null);
    setDraft(BLANK_DRAFT);
    setEditorOpen(true);
  };

  const openEdit = (habit: Habit) => {
    setEditing(habit);
    setDraft({
      name: habit.name,
      icon: habit.icon as IoniconName,
      colorKey: habit.colorKey,
      unit: habit.unit,
      step: habit.step,
      target: habit.target,
    });
    setEditorOpen(true);
  };

  const onSave = () => {
    const name = draft.name.trim();
    if (!name) {
      toast.show('Give the habit a name.', 'error');
      return;
    }
    // A unit-less habit is a simple done/not-done tick.
    const target = draft.unit ? Math.max(1, draft.target) : 1;
    const step = draft.unit ? Math.max(1, draft.step) : 1;
    const payload = { name, icon: draft.icon, colorKey: draft.colorKey, unit: draft.unit.trim(), step, target };

    animateNext();
    if (editing) {
      updateHabit(editing.id, payload);
      toast.success('Habit updated.');
    } else {
      addHabit(payload);
      toast.success('Habit added.');
    }
    setEditorOpen(false);
  };

  const onDelete = () => {
    // The only Pressable that calls onDelete is itself rendered exclusively
    // when `editing` is truthy, so this guard's true branch is unreachable.
    /* v8 ignore start */
    if (!editing) return;
    /* v8 ignore stop */
    animateNext();
    removeHabit(editing.id);
    setEditorOpen(false);
    toast.success('Habit removed.');
  };

  const applyTemplate = (t: (typeof TEMPLATES)[number]) => {
    setDraft({ ...t });
  };

  return (
    <View style={styles.root}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            hitSlop={10}
            onPress={() => router.back()}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}>
            <Ionicons name="chevron-back" size={22} color={Palette.ink} />
          </Pressable>
          <Text style={styles.headerTitle}>Habit Tracker</Text>
          <Pressable
            hitSlop={10}
            onPress={openCreate}
            style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}>
            <Ionicons name="add" size={22} color="#FFFFFF" />
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {rows.length === 0 ? (
            <EmptyState
              icon="leaf-outline"
              title="No habits yet"
              message="Add habits like water, exercise or reading, and track your daily streaks here."
              ctaLabel="Add your first habit"
              onPress={openCreate}
            />
          ) : (
            <>
              {/* Today's completion hero */}
              <View style={styles.hero}>
                <View pointerEvents="none" style={styles.heroBlobTop} />
                <View pointerEvents="none" style={styles.heroBlobBottom} />
                <View style={styles.heroText}>
                  <Text style={styles.heroLabel}>{"Today's Completion"}</Text>
                  <Text style={styles.heroBig}>
                    {doneCount}
                    <Text style={styles.heroBigSmall}> / {rows.length}</Text>
                  </Text>
                  <View style={styles.streakChip}>
                    <Ionicons name="flame" size={14} color="#FFFFFF" />
                    <Text style={styles.streakChipText}>{bestStreak} day streak</Text>
                  </View>
                </View>
                <ProgressRing
                  size={104}
                  thickness={12}
                  progress={completion}
                  color="#FFFFFF"
                  trackColor="rgba(255,255,255,0.28)"
                  holeColor={Palette.primary}>
                  <Text style={styles.ringPct}>{Math.round(completion * 100)}%</Text>
                </ProgressRing>
              </View>

              <Text style={styles.sectionLabel}>Your Habits</Text>
              {rows.map(({ habit, current, target, done, pct, streak }) => {
                const l = look(habit.colorKey);
                return (
                  <Pressable
                    key={habit.id}
                    onPress={() => {
                      animateNext();
                      bumpHabit(habit.id);
                    }}
                    onLongPress={() => openEdit(habit)}
                    delayLongPress={300}
                    android_ripple={{ color: 'rgba(108,77,255,0.06)' }}
                    style={({ pressed }) => [styles.habitCard, pressed && styles.habitPressed]}>
                    <ProgressRing
                      size={56}
                      thickness={5}
                      progress={pct}
                      color={l.color}
                      trackColor={l.tint}>
                      <Ionicons name={habit.icon as IoniconName} size={22} color={l.color} />
                    </ProgressRing>

                    <View style={styles.habitBody}>
                      <Text style={styles.habitName} numberOfLines={1}>
                        {habit.name}
                      </Text>
                      <View style={styles.habitMeta}>
                        <Text style={styles.habitProgress}>
                          {progressText(current, target, habit.unit)}
                        </Text>
                        <Text style={styles.metaDot}>·</Text>
                        <Ionicons name="flame" size={13} color={Palette.orange} />
                        <Text style={styles.habitStreak}>{streak}</Text>
                      </View>
                    </View>

                    <View style={[styles.habitAction, done && { backgroundColor: l.color, borderColor: l.color }]}>
                      <Ionicons name={done ? 'checkmark' : 'add'} size={20} color={done ? '#FFFFFF' : l.color} />
                    </View>
                  </Pressable>
                );
              })}

              <Text style={styles.hint}>Tap to log progress · long-press to edit</Text>

              {atLimit ? (
                <Pressable
                  onPress={() => router.push('/premium')}
                  style={({ pressed }) => [styles.upsell, pressed && styles.pressed]}>
                  <Ionicons name="sparkles" size={16} color={Palette.primary} />
                  <Text style={styles.upsellText}>
                    Free plan tracks {FREE_HABIT_LIMIT} habits — go premium for unlimited
                  </Text>
                </Pressable>
              ) : null}
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      <HabitEditor
        visible={editorOpen}
        draft={draft}
        setDraft={setDraft}
        editing={editing}
        onClose={() => setEditorOpen(false)}
        onSave={onSave}
        onDelete={onDelete}
        onTemplate={applyTemplate}
      />
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Editor sheet                                                               */
/* -------------------------------------------------------------------------- */

function HabitEditor({
  visible,
  draft,
  setDraft,
  editing,
  onClose,
  onSave,
  onDelete,
  onTemplate,
}: {
  visible: boolean;
  draft: Draft;
  setDraft: (d: Draft) => void;
  editing: Habit | null;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
  onTemplate: (t: (typeof TEMPLATES)[number]) => void;
}) {
  const { Palette, Tint } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette, Tint), [Palette, Tint]);
  const patch = (p: Partial<Draft>) => setDraft({ ...draft, ...p });

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetWrap}>
          <View style={styles.sheet}>
            <View style={styles.sheetGrabber} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{editing ? 'Edit habit' : 'New habit'}</Text>
              <Pressable hitSlop={10} onPress={onClose}>
                <Ionicons name="close" size={22} color={Palette.muted} />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.sheetScroll}>
              {!editing ? (
                <>
                  <Text style={styles.fieldLabel}>Quick start</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.templateRow}>
                    {TEMPLATES.map((t) => (
                      <Pressable
                        key={t.name}
                        onPress={() => onTemplate(t)}
                        style={({ pressed }) => [styles.template, pressed && styles.pressed]}>
                        <Ionicons name={t.icon} size={16} color={Palette.primary} />
                        <Text style={styles.templateText}>{t.name}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </>
              ) : null}

              <Text style={styles.fieldLabel}>Name</Text>
              <View style={styles.inputWrap}>
                <TextInput
                  value={draft.name}
                  onChangeText={(v) => patch({ name: v })}
                  placeholder="e.g. Drink water"
                  placeholderTextColor={Palette.subtle}
                  style={styles.input}
                  returnKeyType="done"
                />
              </View>

              <Text style={styles.fieldLabel}>Icon</Text>
              <View style={styles.chipGrid}>
                {ICON_CHOICES.map((ic) => {
                  const active = ic === draft.icon;
                  return (
                    <Pressable
                      key={ic}
                      onPress={() => patch({ icon: ic })}
                      style={[styles.iconChip, active && styles.iconChipActive]}>
                      <Ionicons name={ic} size={20} color={active ? '#FFFFFF' : Palette.muted} />
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>Color</Text>
              <View style={styles.chipGrid}>
                {COLOR_CHOICES.map((key) => {
                  // Every key in the hardcoded COLOR_CHOICES array is guaranteed
                  // to exist on Palette, so this fallback can never trigger.
                  /* v8 ignore start */
                  const color = (Palette as unknown as Record<string, string>)[key] ?? Palette.primary;
                  /* v8 ignore stop */
                  const active = key === draft.colorKey;
                  return (
                    <Pressable
                      key={key}
                      onPress={() => patch({ colorKey: key })}
                      style={[styles.colorChip, { backgroundColor: color }, active && styles.colorChipActive]}>
                      {active ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>Unit (leave empty for a simple daily tick)</Text>
              <View style={styles.inputWrap}>
                <TextInput
                  value={draft.unit}
                  onChangeText={(v) => patch({ unit: v })}
                  placeholder="glasses, min, pages…"
                  placeholderTextColor={Palette.subtle}
                  style={styles.input}
                />
              </View>

              {draft.unit.trim() ? (
                <>
                  <View style={styles.stepperRow}>
                    <Text style={styles.stepperLabel}>Daily target</Text>
                    <Stepper
                      value={`${draft.target}`}
                      onDec={() => patch({ target: Math.max(1, draft.target - 1) })}
                      onInc={() => patch({ target: Math.min(999, draft.target + 1) })}
                    />
                  </View>
                  <View style={styles.stepperRow}>
                    <Text style={styles.stepperLabel}>Per tap</Text>
                    <Stepper
                      value={`${draft.step}`}
                      onDec={() => patch({ step: Math.max(1, draft.step - 1) })}
                      onInc={() => patch({ step: Math.min(100, draft.step + 1) })}
                    />
                  </View>
                </>
              ) : null}
            </ScrollView>

            <View style={styles.sheetFooter}>
              {editing ? (
                <Pressable
                  onPress={onDelete}
                  style={({ pressed }) => [styles.deleteBtn, pressed && styles.pressed]}>
                  <Ionicons name="trash-outline" size={18} color="#E5484D" />
                </Pressable>
              ) : null}
              <Pressable
                onPress={onSave}
                android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
                style={({ pressed }) => [styles.saveBtn, pressed && styles.savePressed]}>
                <Text style={styles.saveText}>{editing ? 'Save changes' : 'Add habit'}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function Stepper({ value, onDec, onInc }: { value: string; onDec: () => void; onInc: () => void }) {
  const { Palette, Tint } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette, Tint), [Palette, Tint]);
  return (
    <View style={styles.stepper}>
      <Pressable onPress={onDec} style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}>
        <Ionicons name="remove" size={18} color={Palette.primary} />
      </Pressable>
      <Text style={styles.stepValue}>{value}</Text>
      <Pressable onPress={onInc} style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}>
        <Ionicons name="add" size={18} color={Palette.primary} />
      </Pressable>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

const CARD_SHADOW = {
  shadowColor: '#3A2E7A',
  shadowOpacity: 0.08,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 8 },
  elevation: 3,
} as const;

function createStyles(Palette: AppPalette, Tint: AppTint) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: Palette.bg },
    safe: { flex: 1 },
    pressed: { opacity: 0.5 },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    iconBtn: {
      width: 42,
      height: 42,
      borderRadius: 14,
      backgroundColor: Palette.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addBtn: {
      width: 42,
      height: 42,
      borderRadius: 14,
      backgroundColor: Palette.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: { fontFamily: FontFamily, fontSize: 19, fontWeight: '800', color: Palette.ink },

    scroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },

    hero: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: Palette.primary,
      borderRadius: 26,
      padding: 22,
      marginBottom: 8,
      overflow: 'hidden',
      shadowColor: Palette.primary,
      shadowOpacity: 0.35,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 14 },
      elevation: 10,
    },
    heroBlobTop: {
      position: 'absolute',
      width: 150,
      height: 150,
      borderRadius: 75,
      backgroundColor: 'rgba(255,255,255,0.14)',
      top: -50,
      right: -30,
    },
    heroBlobBottom: {
      position: 'absolute',
      width: 130,
      height: 130,
      borderRadius: 65,
      backgroundColor: 'rgba(0,0,0,0.08)',
      bottom: -60,
      left: -20,
    },
    heroText: { flex: 1, paddingRight: 12 },
    heroLabel: { fontFamily: FontFamily, fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },
    heroBig: {
      fontFamily: FontFamily,
      fontSize: 40,
      fontWeight: '800',
      color: '#FFFFFF',
      marginVertical: 4,
      letterSpacing: -1,
    },
    heroBigSmall: { fontSize: 22, fontWeight: '700', color: 'rgba(255,255,255,0.8)' },
    streakChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      alignSelf: 'flex-start',
      backgroundColor: 'rgba(255,255,255,0.2)',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 12,
    },
    streakChipText: { fontFamily: FontFamily, fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
    ringPct: { fontFamily: FontFamily, fontSize: 20, fontWeight: '800', color: '#FFFFFF' },

    sectionLabel: {
      fontFamily: FontFamily,
      fontSize: 13,
      fontWeight: '700',
      color: Palette.subtle,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: 20,
      marginBottom: 12,
    },

    habitCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: Palette.card,
      borderRadius: 20,
      padding: 14,
      marginBottom: 12,
      ...CARD_SHADOW,
    },
    habitPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
    habitBody: { flex: 1, marginLeft: 14 },
    habitName: { fontFamily: FontFamily, fontSize: 16, fontWeight: '700', color: Palette.ink },
    habitMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
    habitProgress: { fontFamily: FontFamily, fontSize: 13, fontWeight: '600', color: Palette.muted },
    metaDot: { color: Palette.subtle, fontSize: 13 },
    habitStreak: { fontFamily: FontFamily, fontSize: 13, fontWeight: '700', color: Palette.orange },

    habitAction: {
      width: 40,
      height: 40,
      borderRadius: 13,
      backgroundColor: Palette.bg,
      borderWidth: 1.5,
      borderColor: Palette.hairline,
      alignItems: 'center',
      justifyContent: 'center',
    },

    hint: {
      fontFamily: FontFamily,
      fontSize: 12,
      fontWeight: '600',
      color: Palette.subtle,
      textAlign: 'center',
      marginTop: 6,
    },

    upsell: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: Tint.primary,
      borderRadius: 16,
      padding: 14,
      marginTop: 18,
    },
    upsellText: { flex: 1, fontFamily: FontFamily, fontSize: 13, fontWeight: '700', color: Palette.primary },

    /* editor sheet */
    sheetBackdrop: { flex: 1, backgroundColor: 'rgba(16,14,36,0.45)', justifyContent: 'flex-end' },
    sheetWrap: { width: '100%' },
    sheet: {
      backgroundColor: Palette.bg,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: 20,
      maxHeight: '88%',
    },
    sheetGrabber: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: Palette.hairline,
      marginBottom: 12,
    },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    sheetTitle: { fontFamily: FontFamily, fontSize: 20, fontWeight: '800', color: Palette.ink },
    sheetScroll: { paddingBottom: 12 },

    fieldLabel: {
      fontFamily: FontFamily,
      fontSize: 13,
      fontWeight: '700',
      color: Palette.muted,
      marginTop: 16,
      marginBottom: 8,
    },
    inputWrap: {
      backgroundColor: Palette.card,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: Palette.hairline,
      paddingHorizontal: 14,
      height: 52,
      justifyContent: 'center',
    },
    input: { fontFamily: FontFamily, fontSize: 15, fontWeight: '600', color: Palette.ink },

    templateRow: { gap: 8, paddingRight: 4 },
    template: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: Tint.primary,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    templateText: { fontFamily: FontFamily, fontSize: 13, fontWeight: '700', color: Palette.primary },

    chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    iconChip: {
      width: 46,
      height: 46,
      borderRadius: 15,
      backgroundColor: Palette.card,
      borderWidth: 1.5,
      borderColor: Palette.hairline,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconChipActive: { backgroundColor: Palette.primary, borderColor: Palette.primary },
    colorChip: {
      width: 46,
      height: 46,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
    },
    colorChipActive: { borderWidth: 3, borderColor: Palette.ink },

    stepperRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: Palette.card,
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 12,
      marginTop: 12,
    },
    stepperLabel: { fontFamily: FontFamily, fontSize: 15, fontWeight: '700', color: Palette.ink },
    stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    stepBtn: {
      width: 34,
      height: 34,
      borderRadius: 11,
      backgroundColor: Tint.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepValue: {
      fontFamily: FontFamily,
      fontSize: 16,
      fontWeight: '800',
      color: Palette.ink,
      minWidth: 44,
      textAlign: 'center',
    },

    sheetFooter: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
    deleteBtn: {
      width: 54,
      height: 54,
      borderRadius: 18,
      backgroundColor: '#FDE7E8',
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveBtn: {
      flex: 1,
      height: 54,
      borderRadius: 18,
      backgroundColor: Palette.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    savePressed: { backgroundColor: Palette.primaryDark, transform: [{ scale: 0.99 }] },
    saveText: { fontFamily: FontFamily, fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  });
}
