import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * ai-assistant.tsx talks to two real modules at its persistence boundary —
 * @/lib/db/chat-repository (SQLite, already unit-tested) and
 * @/lib/services/ai (the Groq HTTP call) — both mocked here so no real I/O
 * happens. @/store/auth-store is mocked because the real module drags in
 * SQLite/Firebase at import time; @/lib/storage because useAppTheme's
 * theme-store persists via real AsyncStorage otherwise.
 *
 * react-native-reanimated is mocked because its real import pulls in a
 * native turbo module that doesn't exist under jsdom (same reason
 * components/hello-wave.test.tsx mocks it).
 *
 * react-native's Alert is mocked (partial mock, everything else passed
 * through) because react-native-web's Alert.alert() is a documented no-op —
 * without overriding it, the "delete conversation" confirmation could never
 * be exercised.
 *
 * @expo/vector-icons renders `<span data-icon data-size>` instead of `null`
 * so icon-only controls (header buttons, mic/send) can be targeted; clicking
 * that inner span still reaches the ancestor Pressable since onPress is a
 * plain bubbling React prop.
 */
vi.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name, size }: any) => <span data-icon={name} data-size={size} />,
}));

vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}));

vi.mock('react-native-reanimated', () => ({
  default: { View: (props: any) => <div {...props} /> },
  useAnimatedKeyboard: () => ({ height: { value: 0 } }),
  useAnimatedStyle: (fn: any) => fn(),
}));

const alertMocks = vi.hoisted(() => ({ confirmDestructive: true }));
vi.mock('react-native', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-native')>();
  return {
    ...actual,
    Alert: {
      alert: (_title: string, _message?: string, buttons?: { text: string; style?: string; onPress?: () => void }[]) => {
        if (!alertMocks.confirmDestructive) return;
        buttons?.find((b) => b.style === 'destructive')?.onPress?.();
      },
    },
  };
});

const routerMocks = vi.hoisted(() => ({
  push: vi.fn(),
  back: vi.fn(),
  replace: vi.fn(),
  params: {} as { seed?: string },
}));
vi.mock('expo-router', () => ({
  useRouter: () => ({ push: routerMocks.push, back: routerMocks.back, replace: routerMocks.replace }),
  useLocalSearchParams: () => routerMocks.params,
}));

vi.mock('@/lib/storage', () => ({
  zustandStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
}));

const mocks = vi.hoisted(() => ({
  authState: { fbUser: { uid: 'u1' } as { uid: string } | null },
}));
vi.mock('@/store/auth-store', () => ({
  useAuthStore: Object.assign((selector: (s: typeof mocks.authState) => unknown) => selector(mocks.authState), {
    getState: () => mocks.authState,
  }),
}));

let msgSeq = 0;
const chatRepoMocks = vi.hoisted(() => ({
  pruneEmptyConversations: vi.fn(async () => {}),
  createConversation: vi.fn(async (uid: string) => ({ id: 'c1', uid, title: 'New chat', createdAt: 'a', updatedAt: 'a' })),
  getLatestConversation: vi.fn(async () => null as any),
  getMessages: vi.fn(async () => [] as any[]),
  renameConversation: vi.fn(async () => {}),
  deriveTitle: vi.fn((t: string) => t.slice(0, 20)),
  listConversations: vi.fn(async () => [] as any[]),
  deleteConversation: vi.fn(async () => {}),
  addMessage: vi.fn(async (input: any) => ({ id: `m-${Date.now()}-${Math.random()}`, ...input, createdAt: 'a' })),
}));
vi.mock('@/lib/db/chat-repository', () => chatRepoMocks);

const aiMocks = vi.hoisted(() => ({ configured: true, chatWithGroq: vi.fn(async () => 'Mock AI reply.') }));
vi.mock('@/lib/services/ai', () => ({
  get isAiConfigured() {
    return aiMocks.configured;
  },
  AI_SYSTEM_PROMPT: 'test-system-prompt',
  chatWithGroq: (...args: any[]) => aiMocks.chatWithGroq(...args),
}));

import AiAssistantScreen from './ai-assistant';

/* -------------------------------------------------------------------------- */
/* Fixtures + helpers                                                        */
/* -------------------------------------------------------------------------- */

