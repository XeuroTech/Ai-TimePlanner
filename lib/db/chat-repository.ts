/**
 * AI Assistant chat history, persisted in local SQLite.
 *
 * The assistant screen used to keep messages in component state, so every
 * navigation away wiped the conversation. Everything now lives in
 * `ai_conversations` / `ai_messages` (see lib/db/database.ts), scoped by the
 * signed-in user's uid, so history survives app restarts.
 */

import { getDb } from '@/lib/db/database';

export type ChatMessageRole = 'user' | 'ai';

export type ChatPlanItem = { day: string; detail: string };

export type StoredMessage = {
  id: string;
  conversationId: string;
  role: ChatMessageRole;
  text: string;
  plan?: ChatPlanItem[];
  createdAt: string;
};

export type Conversation = {
  id: string;
  uid: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

/** A conversation plus the data the history list needs to render a row. */
export type ConversationSummary = Conversation & {
  messageCount: number;
  preview: string;
};

/** Longest title we derive from a first user message. */
const TITLE_MAX = 48;

/* -------------------------------------------------------------------------- */
/* Row mapping                                                                */
/* -------------------------------------------------------------------------- */

type ConversationRow = {
  id: string;
  uid: string;
  title: string;
  created_at: string;
  updated_at: string;
};

type ConversationSummaryRow = ConversationRow & {
  message_count: number;
  preview: string | null;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  role: string;
  text: string;
  plan: string | null;
  created_at: string;
};

function rowToConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    uid: row.uid,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToMessage(row: MessageRow): StoredMessage {
  let plan: ChatPlanItem[] | undefined;
  if (row.plan) {
    try {
      const parsed = JSON.parse(row.plan);
      if (Array.isArray(parsed)) plan = parsed as ChatPlanItem[];
    } catch {
      plan = undefined;
    }
  }
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role === 'user' ? 'user' : 'ai',
    text: row.text,
    ...(plan ? { plan } : {}),
    createdAt: row.created_at,
  };
}

/* -------------------------------------------------------------------------- */
/* Ids + titles                                                               */
/* -------------------------------------------------------------------------- */

/** Collision-resistant id without pulling in a uuid dependency. */
function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Turns the first user message into a short, single-line conversation title. */
export function deriveTitle(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (!flat) return 'New chat';
  return flat.length > TITLE_MAX ? `${flat.slice(0, TITLE_MAX - 1).trimEnd()}…` : flat;
}

/* -------------------------------------------------------------------------- */
/* Conversations                                                              */
/* -------------------------------------------------------------------------- */

export async function createConversation(uid: string, title = 'New chat'): Promise<Conversation> {
  const db = await getDb();
  const now = new Date().toISOString();
  const id = makeId('conv');
  await db.runAsync(
    `INSERT INTO ai_conversations (id, uid, title, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    id,
    uid,
    title,
    now,
    now,
  );
  return { id, uid, title, createdAt: now, updatedAt: now };
}

/** Newest-first list for the history sheet, with a preview of the last message. */
export async function listConversations(uid: string): Promise<ConversationSummary[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<ConversationSummaryRow>(
    `SELECT c.*,
            (SELECT COUNT(*) FROM ai_messages m WHERE m.conversation_id = c.id) AS message_count,
            (SELECT m.text FROM ai_messages m
              WHERE m.conversation_id = c.id
              ORDER BY m.created_at DESC, m.rowid DESC LIMIT 1) AS preview
       FROM ai_conversations c
      WHERE c.uid = ?
      ORDER BY c.updated_at DESC`,
    uid,
  );
  return rows.map((row) => ({
    ...rowToConversation(row),
    messageCount: row.message_count,
    preview: (row.preview ?? '').replace(/\s+/g, ' ').trim(),
  }));
}

/** The conversation the user was last active in, used to resume on mount. */
export async function getLatestConversation(uid: string): Promise<Conversation | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<ConversationRow>(
    `SELECT * FROM ai_conversations WHERE uid = ? ORDER BY updated_at DESC LIMIT 1`,
    uid,
  );
  return row ? rowToConversation(row) : null;
}

export async function renameConversation(conversationId: string, title: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE ai_conversations SET title = ?, updated_at = ? WHERE id = ?`,
    title,
    new Date().toISOString(),
    conversationId,
  );
}

