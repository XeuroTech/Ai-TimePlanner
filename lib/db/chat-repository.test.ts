import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * chat-repository.ts is a thin SQL layer over expo-sqlite (via `getDb`). Rather
 * than standing up a real SQLite engine, `getDb` is mocked to resolve a small
 * fake db whose four methods (`runAsync`/`getAllAsync`/`getFirstAsync`/
 * `withTransactionAsync`) are spies — each test wires up return values and
 * asserts both the SQL/params sent down and the JS mapping applied to what
 * comes back.
 */
const mocks = vi.hoisted(() => ({
  db: {
    runAsync: vi.fn(async () => ({}) as any),
    getAllAsync: vi.fn(async () => [] as any[]),
    getFirstAsync: vi.fn(async () => null as any),
    withTransactionAsync: vi.fn(async (cb: () => Promise<void>) => {
      await cb();
    }),
  },
}));

vi.mock('@/lib/db/database', () => ({ getDb: vi.fn(async () => mocks.db) }));

import {
  addMessage,
  createConversation,
  deleteAllConversations,
  deleteConversation,
  deriveTitle,
  getLatestConversation,
  getMessages,
  insertConversation,
  listConversations,
  pruneEmptyConversations,
  renameConversation,
} from './chat-repository';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.db.getAllAsync.mockResolvedValue([]);
  mocks.db.getFirstAsync.mockResolvedValue(null);
  mocks.db.withTransactionAsync.mockImplementation(async (cb: () => Promise<void>) => {
    await cb();
  });
});

describe('deriveTitle', () => {
  it('collapses internal whitespace and trims', () => {
    expect(deriveTitle('  plan   my    week  ')).toBe('plan my week');
  });

  it('returns "New chat" for empty or whitespace-only text', () => {
    expect(deriveTitle('')).toBe('New chat');
    expect(deriveTitle('   ')).toBe('New chat');
  });

  it('truncates long text with an ellipsis at 48 characters', () => {
    const long = 'a'.repeat(60);
    const result = deriveTitle(long);
    expect(result).toBe(`${'a'.repeat(47)}…`);
    expect(result.length).toBe(48);
  });

  it('leaves short text untouched', () => {
    expect(deriveTitle('Plan my week')).toBe('Plan my week');
  });
});

describe('createConversation', () => {
  it('inserts a row and returns the new conversation, defaulting the title', async () => {
    const result = await createConversation('u1');
    expect(result.uid).toBe('u1');
    expect(result.title).toBe('New chat');
    expect(result.createdAt).toBe(result.updatedAt);
    expect(mocks.db.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO ai_conversations'),
      expect.any(String),
      'u1',
      'New chat',
      expect.any(String),
      expect.any(String),
    );
  });

  it('uses a custom title when given', async () => {
    const result = await createConversation('u1', 'Trip planning');
    expect(result.title).toBe('Trip planning');
  });
});

describe('listConversations', () => {
  it('maps rows into summaries and normalizes a null preview to an empty string', async () => {
    mocks.db.getAllAsync.mockResolvedValue([
      {
        id: 'c1',
        uid: 'u1',
        title: 'Chat 1',
        created_at: 'a',
        updated_at: 'b',
        message_count: 3,
        preview: null,
      },
    ]);
    const result = await listConversations('u1');
    expect(result).toEqual([
      { id: 'c1', uid: 'u1', title: 'Chat 1', createdAt: 'a', updatedAt: 'b', messageCount: 3, preview: '' },
    ]);
    expect(mocks.db.getAllAsync).toHaveBeenCalledWith(expect.stringContaining('FROM ai_conversations'), 'u1');
  });

  it('collapses whitespace in a non-null preview', async () => {
    mocks.db.getAllAsync.mockResolvedValue([
      { id: 'c1', uid: 'u1', title: 'Chat', created_at: 'a', updated_at: 'b', message_count: 1, preview: '  hi   there  ' },
    ]);
    const [row] = await listConversations('u1');
    expect(row.preview).toBe('hi there');
  });
});

describe('getLatestConversation', () => {
  it('maps the row when one is found', async () => {
    mocks.db.getFirstAsync.mockResolvedValue({ id: 'c1', uid: 'u1', title: 'Chat', created_at: 'a', updated_at: 'b' });
    const result = await getLatestConversation('u1');
    expect(result).toEqual({ id: 'c1', uid: 'u1', title: 'Chat', createdAt: 'a', updatedAt: 'b' });
  });

  it('returns null when no conversation exists yet', async () => {
    mocks.db.getFirstAsync.mockResolvedValue(null);
    expect(await getLatestConversation('u1')).toBeNull();
  });
});

describe('renameConversation', () => {
  it('updates the title and bumps updated_at', async () => {
    await renameConversation('c1', 'New title');
    expect(mocks.db.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE ai_conversations'),
      'New title',
      expect.any(String),
      'c1',
    );
  });
});

describe('deleteConversation', () => {
  it('deletes the conversation\'s messages before the conversation itself, in one transaction', async () => {
    await deleteConversation('c1');
    expect(mocks.db.withTransactionAsync).toHaveBeenCalledTimes(1);
    expect(mocks.db.runAsync).toHaveBeenNthCalledWith(1, expect.stringContaining('DELETE FROM ai_messages'), 'c1');
    expect(mocks.db.runAsync).toHaveBeenNthCalledWith(2, expect.stringContaining('DELETE FROM ai_conversations'), 'c1');
  });
});