function makeMessage(overrides: Partial<any> = {}) {
  msgSeq += 1;
  return {
    id: `m${msgSeq}`,
    conversationId: 'c1',
    role: 'user',
    text: 'Hello',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeSummary(overrides: Partial<any> = {}) {
  return {
    id: 'c1',
    uid: 'u1',
    title: 'Old chat',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    messageCount: 2,
    preview: 'last message',
    ...overrides,
  };
}

function iconEl(name: string, size: number): HTMLElement {
  const el = document.querySelector(`[data-icon="${name}"][data-size="${size}"]`);
  if (!el) throw new Error(`icon ${name}@${size} not found`);
  return el as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  msgSeq = 0;
  mocks.authState.fbUser = { uid: 'u1' };
  routerMocks.params = {};
  alertMocks.confirmDestructive = true;
  aiMocks.configured = true;
  aiMocks.chatWithGroq = vi.fn(async () => 'Mock AI reply.');
  chatRepoMocks.pruneEmptyConversations.mockResolvedValue(undefined);
  // .mockReset() (not just the .mockClear() above) before re-establishing the
  // default: some tests queue extra .mockResolvedValueOnce/.mockImplementationOnce
  // values on these two mocks and don't always consume every queued value in
  // the same test — clearAllMocks leaves unconsumed "Once" entries queued, so
  // without this they'd leak into whichever test runs next.
  chatRepoMocks.createConversation.mockReset().mockImplementation(async (uid: string) => ({
    id: 'c1',
    uid,
    title: 'New chat',
    createdAt: 'a',
    updatedAt: 'a',
  }));
  chatRepoMocks.getLatestConversation.mockResolvedValue(null);
  chatRepoMocks.getMessages.mockResolvedValue([]);
  chatRepoMocks.renameConversation.mockResolvedValue(undefined);
  chatRepoMocks.deriveTitle.mockImplementation((t: string) => t.slice(0, 20));
  chatRepoMocks.listConversations.mockReset().mockResolvedValue([]);
  chatRepoMocks.deleteConversation.mockResolvedValue(undefined);
  chatRepoMocks.addMessage.mockImplementation(async (input: any) => makeMessage(input));
});

/* -------------------------------------------------------------------------- */
/* Startup / history load                                                    */
/* -------------------------------------------------------------------------- */

describe('AiAssistantScreen — startup', () => {
  it('signed out: skips persistence entirely and shows the greeting', async () => {
    mocks.authState.fbUser = null;
    render(<AiAssistantScreen />);
    await screen.findByText(/What would you like to do/);
    expect(chatRepoMocks.getLatestConversation).not.toHaveBeenCalled();
    expect(chatRepoMocks.createConversation).not.toHaveBeenCalled();
  });

  it('no existing conversation: creates a fresh one and shows the greeting', async () => {
    render(<AiAssistantScreen />);
    await screen.findByText(/What would you like to do/);
    expect(chatRepoMocks.getLatestConversation).toHaveBeenCalledWith('u1');
    expect(chatRepoMocks.createConversation).toHaveBeenCalledWith('u1');
    expect(chatRepoMocks.getMessages).not.toHaveBeenCalled();
  });

  it('resumes the latest conversation, rendering its stored messages (including a plan)', async () => {
    chatRepoMocks.getLatestConversation.mockResolvedValue({
      id: 'c9',
      uid: 'u1',
      title: 'Resumed',
      createdAt: 'a',
      updatedAt: 'a',
    });
    chatRepoMocks.getMessages.mockResolvedValue([
      makeMessage({ role: 'user', text: 'Give me a study plan' }),
      makeMessage({
        role: 'ai',
        text: "Here's a fresh 7-day study plan tailored to your subjects:",
        plan: [{ day: 'Day 1', detail: 'Mathematics — 3 hours' }],
      }),
    ]);
    render(<AiAssistantScreen />);
    expect(await screen.findByText('Give me a study plan')).toBeTruthy();
    expect(screen.getByText("Here's a fresh 7-day study plan tailored to your subjects:")).toBeTruthy();
    expect(screen.getByText('Day 1')).toBeTruthy();
    expect(screen.getByText('Mathematics — 3 hours')).toBeTruthy();
    expect(chatRepoMocks.getMessages).toHaveBeenCalledWith('c9');
  });

  it('a seed param starts a fresh conversation and auto-sends the seed text', async () => {
    routerMocks.params = { seed: 'Build me a revision plan' };
    render(<AiAssistantScreen />);

    expect(await screen.findByText('Build me a revision plan')).toBeTruthy();
    expect(chatRepoMocks.pruneEmptyConversations).toHaveBeenCalledWith('u1');
    expect(chatRepoMocks.createConversation).toHaveBeenCalledWith('u1');
    expect(chatRepoMocks.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'user', text: 'Build me a revision plan' }),
    );

    await screen.findByText('Mock AI reply.');
    expect(aiMocks.chatWithGroq).toHaveBeenCalledWith(
      expect.arrayContaining([{ role: 'system', content: 'test-system-prompt' }]),
      expect.anything(),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Sending messages                                                          */
/* -------------------------------------------------------------------------- */

describe('AiAssistantScreen — sending', () => {
  it('typing and pressing send persists the user message, calls Groq, and shows the reply', async () => {
    render(<AiAssistantScreen />);
    await screen.findByText(/What would you like to do/);

    const input = screen.getByPlaceholderText('Type a message...');
    fireEvent.change(input, { target: { value: 'What should I study today?' } });
    fireEvent.click(iconEl('send', 18));

    expect(await screen.findByText('What should I study today?')).toBeTruthy();
    expect((input as HTMLTextAreaElement).value).toBe('');
    expect(chatRepoMocks.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'user', text: 'What should I study today?' }),
    );

    await screen.findByText('Mock AI reply.');
    expect(chatRepoMocks.addMessage).toHaveBeenCalledWith(expect.objectContaining({ role: 'ai', text: 'Mock AI reply.' }));
    // First message of a brand-new thread names it after the opening message.
    expect(chatRepoMocks.renameConversation).toHaveBeenCalledWith(
      'c1',
      'What should I study today?'.slice(0, 20),
    );
  });

  it('does not rename the conversation again on a second message', async () => {
    render(<AiAssistantScreen />);
    await screen.findByText(/What would you like to do/);

    fireEvent.change(screen.getByPlaceholderText('Type a message...'), { target: { value: 'First' } });
    fireEvent.click(iconEl('send', 18));
    await screen.findByText('Mock AI reply.');
    chatRepoMocks.renameConversation.mockClear();

    fireEvent.change(screen.getByPlaceholderText('Type a message...'), { target: { value: 'Second' } });
    fireEvent.click(iconEl('send', 18));
    await screen.findByText('Second');

    expect(chatRepoMocks.renameConversation).not.toHaveBeenCalled();
  });

  it('tapping a suggestion chip sends its label as the message', async () => {
    render(<AiAssistantScreen />);
    await screen.findByText(/What would you like to do/);
    fireEvent.click(screen.getByText('Study Tips'));
    expect(await screen.findByText('Study Tips')).toBeTruthy();
    expect(chatRepoMocks.addMessage).toHaveBeenCalledWith(expect.objectContaining({ role: 'user', text: 'Study Tips' }));
  });

  it('falls back to a friendly error message when the Groq call fails', async () => {
    aiMocks.chatWithGroq.mockRejectedValueOnce(new Error('network down'));
    render(<AiAssistantScreen />);
    await screen.findByText(/What would you like to do/);

    fireEvent.change(screen.getByPlaceholderText('Type a message...'), { target: { value: 'Hello there' } });
    fireEvent.click(iconEl('send', 18));

    expect(
      await screen.findByText("Sorry, I couldn't reach the assistant just now. Please check your connection and try again."),
    ).toBeTruthy();
  });
});

/* -------------------------------------------------------------------------- */
/* Offline canned replies (no Groq key configured)                          */
/* -------------------------------------------------------------------------- */

describe('AiAssistantScreen — isAiConfigured: false', () => {
  beforeEach(() => {
    aiMocks.configured = false;
  });

  it('answers a "timetable" suggestion with the canned reply, without calling Groq', async () => {
    render(<AiAssistantScreen />);
    await screen.findByText(/What would you like to do/);
    fireEvent.click(screen.getByText('Generate Timetable'));

    expect(
      await screen.findByText("Done! I've generated a balanced weekly timetable and spread your sessions evenly across the week."),
    ).toBeTruthy();
    expect(aiMocks.chatWithGroq).not.toHaveBeenCalled();
  });

  it('a "plan" prompt returns the canned 7-day study plan with day rows', async () => {
    render(<AiAssistantScreen />);
    await screen.findByText(/What would you like to do/);
    fireEvent.change(screen.getByPlaceholderText('Type a message...'), { target: { value: 'exam plan please' } });
    fireEvent.click(iconEl('send', 18));

    await screen.findByText("Here's a fresh 7-day study plan tailored to your subjects:");
    expect(screen.getByText('Day 1')).toBeTruthy();
    expect(screen.getByText('Mathematics — 3 hours')).toBeTruthy();
    expect(screen.getByText('Day 7')).toBeTruthy();
  });
});

/* -------------------------------------------------------------------------- */
/* History sheet                                                            */
/* -------------------------------------------------------------------------- */

describe('AiAssistantScreen — history sheet', () => {
  it('shows an empty message when there are no saved chats', async () => {
    render(<AiAssistantScreen />);
    await screen.findByText(/What would you like to do/);
    fireEvent.click(screen.getByLabelText('Chat history'));
    expect(await screen.findByText('No saved chats yet. Your conversations appear here automatically.')).toBeTruthy();
    expect(chatRepoMocks.listConversations).toHaveBeenCalledWith('u1');
  });

  it('lists saved conversations and opens one on tap', async () => {
    chatRepoMocks.listConversations.mockResolvedValue([
      makeSummary({ id: 'c-a', title: 'Chat A', preview: 'hi there', messageCount: 3 }),
      makeSummary({ id: 'c-b', title: 'Chat B', preview: '', messageCount: 0 }),
    ]);
    chatRepoMocks.getMessages.mockImplementation(async (id: string) =>
      id === 'c-a' ? [makeMessage({ role: 'user', text: 'Opened chat A' })] : [],
    );

    render(<AiAssistantScreen />);
    await screen.findByText(/What would you like to do/);
    fireEvent.click(screen.getByLabelText('Chat history'));

    expect(await screen.findByText('Chat A')).toBeTruthy();
    expect(screen.getByText('hi there')).toBeTruthy();
    expect(screen.getByText('Chat B')).toBeTruthy();
    expect(screen.getByText('No messages yet')).toBeTruthy();

    fireEvent.click(screen.getByText('Chat A'));
    expect(await screen.findByText('Opened chat A')).toBeTruthy();
    expect(chatRepoMocks.getMessages).toHaveBeenCalledWith('c-a');
  });

  it('"New chat" starts a new conversation when the current thread has messages', async () => {
    render(<AiAssistantScreen />);
    await screen.findByText(/What would you like to do/);
    fireEvent.change(screen.getByPlaceholderText('Type a message...'), { target: { value: 'Hello' } });
    fireEvent.click(iconEl('send', 18));
    await screen.findByText('Mock AI reply.');

    chatRepoMocks.createConversation.mockClear();
    fireEvent.click(screen.getByLabelText('Chat history'));
    await screen.findByText('New chat');
    fireEvent.click(screen.getByText('New chat'));

    await waitFor(() => expect(chatRepoMocks.createConversation).toHaveBeenCalledWith('u1'));
  });

  it('"New chat" is a no-op when already on a fresh blank thread', async () => {
    render(<AiAssistantScreen />);
    await screen.findByText(/What would you like to do/);

    chatRepoMocks.createConversation.mockClear();
    fireEvent.click(screen.getByLabelText('Chat history'));
    await screen.findByText('New chat');
    fireEvent.click(screen.getByText('New chat'));

    expect(chatRepoMocks.createConversation).not.toHaveBeenCalled();
  });

  it('deleting a chat removes it and refreshes the list', async () => {
    chatRepoMocks.listConversations
      .mockResolvedValueOnce([makeSummary({ id: 'c-a', title: 'Chat A' })])
      .mockResolvedValueOnce([]);

    render(<AiAssistantScreen />);
    await screen.findByText(/What would you like to do/);
    fireEvent.click(screen.getByLabelText('Chat history'));
    await screen.findByText('Chat A');

    fireEvent.click(screen.getByLabelText('Delete Chat A'));
    expect(chatRepoMocks.deleteConversation).toHaveBeenCalledWith('c-a');
    await screen.findByText('No saved chats yet. Your conversations appear here automatically.');
  });
});

/* -------------------------------------------------------------------------- */
/* Header navigation                                                        */
/* -------------------------------------------------------------------------- */

describe('AiAssistantScreen — header', () => {
  it('back button navigates back', async () => {
    render(<AiAssistantScreen />);
    await screen.findByText(/What would you like to do/);
    fireEvent.click(iconEl('chevron-back', 22));
    expect(routerMocks.back).toHaveBeenCalledTimes(1);
  });

  it('the generator icon navigates to /ai-schedule', async () => {
    render(<AiAssistantScreen />);
    await screen.findByText(/What would you like to do/);
    fireEvent.click(screen.getByLabelText('AI generator'));
    expect(routerMocks.push).toHaveBeenCalledWith('/ai-schedule');
  });
});

/* -------------------------------------------------------------------------- */
/* formatWhen — history row timestamps                                      */
/* -------------------------------------------------------------------------- */

describe('AiAssistantScreen — formatWhen', () => {
  it('shows a time-of-day for a conversation updated today', async () => {
    chatRepoMocks.listConversations.mockResolvedValue([
      makeSummary({ id: 'c-today', title: 'Today chat', updatedAt: new Date().toISOString() }),
    ]);
    render(<AiAssistantScreen />);
    await screen.findByText(/What would you like to do/);
    fireEvent.click(screen.getByLabelText('Chat history'));
    await screen.findByText('Today chat');
    // Expect an AM/PM time string rather than a bare month/day fallback.
    expect(await screen.findByText(/\d{1,2}:\d{2}\s?(AM|PM)/i)).toBeTruthy();
  });

  it('shows "Yesterday" for a conversation updated the day before', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    chatRepoMocks.listConversations.mockResolvedValue([
      makeSummary({ id: 'c-yday', title: 'Yesterday chat', updatedAt: yesterday.toISOString() }),
    ]);
    render(<AiAssistantScreen />);
    await screen.findByText(/What would you like to do/);
    fireEvent.click(screen.getByLabelText('Chat history'));
    await screen.findByText('Yesterday chat');
    // Anchored to the meta line's "Yesterday · N messages" text — a bare
    // /Yesterday/ regex also matches the row's own "Yesterday chat" title,
    // and the meta line itself is one combined text node (formatWhen output,
    // separator, and count all render as sibling text within the same Text
    // element), so an exact 'Yesterday' match finds neither.
    expect(await screen.findByText(/^Yesterday ·/)).toBeTruthy();
  });
});

/* -------------------------------------------------------------------------- */
/* Offline canned replies — remaining branches of aiReply()                 */
/* -------------------------------------------------------------------------- */

describe('AiAssistantScreen — isAiConfigured: false (remaining branches)', () => {
  beforeEach(() => {
    aiMocks.configured = false;
  });

  it('answers an "Optimize Schedule" tap with the optimize canned reply', async () => {
    render(<AiAssistantScreen />);
    await screen.findByText(/What would you like to do/);
    fireEvent.click(screen.getByText('Optimize Schedule'));
    // A longer timeout than the 1000ms default: under the full suite's
    // parallel worker load this async send/reply round trip has been
    // observed to occasionally take longer than 1000ms even though it does
    // no real I/O — it passes reliably in isolation.
    expect(
      await screen.findByText(
        "I've optimized your schedule — reduced back-to-back classes and added short breaks between study blocks.",
        {},
        { timeout: 3000 },
      ),
    ).toBeTruthy();
  });

  it('answers a "Study Tips" tap with the pomodoro canned reply', async () => {
    render(<AiAssistantScreen />);
    await screen.findByText(/What would you like to do/);
    fireEvent.click(screen.getByText('Study Tips'));
    // See the timeout note in the "Optimize Schedule" test above.
    expect(
      await screen.findByText(
        'Try the Pomodoro technique: 25 minutes focused study, 5 minutes rest. Review notes within 24 hours to boost retention.',
        {},
        { timeout: 3000 },
      ),
    ).toBeTruthy();
  });

  it('answers an "exam" prompt (without the word "plan") with the study plan', async () => {
    render(<AiAssistantScreen />);
    await screen.findByText(/What would you like to do/);
    fireEvent.change(screen.getByPlaceholderText('Type a message...'), { target: { value: 'when is the exam?' } });
    fireEvent.click(iconEl('send', 18));
    expect(await screen.findByText("Here's a fresh 7-day study plan tailored to your subjects:")).toBeTruthy();
  });

  it('falls back to the generic reply when no keyword matches', async () => {
    render(<AiAssistantScreen />);
    await screen.findByText(/What would you like to do/);
    fireEvent.change(screen.getByPlaceholderText('Type a message...'), { target: { value: 'asdf qwerty' } });
    fireEvent.click(iconEl('send', 18));
    expect(
      await screen.findByText("Got it! I'll help you with that. Could you share a little more detail so I can tailor the plan?"),
    ).toBeTruthy();
  });
});

/* -------------------------------------------------------------------------- */
/* Typing indicator                                                          */
/* -------------------------------------------------------------------------- */

describe('AiAssistantScreen — typing indicator', () => {
  it('shows a typing indicator while the reply is in flight, then replaces it with the reply', async () => {
    let resolveReply!: (v: string) => void;
    aiMocks.chatWithGroq.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveReply = resolve;
        }),
    );
    render(<AiAssistantScreen />);
    await screen.findByText(/What would you like to do/);
    fireEvent.change(screen.getByPlaceholderText('Type a message...'), { target: { value: 'Hello' } });
    fireEvent.click(iconEl('send', 18));
    await screen.findByText('Hello');

    await waitFor(() => {
      const avatars = Array.from(document.querySelectorAll('[data-icon="sparkles"][data-size="14"]'));
      const hasEmptyBubble = avatars.some((icon) => {
        const bubble = icon.parentElement?.nextElementSibling as HTMLElement | null;
        return bubble != null && bubble.textContent === '';
      });
      expect(hasEmptyBubble).toBe(true);
    });

    resolveReply('Delayed reply');
    expect(await screen.findByText('Delayed reply')).toBeTruthy();

    // Once the reply lands, the empty (typing) bubble is gone.
    const avatarsAfter = Array.from(document.querySelectorAll('[data-icon="sparkles"][data-size="14"]'));
    const stillHasEmptyBubble = avatarsAfter.some((icon) => {
      const bubble = icon.parentElement?.nextElementSibling as HTMLElement | null;
      return bubble != null && bubble.textContent === '';
    });
    expect(stillHasEmptyBubble).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Persistence error paths — every catch block degrades gracefully           */
/* -------------------------------------------------------------------------- */

describe('AiAssistantScreen — persistence failures', () => {
  it('recovers from a failed history load: still greets, and a later send creates a fresh conversation', async () => {
    chatRepoMocks.getLatestConversation.mockRejectedValueOnce(new Error('read failed'));
    render(<AiAssistantScreen />);
    await screen.findByText(/What would you like to do/);
    // The load's catch block ran without ever assigning a conversation id, so
    // ensureConversation() must create one from scratch on the next send.
    chatRepoMocks.createConversation.mockClear();
    fireEvent.change(screen.getByPlaceholderText('Type a message...'), { target: { value: 'Hello again' } });
    fireEvent.click(iconEl('send', 18));
    expect(await screen.findByText('Hello again')).toBeTruthy();
    await waitFor(() => expect(chatRepoMocks.createConversation).toHaveBeenCalledWith('u1'));
  });

  it('signed out: a sent message is shown locally without ever touching persistence', async () => {
    mocks.authState.fbUser = null;
    render(<AiAssistantScreen />);
    await screen.findByText(/What would you like to do/);
    fireEvent.change(screen.getByPlaceholderText('Type a message...'), { target: { value: 'Hi there' } });
    fireEvent.click(iconEl('send', 18));
    expect(await screen.findByText('Hi there')).toBeTruthy();
    expect(chatRepoMocks.addMessage).not.toHaveBeenCalled();
    expect(chatRepoMocks.createConversation).not.toHaveBeenCalled();
    // The chat still works even though nothing was persisted.
    expect(await screen.findByText('Mock AI reply.')).toBeTruthy();
  });

  it('falls back to showing the user message locally when saving it fails', async () => {
    chatRepoMocks.addMessage.mockRejectedValueOnce(new Error('write failed'));
    render(<AiAssistantScreen />);
    await screen.findByText(/What would you like to do/);
    fireEvent.change(screen.getByPlaceholderText('Type a message...'), { target: { value: 'Save me' } });
    fireEvent.click(iconEl('send', 18));
    expect(await screen.findByText('Save me')).toBeTruthy();
    expect(await screen.findByText('Mock AI reply.')).toBeTruthy();
  });

  it('still completes the send when renaming the new conversation fails', async () => {
    chatRepoMocks.renameConversation.mockRejectedValueOnce(new Error('rename failed'));
    render(<AiAssistantScreen />);
    await screen.findByText(/What would you like to do/);
    fireEvent.change(screen.getByPlaceholderText('Type a message...'), { target: { value: 'Rename this' } });
    fireEvent.click(iconEl('send', 18));
    expect(await screen.findByText('Mock AI reply.')).toBeTruthy();
    expect(chatRepoMocks.renameConversation).toHaveBeenCalled();
  });

  it('shows the empty state (instead of spinning forever) when refreshing history fails', async () => {
    chatRepoMocks.listConversations.mockRejectedValueOnce(new Error('list failed'));
    render(<AiAssistantScreen />);
    await screen.findByText(/What would you like to do/);
    fireEvent.click(screen.getByLabelText('Chat history'));
    expect(await screen.findByText('No saved chats yet. Your conversations appear here automatically.')).toBeTruthy();
  });

  it('does not surface an error message when the request is aborted by unmounting', async () => {
    aiMocks.chatWithGroq.mockImplementation(
      (_payload: unknown, signal: AbortSignal) =>
        new Promise<string>((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            const err = new Error('Aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    );
    const { unmount } = render(<AiAssistantScreen />);
    await screen.findByText(/What would you like to do/);
    fireEvent.change(screen.getByPlaceholderText('Type a message...'), { target: { value: 'Hello' } });
    fireEvent.click(iconEl('send', 18));
    await screen.findByText('Hello');

    unmount();
    await new Promise((r) => setTimeout(r, 0));

    expect(chatRepoMocks.addMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ role: 'ai', text: expect.stringContaining("couldn't reach") }),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Cancelled (stale) history loads                                          */
/* -------------------------------------------------------------------------- */

describe('AiAssistantScreen — cancelled history loads', () => {
  it('ignores a stale non-seed history load if the screen unmounts first', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let resolveExisting!: (v: unknown) => void;
    chatRepoMocks.getLatestConversation.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveExisting = resolve;
        }),
    );
    const { unmount } = render(<AiAssistantScreen />);
    unmount();
    resolveExisting(null);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('ignores a stale seeded history load if the screen unmounts first', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    routerMocks.params = { seed: 'Build me a plan' };
    let resolvePrune!: () => void;
    chatRepoMocks.pruneEmptyConversations.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolvePrune = resolve;
        }),
    );
    const { unmount } = render(<AiAssistantScreen />);
    unmount();
    resolvePrune();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

/* -------------------------------------------------------------------------- */
/* History sheet — guard branches and remaining catch blocks                */
/* -------------------------------------------------------------------------- */

describe('AiAssistantScreen — history sheet guards', () => {
  it('signed out: opening history never calls listConversations, and "New chat" is a no-op', async () => {
    mocks.authState.fbUser = null;
    render(<AiAssistantScreen />);
    await screen.findByText(/What would you like to do/);
    fireEvent.click(screen.getByLabelText('Chat history'));
    await screen.findByText('New chat');
    expect(chatRepoMocks.listConversations).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('New chat'));
    expect(chatRepoMocks.pruneEmptyConversations).not.toHaveBeenCalled();
  });

  it('"New chat" is a no-op while a reply is in flight', async () => {
    let resolveReply!: (v: string) => void;
    aiMocks.chatWithGroq.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveReply = resolve;
        }),
    );
    render(<AiAssistantScreen />);
    await screen.findByText(/What would you like to do/);
    fireEvent.change(screen.getByPlaceholderText('Type a message...'), { target: { value: 'Hello' } });
    fireEvent.click(iconEl('send', 18));
    await screen.findByText('Hello');

    chatRepoMocks.createConversation.mockClear();
    fireEvent.click(screen.getByLabelText('Chat history'));
    await screen.findByText('New chat');
    fireEvent.click(screen.getByText('New chat'));
    expect(chatRepoMocks.pruneEmptyConversations).not.toHaveBeenCalled();

    resolveReply('Mock AI reply.');
    await screen.findByText('Mock AI reply.');
  });

  it('surfaces an error and stops without resetting messages when starting a new chat fails', async () => {
    render(<AiAssistantScreen />);
    await screen.findByText(/What would you like to do/);
    fireEvent.change(screen.getByPlaceholderText('Type a message...'), { target: { value: 'Keep me' } });
    fireEvent.click(iconEl('send', 18));
    await screen.findByText('Mock AI reply.');

    chatRepoMocks.pruneEmptyConversations.mockRejectedValueOnce(new Error('prune failed'));
    fireEvent.click(screen.getByLabelText('Chat history'));
    await screen.findByText('New chat');
    fireEvent.click(screen.getByText('New chat'));

    await waitFor(() => expect(chatRepoMocks.pruneEmptyConversations).toHaveBeenCalled());
    // The failed attempt never cleared the thread.
    expect(screen.getByText('Keep me')).toBeTruthy();
  });

  it('opening a conversation is a no-op while a reply is in flight', async () => {
    let resolveReply!: (v: string) => void;
    aiMocks.chatWithGroq.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveReply = resolve;
        }),
    );
    chatRepoMocks.listConversations.mockResolvedValue([makeSummary({ id: 'c-other', title: 'Other chat' })]);
    render(<AiAssistantScreen />);
    await screen.findByText(/What would you like to do/);
    fireEvent.change(screen.getByPlaceholderText('Type a message...'), { target: { value: 'Hello' } });
    fireEvent.click(iconEl('send', 18));
    await screen.findByText('Hello');

    fireEvent.click(screen.getByLabelText('Chat history'));
    await screen.findByText('Other chat');
    chatRepoMocks.getMessages.mockClear();
    fireEvent.click(screen.getByText('Other chat'));
    expect(chatRepoMocks.getMessages).not.toHaveBeenCalledWith('c-other');

    resolveReply('Mock AI reply.');
    await screen.findByText('Mock AI reply.');
  });

  it('reports and recovers when opening a conversation fails to load its messages', async () => {
    chatRepoMocks.listConversations.mockResolvedValue([makeSummary({ id: 'c-broken', title: 'Broken chat' })]);
    chatRepoMocks.getMessages.mockImplementation(async (id: string) => {
      if (id === 'c-broken') throw new Error('load failed');
      return [];
    });
    render(<AiAssistantScreen />);
    await screen.findByText(/What would you like to do/);
    fireEvent.click(screen.getByLabelText('Chat history'));
    await screen.findByText('Broken chat');
    fireEvent.click(screen.getByText('Broken chat'));

    // The screen recovers (loading clears) and the greeting is still there —
    // the failed switch never touched conversationIdRef or messages.
    expect(await screen.findByText(/What would you like to do/)).toBeTruthy();
  });
});

