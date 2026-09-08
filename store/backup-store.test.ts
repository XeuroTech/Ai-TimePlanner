import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * backup-store.ts orchestrates lib/services/backup.ts (SQLite/zustand
 * serialization), lib/services/google-drive.ts (OAuth + Drive API) and
 * lib/services/observability.ts (crash reporting) — all replaced here with
 * inspectable fakes so the state-machine branches (busy guards, error
 * classification, "not-connected" auto-disconnect) can be verified without a
 * real network or Google account.
 */
const mocks = vi.hoisted(() => {
  class DriveError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.name = 'DriveError';
      this.code = code;
    }
  }
  return {
    DriveError,
    authState: { fbUser: null as { uid: string } | null },
    drive: {
      getConnection: vi.fn(async () => ({ connected: false } as any)),
      connect: vi.fn(async () => ({ connected: true, email: 'a@b.com' }) as any),
      disconnect: vi.fn(async () => {}),
      uploadBackup: vi.fn(async () => ({ modifiedTime: '2026-01-05T00:00:00Z', size: '123', webViewLink: 'https://drive/x' }) as any),
      downloadBackup: vi.fn(async () => '{"format":"smart-planner-backup"}' as string | null),
      deleteBackup: vi.fn(async () => true),
      migrateLegacyBackup: vi.fn(async () => null as any),
      findBackupFile: vi.fn(async () => null as any),
      driveErrorMessage: vi.fn((e: any) => e?.message ?? 'Something went wrong.'),
      DriveError,
      RECONNECT_MESSAGE: 'Please reconnect your Google Drive account.',
    },
    backupService: {
      serializeBackup: vi.fn(async (uid: string) => ({ json: '{"a":1}', backup: { uid } as any })),
      parseBackup: vi.fn((json: string) => ({ uid: 'backup-owner', raw: json }) as any),
      applyBackup: vi.fn(async () => {}),
      summarize: vi.fn((_backup: any, uid: string) => ({ classes: 1, tasks: 0, plans: 0, habits: 0, notifications: 0, chats: 0, foreign: false, createdAt: 'a', device: 'd', uidUsed: uid }) as any),
      BackupFormatError: class BackupFormatError extends Error {},
    },
    reportError: vi.fn(),
  };
});

vi.mock('@/lib/services/google-drive', () => mocks.drive);
vi.mock('@/lib/services/backup', () => mocks.backupService);
vi.mock('@/lib/services/observability', () => ({ reportError: mocks.reportError }));
vi.mock('@/lib/storage', () => ({
  zustandStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
}));
vi.mock('@/store/auth-store', () => ({ useAuthStore: { getState: () => mocks.authState } }));

import { useBackupStore } from './backup-store';

const initialState = {
  connectedEmail: null,
  connected: false,
  lastBackupAt: null,
  lastRestoreAt: null,
  autoSync: false,
  phase: 'idle' as const,
  lastError: null,
  cloud: null,
};

beforeEach(() => {
  mocks.authState.fbUser = { uid: 'u1' };
  useBackupStore.setState(initialState);
  vi.clearAllMocks();
  mocks.drive.getConnection.mockResolvedValue({ connected: false });
  mocks.drive.connect.mockResolvedValue({ connected: true, email: 'a@b.com' });
  mocks.drive.disconnect.mockResolvedValue(undefined);
  mocks.drive.uploadBackup.mockResolvedValue({ modifiedTime: '2026-01-05T00:00:00Z', size: '123', webViewLink: 'https://drive/x' });
  mocks.drive.downloadBackup.mockResolvedValue('{"format":"smart-planner-backup"}');
  mocks.drive.deleteBackup.mockResolvedValue(true);
  mocks.drive.migrateLegacyBackup.mockResolvedValue(null);
  mocks.drive.findBackupFile.mockResolvedValue(null);
  mocks.drive.driveErrorMessage.mockImplementation((e: any) => e?.message ?? 'Something went wrong.');
});

