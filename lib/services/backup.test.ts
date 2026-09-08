import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * backup.ts pulls in react-native, expo-constants, the SQLite repositories and
 * every zustand store purely so `buildBackup`/`applyBackup` can read/write real
 * state. All of that is replaced here with small, inspectable fakes: minimal
 * store objects that behave like a real zustand store (`getState`/`setState`/
 * `persist.hasHydrated`) and repo modules whose return values each test
 * controls directly.
 */
const mocks = vi.hoisted(() => {
  function makeStore<T extends object>(initial: T) {
    let state = initial;
    return {
      getState: () => state,
      setState: (updater: Partial<T> | ((s: T) => Partial<T>)) => {
        const partial = typeof updater === 'function' ? (updater as (s: T) => Partial<T>)(state) : updater;
        state = { ...state, ...partial };
      },
      reset: (next: T) => {
        state = next;
      },
      persist: {
        hasHydrated: vi.fn(() => true),
        onFinishHydration: vi.fn((_cb: () => void) => () => {}),
      },
    };
  }

  return {
    platform: { OS: 'android' as string },
    constants: { expoConfig: { name: 'Smart Planner', version: '1.0.0' } as { name?: string; version?: string } | null },
    plannerStore: makeStore({ classes: [] as any[], tasks: [] as any[], plans: [] as any[] }),
    habitsStore: makeStore({ habits: [] as any[], log: {} as Record<string, Record<string, number>> }),
    notificationStore: makeStore({ items: [] as any[] }),
    themeStore: makeStore({ darkMode: false, notificationsEnabled: true }),
    chatRepo: {
      listConversations: vi.fn(async () => [] as any[]),
      getMessages: vi.fn(async () => [] as any[]),
      deleteAllConversations: vi.fn(async () => {}),
      insertConversation: vi.fn(async () => {}),
    },
    profileRepo: {
      getProfile: vi.fn(async () => null as any),
      ensureProfile: vi.fn(async () => {}),
      updateProfile: vi.fn(async () => {}),
    },
  };
});

vi.mock('react-native', () => ({ Platform: mocks.platform }));
vi.mock('expo-constants', () => ({
  default: mocks.constants,
}));
vi.mock('@/lib/db/chat-repository', () => mocks.chatRepo);
vi.mock('@/lib/db/profile-repository', () => mocks.profileRepo);
vi.mock('@/store/habits-store', () => ({ useHabitsStore: mocks.habitsStore }));
vi.mock('@/store/notification-store', () => ({ useNotificationStore: mocks.notificationStore }));
vi.mock('@/store/planner-store', () => ({ usePlannerStore: mocks.plannerStore }));
vi.mock('@/store/theme-store', () => ({ useThemeStore: mocks.themeStore }));

import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  BackupFormatError,
  applyBackup,
  buildBackup,
  parseBackup,
  serializeBackup,
  summarize,
  waitForLocalData,
  type Backup,
} from './backup';

function validBackupJson(overrides: Partial<Backup> = {}): string {
  const backup: Backup = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: '2026-01-05T00:00:00.000Z',
    uid: 'user-1',
    device: 'Android · Smart Planner',
    appVersion: '1.0.0',
    data: {
      profile: null,
      planner: { classes: [{ id: 'c1' }] as any, tasks: [], plans: [] },
      habits: { habits: [{ id: 'h1' }] as any, log: {} },
      notifications: [{ id: 'n1' }] as any,
      settings: { darkMode: true, notificationsEnabled: false },
      chats: [{ id: 'ch1' }] as any,
    },
    ...overrides,
  };
  return JSON.stringify(backup);
}

beforeEach(() => {
  mocks.platform.OS = 'android';
  mocks.constants.expoConfig = { name: 'Smart Planner', version: '1.0.0' };
  mocks.plannerStore.reset({ classes: [], tasks: [], plans: [] });
  mocks.habitsStore.reset({ habits: [], log: {} });
  mocks.notificationStore.reset({ items: [] });
  mocks.themeStore.reset({ darkMode: false, notificationsEnabled: true });
  vi.clearAllMocks();
  mocks.plannerStore.persist.hasHydrated.mockReturnValue(true);
  mocks.habitsStore.persist.hasHydrated.mockReturnValue(true);
  mocks.notificationStore.persist.hasHydrated.mockReturnValue(true);
  mocks.themeStore.persist.hasHydrated.mockReturnValue(true);
  mocks.chatRepo.listConversations.mockResolvedValue([]);
  mocks.chatRepo.getMessages.mockResolvedValue([]);
  mocks.profileRepo.getProfile.mockResolvedValue(null);
});