/* -------------------------------------------------------------------------- */
/* Deleting conversations — fallback branches                               */
/* -------------------------------------------------------------------------- */

describe('AiAssistantScreen — deleting conversations', () => {
  it('signed out mid-session: deleting a chat is a no-op', async () => {
    chatRepoMocks.listConversations.mockResolvedValue([makeSummary({ id: 'c-a', title: 'Chat A' })]);
    render(<AiAssistantScreen />);
    await screen.findByText(/What would you like to do/);
    fireEvent.click(screen.getByLabelText('Chat history'));
    await screen.findByText('Chat A');

    // Simulate the session ending without unmounting or re-opening the sheet
    // (which would reset `history` to null and hide the row); force a
    // re-render via an unrelated state update instead.
    mocks.authState.fbUser = null;
    fireEvent.change(screen.getByPlaceholderText('Type a message...'), { target: { value: ' ' } });

    fireEvent.click(screen.getByLabelText('Delete Chat A'));
    expect(chatRepoMocks.deleteConversation).not.toHaveBeenCalled();
  });

  it('deleting the active conversation falls back to the next one in the list', async () => {
    chatRepoMocks.listConversations
      .mockResolvedValueOnce([makeSummary({ id: 'c1', title: 'Active chat' }), makeSummary({ id: 'c2', title: 'Other chat' })])
      .mockResolvedValueOnce([makeSummary({ id: 'c2', title: 'Other chat' })]);
    chatRepoMocks.getMessages.mockImplementation(async (id: string) =>
      id === 'c2' ? [makeMessage({ role: 'ai', text: 'Hello from c2' })] : [],
    );

    render(<AiAssistantScreen />);
    await screen.findByText(/What would you like to do/);
    // Default flow (no seed, no existing conversation) creates conversation "c1".
    fireEvent.click(screen.getByLabelText('Chat history'));
    await screen.findByText('Active chat');

    fireEvent.click(screen.getByLabelText('Delete Active chat'));
    await waitFor(() => expect(chatRepoMocks.deleteConversation).toHaveBeenCalledWith('c1'));
    expect(await screen.findByText('Hello from c2')).toBeTruthy();
  });

  it('deleting the only (active) conversation falls back to a freshly created one', async () => {
    chatRepoMocks.listConversations
      .mockResolvedValueOnce([makeSummary({ id: 'c1', title: 'Only chat' })])
      .mockResolvedValueOnce([]);
    chatRepoMocks.createConversation
      .mockImplementationOnce(async (uid: string) => ({ id: 'c1', uid, title: 'New chat', createdAt: 'a', updatedAt: 'a' }))
      .mockImplementationOnce(async (uid: string) => ({ id: 'c-fresh', uid, title: 'New chat', createdAt: 'a', updatedAt: 'a' }));
    chatRepoMocks.getMessages.mockImplementation(async (id: string) => (id === 'c-fresh' ? [] : []));

    render(<AiAssistantScreen />);
    await screen.findByText(/What would you like to do/);
    fireEvent.click(screen.getByLabelText('Chat history'));
    await screen.findByText('Only chat');

    fireEvent.click(screen.getByLabelText('Delete Only chat'));
    await waitFor(() => expect(chatRepoMocks.createConversation).toHaveBeenCalledTimes(2));
    expect(chatRepoMocks.getMessages).toHaveBeenCalledWith('c-fresh');
  });

  it('reports and leaves the list unchanged when deleting a conversation fails', async () => {
    chatRepoMocks.listConversations.mockResolvedValue([makeSummary({ id: 'c-a', title: 'Chat A' })]);
    chatRepoMocks.deleteConversation.mockRejectedValueOnce(new Error('delete failed'));

    render(<AiAssistantScreen />);
    await screen.findByText(/What would you like to do/);
    fireEvent.click(screen.getByLabelText('Chat history'));
    await screen.findByText('Chat A');

    fireEvent.click(screen.getByLabelText('Delete Chat A'));
    await waitFor(() => expect(chatRepoMocks.deleteConversation).toHaveBeenCalledWith('c-a'));
    // Still there — the catch prevented listConversations/setHistory from running.
    expect(screen.getByText('Chat A')).toBeTruthy();
  });
});