describe('hydrate', () => {
  it('adopts the stored connection state', async () => {
    mocks.drive.getConnection.mockResolvedValue({ connected: true, email: 'a@b.com' });
    await useBackupStore.getState().hydrate();
    expect(useBackupStore.getState()).toMatchObject({ connected: true, connectedEmail: 'a@b.com' });
  });

  it('flags a needs-reconnect grant by turning off auto-sync and showing the reconnect message', async () => {
    mocks.drive.getConnection.mockResolvedValue({ connected: true, email: 'a@b.com', needsReconnect: true });
    await useBackupStore.getState().hydrate();
    expect(useBackupStore.getState()).toMatchObject({ autoSync: false, lastError: mocks.drive.RECONNECT_MESSAGE });
  });

  it('falls back to a null connectedEmail when Drive reports no address', async () => {
    mocks.drive.getConnection.mockResolvedValue({ connected: true });
    await useBackupStore.getState().hydrate();
    expect(useBackupStore.getState().connectedEmail).toBeNull();
  });

  it('reports but swallows an error reading the stored connection', async () => {
    mocks.drive.getConnection.mockRejectedValue(new Error('storage broken'));
    await useBackupStore.getState().hydrate();
    expect(mocks.reportError).toHaveBeenCalledWith(expect.any(Error), 'backup-store/hydrate');
    expect(useBackupStore.getState().connected).toBe(false);
  });
});

describe('connect', () => {
  it('connects, adopts the account email, and kicks off a cloud-info refresh', async () => {
    const result = await useBackupStore.getState().connect();
    expect(result).toEqual({ ok: true });
    // `connect()` itself resolves with the account adopted; the cloud-info
    // refresh it kicks off (fire-and-forget) is still settling at this point.
    expect(useBackupStore.getState()).toMatchObject({ connected: true, connectedEmail: 'a@b.com' });
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.drive.migrateLegacyBackup).toHaveBeenCalled();
  });

  it('reports a non-cancelled failure and surfaces the message', async () => {
    mocks.drive.connect.mockRejectedValue(new Error('network down'));
    const result = await useBackupStore.getState().connect();
    expect(result).toEqual({ ok: false, error: 'network down' });
    expect(mocks.reportError).toHaveBeenCalled();
    expect(useBackupStore.getState().lastError).toBe('network down');
  });

  it('falls back to a null connectedEmail when Drive reports no address', async () => {
    mocks.drive.connect.mockResolvedValue({ connected: true });
    await useBackupStore.getState().connect();
    expect(useBackupStore.getState().connectedEmail).toBeNull();
  });

  it('does not report or show an error when the user cancels the picker', async () => {
    mocks.drive.connect.mockRejectedValue(new mocks.DriveError('cancelled', 'Sign-in was cancelled.'));
    const result = await useBackupStore.getState().connect();
    expect(result).toEqual({ ok: false, error: 'Sign-in was cancelled.' });
    expect(mocks.reportError).not.toHaveBeenCalled();
    expect(useBackupStore.getState().lastError).toBeNull();
  });
});

describe('disconnect', () => {
  it('clears the connection and cloud state', async () => {
    useBackupStore.setState({ connected: true, connectedEmail: 'a@b.com', autoSync: true, cloud: { size: 1 } as any });
    await useBackupStore.getState().disconnect();
    expect(useBackupStore.getState()).toMatchObject({ connected: false, connectedEmail: null, autoSync: false, cloud: null });
  });

  it('still resets local state even when revoking the token fails', async () => {
    mocks.drive.disconnect.mockRejectedValue(new Error('revoke failed'));
    useBackupStore.setState({ connected: true });
    await useBackupStore.getState().disconnect();
    expect(mocks.reportError).toHaveBeenCalled();
    expect(useBackupStore.getState().connected).toBe(false);
  });
});

describe('setAutoSync', () => {
  it('triggers a silent backup when turned on while connected', async () => {
    useBackupStore.setState({ connected: true });
    useBackupStore.getState().setAutoSync(true);
    expect(useBackupStore.getState().autoSync).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.backupService.serializeBackup).toHaveBeenCalled();
  });

  it('does not trigger a backup when turned on while disconnected', async () => {
    useBackupStore.getState().setAutoSync(true);
    await Promise.resolve();
    expect(mocks.backupService.serializeBackup).not.toHaveBeenCalled();
  });

  it('turning it off never triggers a backup', async () => {
    useBackupStore.setState({ connected: true, autoSync: true });
    useBackupStore.getState().setAutoSync(false);
    await Promise.resolve();
    expect(useBackupStore.getState().autoSync).toBe(false);
    expect(mocks.backupService.serializeBackup).not.toHaveBeenCalled();
  });
});