describe('parseBackup', () => {
  it('throws BackupFormatError for unparsable JSON', () => {
    expect(() => parseBackup('not json')).toThrow(BackupFormatError);
    expect(() => parseBackup('not json')).toThrow('The cloud backup file is corrupted and cannot be read.');
  });

  it('throws BackupFormatError when the format tag is missing or wrong', () => {
    expect(() => parseBackup(JSON.stringify({ format: 'something-else' }))).toThrow(
      'That file is not a Smart Planner backup.',
    );
  });

  it('throws BackupFormatError for a version newer than this app supports', () => {
    const json = JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION + 1 });
    expect(() => parseBackup(json)).toThrow(
      'This backup was made by a newer version of the app. Please update Smart Planner and try again.',
    );
  });

  it('fills in defaults for a minimal, mostly-empty backup', () => {
    const result = parseBackup(JSON.stringify({ format: BACKUP_FORMAT }));
    expect(result.version).toBe(1);
    expect(result.createdAt).toBe(new Date(0).toISOString());
    expect(result.uid).toBe('');
    expect(result.device).toBe('Unknown device');
    expect(result.data).toEqual({
      profile: null,
      planner: { classes: [], tasks: [], plans: [] },
      habits: { habits: [], log: {} },
      notifications: [],
      settings: { darkMode: false, notificationsEnabled: true },
      chats: [],
    });
  });

  it('normalizes malformed data fields (non-arrays) back to empty arrays', () => {
    const json = JSON.stringify({
      format: BACKUP_FORMAT,
      data: { planner: { classes: 'oops' }, habits: { habits: null, log: 'oops' } },
    });
    const result = parseBackup(json);
    expect(result.data.planner.classes).toEqual([]);
    expect(result.data.habits.habits).toEqual([]);
    expect(result.data.habits.log).toEqual({});
  });

  it('passes through a fully-populated, valid backup unchanged', () => {
    const result = parseBackup(validBackupJson());
    expect(result.uid).toBe('user-1');
    expect(result.data.planner.classes).toEqual([{ id: 'c1' }]);
    expect(result.data.settings).toEqual({ darkMode: true, notificationsEnabled: false });
  });
});

describe('summarize', () => {
  it('counts each row type from the backup', () => {
    const backup = parseBackup(validBackupJson());
    const result = summarize(backup, 'user-1');
    expect(result).toEqual({
      createdAt: '2026-01-05T00:00:00.000Z',
      device: 'Android · Smart Planner',
      classes: 1,
      tasks: 0,
      plans: 0,
      habits: 1,
      notifications: 1,
      chats: 1,
      foreign: false,
    });
  });

  it('flags the backup as foreign when its uid differs from the current user', () => {
    const backup = parseBackup(validBackupJson());
    const result = summarize(backup, 'someone-else');
    expect(result.foreign).toBe(true);
  });

  it('never flags an anonymous (uid-less) backup as foreign', () => {
    const backup = parseBackup(JSON.stringify({ format: BACKUP_FORMAT }));
    const result = summarize(backup, 'someone-else');
    expect(result.foreign).toBe(false);
  });
});

describe('waitForLocalData', () => {
  it('resolves immediately once every store reports it has hydrated', async () => {
    await expect(waitForLocalData()).resolves.toBeUndefined();
  });

  it('resolves once a not-yet-hydrated store fires its onFinishHydration callback', async () => {
    mocks.habitsStore.persist.hasHydrated.mockReturnValue(false);
    let fireHydration = () => {};
    mocks.habitsStore.persist.onFinishHydration.mockImplementation((cb: () => void) => {
      fireHydration = cb;
      return () => {};
    });

    const done = vi.fn();
    waitForLocalData().then(done);

    await Promise.resolve();
    expect(done).not.toHaveBeenCalled();

    fireHydration();
    await new Promise((r) => setTimeout(r, 0));
    expect(done).toHaveBeenCalled();
  });
});