describe('deleteAllConversations', () => {
  it('deletes every conversation and message for the user in one transaction', async () => {
    await deleteAllConversations('u1');
    expect(mocks.db.withTransactionAsync).toHaveBeenCalledTimes(1);
    expect(mocks.db.runAsync).toHaveBeenNthCalledWith(1, expect.stringContaining('DELETE FROM ai_messages'), 'u1');
    expect(mocks.db.runAsync).toHaveBeenNthCalledWith(2, expect.stringContaining('DELETE FROM ai_conversations'), 'u1');
  });
});

describe('insertConversation', () => {
  it('replaces the conversation row and inserts each message, serializing plan when present', async () => {
    await insertConversation({
      id: 'c1',
      uid: 'u1',
      title: 'Restored chat',
      createdAt: 'a',
      updatedAt: 'b',
      messages: [
        { id: 'm1', role: 'user', text: 'hi', createdAt: 'a' },
        { id: 'm2', role: 'ai', text: 'plan', plan: [{ day: 'Mon', detail: 'Study' }], createdAt: 'b' },
      ],
    });

    expect(mocks.db.runAsync).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT OR REPLACE INTO ai_conversations'),
      'c1',
      'u1',
      'Restored chat',
      'a',
      'b',
    );
    expect(mocks.db.runAsync).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT OR REPLACE INTO ai_messages'),
      'm1',
      'c1',
      'user',
      'hi',
      null,
      'a',
    );
    expect(mocks.db.runAsync).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('INSERT OR REPLACE INTO ai_messages'),
      'm2',
      'c1',
      'ai',
      'plan',
      JSON.stringify([{ day: 'Mon', detail: 'Study' }]),
      'b',
    );
  });

  it('writes only the conversation row when there are no messages', async () => {
    await insertConversation({ id: 'c1', uid: 'u1', title: 'Empty', createdAt: 'a', updatedAt: 'b', messages: [] });
    expect(mocks.db.runAsync).toHaveBeenCalledTimes(1);
  });
});

describe('pruneEmptyConversations', () => {
  it('defaults the excluded id to an empty string when none is given', async () => {
    await pruneEmptyConversations('u1');
    expect(mocks.db.runAsync).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM ai_conversations'), 'u1', '');
  });

  it('passes through an explicit excepted id', async () => {
    await pruneEmptyConversations('u1', 'keep-me');
    expect(mocks.db.runAsync).toHaveBeenCalledWith(expect.any(String), 'u1', 'keep-me');
  });
});

describe('getMessages', () => {
  it('maps a "user" role row through unchanged and an unrecognized role to "ai"', async () => {
    mocks.db.getAllAsync.mockResolvedValue([
      { id: 'm1', conversation_id: 'c1', role: 'user', text: 'hi', plan: null, created_at: 'a' },
      { id: 'm2', conversation_id: 'c1', role: 'system', text: 'hello', plan: null, created_at: 'b' },
    ]);
    const result = await getMessages('c1');
    expect(result[0].role).toBe('user');
    expect(result[1].role).toBe('ai');
    expect(result[0]).not.toHaveProperty('plan');
  });

  it('parses a valid JSON array plan', async () => {
    mocks.db.getAllAsync.mockResolvedValue([
      { id: 'm1', conversation_id: 'c1', role: 'ai', text: 'plan', plan: JSON.stringify([{ day: 'Mon', detail: 'x' }]), created_at: 'a' },
    ]);
    const [msg] = await getMessages('c1');
    expect(msg.plan).toEqual([{ day: 'Mon', detail: 'x' }]);
  });

  it('drops a plan that fails to parse as JSON', async () => {
    mocks.db.getAllAsync.mockResolvedValue([
      { id: 'm1', conversation_id: 'c1', role: 'ai', text: 'plan', plan: 'not json', created_at: 'a' },
    ]);
    const [msg] = await getMessages('c1');
    expect(msg).not.toHaveProperty('plan');
  });

  it('drops a plan that parses but is not an array', async () => {
    mocks.db.getAllAsync.mockResolvedValue([
      { id: 'm1', conversation_id: 'c1', role: 'ai', text: 'plan', plan: JSON.stringify({ not: 'an array' }), created_at: 'a' },
    ]);
    const [msg] = await getMessages('c1');
    expect(msg).not.toHaveProperty('plan');
  });
});

describe('addMessage', () => {
  it('inserts the message and bumps the conversation\'s updated_at, in one transaction', async () => {
    const result = await addMessage({ conversationId: 'c1', role: 'user', text: 'hi' });
    expect(mocks.db.withTransactionAsync).toHaveBeenCalledTimes(1);
    expect(mocks.db.runAsync).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT INTO ai_messages'),
      expect.any(String),
      'c1',
      'user',
      'hi',
      null,
      expect.any(String),
    );
    expect(mocks.db.runAsync).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE ai_conversations'),
      expect.any(String),
      'c1',
    );
    expect(result).toMatchObject({ conversationId: 'c1', role: 'user', text: 'hi' });
    expect(result).not.toHaveProperty('plan');
  });

  it('serializes the plan when one is given', async () => {
    const result = await addMessage({ conversationId: 'c1', role: 'ai', text: 'plan', plan: [{ day: 'Tue', detail: 'y' }] });
    expect(mocks.db.runAsync).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      expect.any(String),
      'c1',
      'ai',
      'plan',
      JSON.stringify([{ day: 'Tue', detail: 'y' }]),
      expect.any(String),
    );
    expect(result.plan).toEqual([{ day: 'Tue', detail: 'y' }]);
  });
});