describe('backupNow', () => {
  it('rejects a concurrent non-silent call while busy', async () => {
    useBackupStore.setState({ phase: 'restoring' });
    const result = await useBackupStore.getState().backupNow();
    expect(result).toEqual({ ok: false, error: 'Already working…' });
    expect(mocks.backupService.serializeBackup).not.toHaveBeenCalled();
  });

  it('a silent call proceeds even while another operation is in progress', async () => {
    useBackupStore.setState({ phase: 'restoring' });
    const result = await useBackupStore.getState().backupNow({ silent: true });
    expect(result).toEqual({ ok: true });
  });

  it('uploads and records the backup, falling back to json length when Drive reports no size', async () => {
    mocks.drive.uploadBackup.mockResolvedValue({ modifiedTime: 'a' });
    const result = await useBackupStore.getState().backupNow();
    expect(result).toEqual({ ok: true });
    const { cloud, lastBackupAt, phase } = useBackupStore.getState();
    expect(phase).toBe('idle');
    expect(lastBackupAt).toBeTypeOf('number');
    expect(cloud).toMatchObject({ modifiedTime: 'a', size: '{"a":1}'.length });
    expect(cloud).not.toHaveProperty('webViewLink');
  });

  it('uses the reported size and webViewLink when Drive provides them', async () => {
    await useBackupStore.getState().backupNow();
    const { cloud } = useBackupStore.getState();
    expect(cloud).toMatchObject({ size: 123, webViewLink: 'https://drive/x' });
  });

  it('fails when no one is signed in, without touching Drive', async () => {
    mocks.authState.fbUser = null;
    const result = await useBackupStore.getState().backupNow();
    expect(result.ok).toBe(false);
    expect(mocks.drive.uploadBackup).not.toHaveBeenCalled();
    expect(useBackupStore.getState().phase).toBe('idle');
  });

  it('disconnects when Drive reports the token is no longer valid', async () => {
    mocks.drive.uploadBackup.mockRejectedValue(new mocks.DriveError('not-connected', 'Reconnect required.'));
    useBackupStore.setState({ connected: true, autoSync: true });
    const result = await useBackupStore.getState().backupNow();
    expect(result).toEqual({ ok: false, error: 'Reconnect required.' });
    expect(useBackupStore.getState()).toMatchObject({ connected: false, autoSync: false });
  });

  it('keeps the connection on an ordinary upload failure', async () => {
    mocks.drive.uploadBackup.mockRejectedValue(new Error('network down'));
    useBackupStore.setState({ connected: true });
    await useBackupStore.getState().backupNow();
    expect(useBackupStore.getState().connected).toBe(true);
    expect(useBackupStore.getState().lastError).toBe('network down');
  });
});

describe('restoreNow', () => {
  it('rejects a concurrent call while busy', async () => {
    useBackupStore.setState({ phase: 'backing-up' });
    const result = await useBackupStore.getState().restoreNow();
    expect(result).toEqual({ ok: false, error: 'Already working…' });
    expect(mocks.drive.downloadBackup).not.toHaveBeenCalled();
  });

  it('reports no backup found when Drive has nothing', async () => {
    mocks.drive.downloadBackup.mockResolvedValue(null);
    const result = await useBackupStore.getState().restoreNow();
    expect(result).toEqual({ ok: false, error: 'There is no backup in your Google Drive yet.' });
    expect(mocks.backupService.parseBackup).not.toHaveBeenCalled();
  });

  it('applies a found backup and records the restore, preserving prior cloud metadata', async () => {
    useBackupStore.setState({ cloud: { modifiedTime: 'old', size: 1 } as any });
    const result = await useBackupStore.getState().restoreNow();
    expect(result).toEqual({ ok: true });
    const { lastRestoreAt, cloud, phase } = useBackupStore.getState();
    expect(phase).toBe('idle');
    expect(lastRestoreAt).toBeTypeOf('number');
    expect(cloud).toMatchObject({ modifiedTime: 'old', size: 1, summary: expect.any(Object) });
    expect(mocks.backupService.applyBackup).toHaveBeenCalledWith(expect.anything(), 'u1');
  });

  it('starts the cloud metadata fresh (no spread of a prior null) when nothing was cached yet', async () => {
    // initialState has cloud: null, and this test does not set it beforehand.
    const result = await useBackupStore.getState().restoreNow();
    expect(result).toEqual({ ok: true });
    expect(useBackupStore.getState().cloud).toEqual({ summary: expect.any(Object) });
  });

  it('surfaces a BackupFormatError message verbatim', async () => {
    mocks.backupService.parseBackup.mockImplementation(() => {
      throw new mocks.backupService.BackupFormatError('That file is not a Smart Planner backup.');
    });
    const result = await useBackupStore.getState().restoreNow();
    expect(result).toEqual({ ok: false, error: 'That file is not a Smart Planner backup.' });
  });

  it('disconnects when Drive reports the token is no longer valid', async () => {
    mocks.drive.downloadBackup.mockRejectedValue(new mocks.DriveError('not-connected', 'Reconnect required.'));
    useBackupStore.setState({ connected: true });
    await useBackupStore.getState().restoreNow();
    expect(useBackupStore.getState().connected).toBe(false);
  });
});