export async function deleteConversation(conversationId: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM ai_messages WHERE conversation_id = ?', conversationId);
    await db.runAsync('DELETE FROM ai_conversations WHERE id = ?', conversationId);
  });
}

/** Wipes every chat for a user — called when the account is deleted. */
export async function deleteAllConversations(uid: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `DELETE FROM ai_messages WHERE conversation_id IN
         (SELECT id FROM ai_conversations WHERE uid = ?)`,
      uid,
    );
    await db.runAsync('DELETE FROM ai_conversations WHERE uid = ?', uid);
  });
}

/**
 * Writes a whole conversation with its messages in one transaction, keeping the
 * ids and timestamps it was given.
 *
 * Used by the cloud-restore path (lib/services/backup.ts). `createConversation`
 * + `addMessage` can't be reused there because they mint fresh ids and stamp
 * `now`, which would renumber the restored history and reorder the chat list.
 * `INSERT OR REPLACE` makes a repeated restore idempotent instead of failing on
 * the primary key.
 */
export async function insertConversation(input: {
  id: string;
  uid: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: {
    id: string;
    role: ChatMessageRole;
    text: string;
    plan?: ChatPlanItem[];
    createdAt: string;
  }[];
}): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT OR REPLACE INTO ai_conversations (id, uid, title, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      input.id,
      input.uid,
      input.title,
      input.createdAt,
      input.updatedAt,
    );
    for (const message of input.messages) {
      await db.runAsync(
        `INSERT OR REPLACE INTO ai_messages (id, conversation_id, role, text, plan, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        message.id,
        input.id,
        message.role,
        message.text,
        message.plan ? JSON.stringify(message.plan) : null,
        message.createdAt,
      );
    }
  });
}

/** Drops conversations that never got a message (abandoned "New chat" rows). */
export async function pruneEmptyConversations(uid: string, exceptId?: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `DELETE FROM ai_conversations
      WHERE uid = ?
        AND id <> ?
        AND NOT EXISTS (SELECT 1 FROM ai_messages m WHERE m.conversation_id = ai_conversations.id)`,
    uid,
    exceptId ?? '',
  );
}

/* -------------------------------------------------------------------------- */
/* Messages                                                                   */
/* -------------------------------------------------------------------------- */

export async function getMessages(conversationId: string): Promise<StoredMessage[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<MessageRow>(
    `SELECT * FROM ai_messages WHERE conversation_id = ? ORDER BY created_at ASC, rowid ASC`,
    conversationId,
  );
  return rows.map(rowToMessage);
}

/**
 * Appends a message and bumps the parent conversation's `updated_at` so the
 * history list stays ordered by recency.
 */
export async function addMessage(input: {
  conversationId: string;
  role: ChatMessageRole;
  text: string;
  plan?: ChatPlanItem[];
}): Promise<StoredMessage> {
  const db = await getDb();
  const now = new Date().toISOString();
  const id = makeId('msg');
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO ai_messages (id, conversation_id, role, text, plan, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      id,
      input.conversationId,
      input.role,
      input.text,
      input.plan ? JSON.stringify(input.plan) : null,
      now,
    );
    await db.runAsync(
      'UPDATE ai_conversations SET updated_at = ? WHERE id = ?',
      now,
      input.conversationId,
    );
  });
  return {
    id,
    conversationId: input.conversationId,
    role: input.role,
    text: input.text,
    ...(input.plan ? { plan: input.plan } : {}),
    createdAt: now,
  };
}
