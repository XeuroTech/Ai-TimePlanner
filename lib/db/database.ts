import * as SQLite from 'expo-sqlite';

/**
 * Local SQLite database. ALL user data (profile, tasks, planner, reminders,
 * notifications, habits, analytics, AI history) lives here — never in Firebase.
 */
const DB_NAME = 'aiplanner.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) dbPromise = SQLite.openDatabaseAsync(DB_NAME);
  return dbPromise;
}

/** Creates tables if they don't exist. Safe to call on every launch. */
export async function initDatabase(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS profiles (
      uid TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      category TEXT,
      onboarded INTEGER NOT NULL DEFAULT 0,
      preferences TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    /* AI Assistant chat history. One row per conversation thread, scoped to the
     * signed-in user's uid so each account sees only its own chats. */
    CREATE TABLE IF NOT EXISTS ai_conversations (
      id TEXT PRIMARY KEY NOT NULL,
      uid TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT 'New chat',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ai_conversations_uid
      ON ai_conversations (uid, updated_at DESC);

    /* Individual chat messages. The plan column holds the optional structured
     * day-plan payload as JSON (NULL for plain messages). Rows are removed with
     * their parent conversation via deleteConversation(). */
    CREATE TABLE IF NOT EXISTS ai_messages (
      id TEXT PRIMARY KEY NOT NULL,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      text TEXT NOT NULL,
      plan TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation
      ON ai_messages (conversation_id, created_at);
  `);
}