describe('refreshCloudInfo', () => {
  it('does nothing when not connected', async () => {
    await useBackupStore.getState().refreshCloudInfo();
    expect(mocks.drive.migrateLegacyBackup).not.toHaveBeenCalled();
  });

  it('prefers a migrated legacy file over a fresh lookup', async () => {
    mocks.drive.migrateLegacyBackup.mockResolvedValue({ modifiedTime: 'legacy', size: 10 });
    useBackupStore.setState({ connected: true });
    await useBackupStore.getState().refreshCloudInfo();
    expect(mocks.drive.findBackupFile).not.toHaveBeenCalled();
    expect(useBackupStore.getState().cloud).toMatchObject({ modifiedTime: 'legacy', size: 10 });
  });

  it('falls back to a fresh lookup when there is nothing to migrate', async () => {
    mocks.drive.findBackupFile.mockResolvedValue({ modifiedTime: 'fresh' });
    useBackupStore.setState({ connected: true });
    await useBackupStore.getState().refreshCloudInfo();
    expect(useBackupStore.getState().cloud).toMatchObject({ modifiedTime: 'fresh' });
  });

  it('sets cloud to null when Drive has no backup at all', async () => {
    useBackupStore.setState({ connected: true, cloud: { modifiedTime: 'stale' } as any });
    await useBackupStore.getState().refreshCloudInfo();
    expect(useBackupStore.getState().cloud).toBeNull();
  });

  it('disconnects when Drive reports the token is no longer valid', async () => {
    mocks.drive.migrateLegacyBackup.mockRejectedValue(new mocks.DriveError('not-connected', 'Reconnect required.'));
    useBackupStore.setState({ connected: true });
    await useBackupStore.getState().refreshCloudInfo();
    expect(useBackupStore.getState().connected).toBe(false);
  });

  it('includes the webViewLink when Drive provides one', async () => {
    mocks.drive.findBackupFile.mockResolvedValue({ modifiedTime: 'fresh', webViewLink: 'https://drive/y' });
    useBackupStore.setState({ connected: true });
    await useBackupStore.getState().refreshCloudInfo();
    expect(useBackupStore.getState().cloud).toMatchObject({ webViewLink: 'https://drive/y' });
  });

  it('keeps the connection on an ordinary (non-DriveError) failure', async () => {
    mocks.drive.migrateLegacyBackup.mockRejectedValue(new Error('network down'));
    useBackupStore.setState({ connected: true });
    await useBackupStore.getState().refreshCloudInfo();
    expect(useBackupStore.getState()).toMatchObject({ connected: true, lastError: 'network down' });
  });
});

describe('deleteCloudBackup', () => {
  it('clears local backup metadata when a backup existed', async () => {
    useBackupStore.setState({ cloud: { modifiedTime: 'x' } as any, lastBackupAt: 123 });
    const result = await useBackupStore.getState().deleteCloudBackup();
    expect(result).toEqual({ ok: true });
    expect(useBackupStore.getState()).toMatchObject({ cloud: null, lastBackupAt: null });
  });

  it('reports failure when there was nothing to delete', async () => {
    mocks.drive.deleteBackup.mockResolvedValue(false);
    const result = await useBackupStore.getState().deleteCloudBackup();
    expect(result).toEqual({ ok: false, error: 'There was no backup to delete.' });
  });

  it('surfaces an error from Drive', async () => {
    mocks.drive.deleteBackup.mockRejectedValue(new Error('boom'));
    const result = await useBackupStore.getState().deleteCloudBackup();
    expect(result).toEqual({ ok: false, error: 'boom' });
    expect(mocks.reportError).toHaveBeenCalled();
  });
});

describe('clearError', () => {
  it('clears a previously set error', () => {
    useBackupStore.setState({ lastError: 'oops' });
    useBackupStore.getState().clearError();
    expect(useBackupStore.getState().lastError).toBeNull();
  });
});