describe('buildBackup', () => {
  it('scopes every section to the requesting uid and preserves scheduled/log data', async () => {
    mocks.plannerStore.reset({
      classes: [{ id: 'c1', uid: 'user-1' }, { id: 'c2', uid: 'other' }],
      tasks: [{ id: 't1', uid: 'user-1' }],
      plans: [{ id: 'p1', uid: 'other' }],
    });
    mocks.habitsStore.reset({
      habits: [{ id: 'h1', uid: 'user-1' }, { id: 'h2', uid: 'other' }],
      log: { h1: { '2026-01-05': 2 }, h2: { '2026-01-05': 1 }, orphan: { '2026-01-05': 9 } },
    });
    mocks.notificationStore.reset({
      items: [{ id: 'n1', uid: 'user-1', at: 1 }, { id: 'n2', uid: 'other', at: 2 }],
    });
    mocks.themeStore.reset({ darkMode: true, notificationsEnabled: false });
    mocks.profileRepo.getProfile.mockResolvedValue({
      uid: 'user-1',
      name: 'Ana',
      category: 'student',
      onboarded: true,
      preferences: { wakeTime: 420 },
    });
    mocks.chatRepo.listConversations.mockResolvedValue([
      { id: 'conv1', uid: 'user-1', title: 'Plan my week', createdAt: 'a', updatedAt: 'b' },
    ]);
    mocks.chatRepo.getMessages.mockResolvedValue([
      { id: 'm1', conversationId: 'conv1', role: 'user', text: 'hi', createdAt: 'a' },
    ]);

    const backup = await buildBackup('user-1');

    expect(backup.uid).toBe('user-1');
    expect(backup.data.planner.classes).toEqual([{ id: 'c1', uid: 'user-1' }]);
    expect(backup.data.planner.plans).toEqual([]);
    expect(backup.data.habits.habits).toEqual([{ id: 'h1', uid: 'user-1' }]);
    // Only the log for user-1's own habit is carried; other users' and orphaned entries are dropped.
    expect(backup.data.habits.log).toEqual({ h1: { '2026-01-05': 2 } });
    expect(backup.data.notifications).toEqual([{ id: 'n1', uid: 'user-1', at: 1 }]);
    expect(backup.data.settings).toEqual({ darkMode: true, notificationsEnabled: false });
    expect(backup.data.profile).toEqual({
      name: 'Ana',
      category: 'student',
      onboarded: true,
      preferences: { wakeTime: 420 },
    });
    expect(backup.data.chats).toEqual([
      {
        id: 'conv1',
        title: 'Plan my week',
        createdAt: 'a',
        updatedAt: 'b',
        messages: [{ id: 'm1', role: 'user', text: 'hi', createdAt: 'a' }],
      },
    ]);
  });

  it('omits the category field entirely when the profile has none', async () => {
    mocks.profileRepo.getProfile.mockResolvedValue({
      uid: 'user-1',
      name: 'Ana',
      onboarded: false,
      preferences: {},
    });
    const backup = await buildBackup('user-1');
    expect(backup.data.profile).toEqual({ name: 'Ana', onboarded: false, preferences: {} });
    expect(backup.data.profile).not.toHaveProperty('category');
  });

  it('sets profile to null when the user has no local profile row', async () => {
    mocks.profileRepo.getProfile.mockResolvedValue(null);
    const backup = await buildBackup('user-1');
    expect(backup.data.profile).toBeNull();
  });

  it('labels the device "iOS" on iOS', async () => {
    mocks.platform.OS = 'ios';
    const backup = await buildBackup('user-1');
    expect(backup.device).toBe('iOS · Smart Planner');
  });

  it('labels the device "Web" on any platform other than iOS/Android', async () => {
    mocks.platform.OS = 'web';
    const backup = await buildBackup('user-1');
    expect(backup.device).toBe('Web · Smart Planner');
  });

  it('falls back to "Smart Planner" and "1.0.0" when Expo config has no name/version', async () => {
    mocks.constants.expoConfig = null;
    const backup = await buildBackup('user-1');
    expect(backup.device).toBe('Android · Smart Planner');
    expect(backup.appVersion).toBe('1.0.0');
  });

  it('omits the habit log entry entirely for a habit with no logged days', async () => {
    mocks.habitsStore.reset({
      habits: [{ id: 'h1', uid: 'user-1' }],
      log: {},
    });
    const backup = await buildBackup('user-1');
    expect(backup.data.habits.log).toEqual({});
  });

  it('carries a message\'s plan array through export when present', async () => {
    mocks.chatRepo.listConversations.mockResolvedValue([
      { id: 'conv1', uid: 'user-1', title: 'Plan my week', createdAt: 'a', updatedAt: 'b' },
    ]);
    mocks.chatRepo.getMessages.mockResolvedValue([
      { id: 'm1', conversationId: 'conv1', role: 'assistant', text: 'here', createdAt: 'a', plan: [{ id: 'x' }] },
    ]);
    const backup = await buildBackup('user-1');
    expect(backup.data.chats[0].messages[0]).toMatchObject({ id: 'm1', plan: [{ id: 'x' }] });
  });
});

describe('serializeBackup', () => {
  it('returns pretty-printed JSON that round-trips to the same backup', async () => {
    const { json, backup } = await serializeBackup('user-1');
    expect(JSON.parse(json)).toEqual(backup);
    expect(json).toContain('\n');
  });
});