/* -------------------------------------------------------------------------- */
/* History sheet — closing via backdrop / Escape                            */
/* -------------------------------------------------------------------------- */

describe('AiAssistantScreen — closing the history sheet', () => {
  /**
   * react-native-web's <Modal animationType="slide"> keeps its whole subtree
   * mounted (`isRendering`) until a CSS `animationend` event fires on its
   * internal ModalAnimation wrapper div — for both the opening AND the
   * closing transition. jsdom never runs CSS animations, so that event never
   * fires on its own; tests must dispatch it manually. ModalAnimation's own
   * handler bails out unless `e.currentTarget === e.target`
   * (react-native-web/.../Modal/ModalAnimation.js), so a bubbled event from a
   * descendant doesn't reach it — the event must be dispatched directly on
   * that wrapper. Modal nests several structurally-identical
   * position:fixed/inset:0 wrapper divs (portal, focus trap, animation), so
   * rather than hardcode which ancestor level is the real one, fire the event
   * on every ancestor up to <body> — dispatching on the wrong element is a
   * harmless no-op there (its own currentTarget/target check just fails).
   */
  function fireAnimationEndOnAncestors(from: HTMLElement) {
    let el: HTMLElement | null = from;
    while (el && el.tagName !== 'BODY') {
      fireEvent.animationEnd(el);
      el = el.parentElement;
    }
  }
  function findSheetBackdrop(heading: HTMLElement): HTMLElement {
    const sheet = heading.parentElement?.parentElement ?? null;
    const backdrop = sheet?.previousElementSibling as HTMLElement | null;
    if (!backdrop) throw new Error('sheet backdrop not found');
    return backdrop;
  }

  it('tapping the backdrop closes the sheet', async () => {
    render(<AiAssistantScreen />);
    await screen.findByText(/What would you like to do/);
    fireEvent.click(screen.getByLabelText('Chat history'));
    const heading = await screen.findByText('Chat history');
    const backdrop = findSheetBackdrop(heading);

    fireEvent.click(backdrop);
    // Let the (simulated) close animation finish so the sheet actually unmounts.
    fireAnimationEndOnAncestors(heading);

    await waitFor(() => expect(screen.queryByText('Chat history')).toBeNull());
  });

  it('pressing Escape closes the sheet', async () => {
    render(<AiAssistantScreen />);
    await screen.findByText(/What would you like to do/);
    fireEvent.click(screen.getByLabelText('Chat history'));
    const heading = await screen.findByText('Chat history');

    // Simulate the opening animation finishing so the modal becomes "active"
    // (react-native-web only listens for Escape while active).
    fireAnimationEndOnAncestors(heading);
    fireEvent.keyUp(document, { key: 'Escape' });
    // And the closing animation finishing so the content actually unmounts.
    fireAnimationEndOnAncestors(heading);

    await waitFor(() => expect(screen.queryByText('Chat history')).toBeNull());
  });
});