describe('applyBackup', () => {
  it('replaces only the target uid\'s rows and remaps their uid, leaving other accounts untouched', async () => {
    mocks.plannerStore.reset({
      classes: [{ id: 'old', uid: 'user-1' }, { id: 'keep', uid: 'other' }],
      tasks: [{ id: 'old-task', uid: 'user-1' }, { id: 'keep-task', uid: 'other' }],
      plans: [{ id: 'old-plan', uid: 'user-1' }, { id: 'keep-plan', uid: 'other' }],
    });
    mocks.habitsStore.reset({
      habits: [{ id: 'old-habit', uid: 'user-1' }],
      log: { 'old-habit': { '2026-01-04': 1 }, 'other-habit': { '2026-01-04': 1 } },
    });
    mocks.notificationStore.reset({
      items: [{ id: 'old-n', uid: 'user-1', at: 1 }, { id: 'keep-n', uid: 'other', at: 5 }],
    });

    const backup = parseBackup(
      JSON.stringify({
        format: BACKUP_FORMAT,
        version: 1,
        uid: 'backup-owner',
        data: {
          planner: {
            classes: [{ id: 'new', uid: 'backup-owner' }],
            tasks: [{ id: 'new-task', uid: 'backup-owner' }],
            plans: [{ id: 'new-plan', uid: 'backup-owner' }],
          },
          habits: { habits: [{ id: 'new-habit', uid: 'backup-owner' }], log: { 'new-habit': { '2026-01-05': 2 } } },
          notifications: [{ id: 'new-n', uid: 'backup-owner', at: 10 }],
          settings: { darkMode: true, notificationsEnabled: false },
          chats: [],
        },
      }),
    );

    await applyBackup(backup, 'user-1');

    expect(mocks.plannerStore.getState().classes).toEqual([
      { id: 'keep', uid: 'other' },
      { id: 'new', uid: 'user-1' },
    ]);
    expect(mocks.plannerStore.getState().tasks).toEqual([
      { id: 'keep-task', uid: 'other' },
      { id: 'new-task', uid: 'user-1' },
    ]);
    expect(mocks.plannerStore.getState().plans).toEqual([
      { id: 'keep-plan', uid: 'other' },
      { id: 'new-plan', uid: 'user-1' },
    ]);

    expect(mocks.habitsStore.getState().habits).toEqual([{ id: 'new-habit', uid: 'user-1' }]);
    expect(mocks.habitsStore.getState().log).toEqual({
      'other-habit': { '2026-01-04': 1 },
      'new-habit': { '2026-01-05': 2 },
    });

    // Notifications are merged across accounts and re-sorted newest (`at`) first.
    expect(mocks.notificationStore.getState().items).toEqual([
      { id: 'new-n', uid: 'user-1', at: 10 },
      { id: 'keep-n', uid: 'other', at: 5 },
    ]);

    expect(mocks.themeStore.getState()).toEqual({ darkMode: true, notificationsEnabled: false });
  });

  it('writes the profile only when the backup carries one, and replaces chat history', async () => {
    const backupWithProfile = parseBackup(
      JSON.stringify({
        format: BACKUP_FORMAT,
        data: {
          profile: { name: 'Ana', category: 'student', onboarded: true, preferences: { wakeTime: 1 } },
          chats: [{ id: 'conv1', title: 'T', createdAt: 'a', updatedAt: 'b', messages: [] }],
        },
      }),
    );

    await applyBackup(backupWithProfile, 'user-1');

    expect(mocks.profileRepo.ensureProfile).toHaveBeenCalledWith('user-1', 'Ana');
    expect(mocks.profileRepo.updateProfile).toHaveBeenCalledWith('user-1', {
      name: 'Ana',
      category: 'student',
      onboarded: true,
      preferences: { wakeTime: 1 },
    });
    expect(mocks.chatRepo.deleteAllConversations).toHaveBeenCalledWith('user-1');
    expect(mocks.chatRepo.insertConversation).toHaveBeenCalledWith({
      id: 'conv1',
      uid: 'user-1',
      title: 'T',
      createdAt: 'a',
      updatedAt: 'b',
      messages: [],
    });
  });

  it('writes the profile without a category field when the backup profile has none', async () => {
    const backupNoCategory = parseBackup(
      JSON.stringify({
        format: BACKUP_FORMAT,
        data: {
          profile: { name: 'Ana', onboarded: false, preferences: {} },
        },
      }),
    );
    await applyBackup(backupNoCategory, 'user-1');
    expect(mocks.profileRepo.updateProfile).toHaveBeenCalledWith('user-1', {
      name: 'Ana',
      onboarded: false,
      preferences: {},
    });
    expect(mocks.profileRepo.updateProfile.mock.calls[0][1]).not.toHaveProperty('category');
  });

  it('skips writing a profile entirely when the backup has none', async () => {
    const backupNoProfile = parseBackup(JSON.stringify({ format: BACKUP_FORMAT }));
    await applyBackup(backupNoProfile, 'user-1');
    expect(mocks.profileRepo.ensureProfile).not.toHaveBeenCalled();
    expect(mocks.profileRepo.updateProfile).not.toHaveBeenCalled();
  });
});
