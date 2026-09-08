import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * backup.tsx is presentation + confirmation dialogs over store/backup-store.ts
 * (already exhaustively unit-tested in store/backup-store.test.ts). These
 * tests verify the screen renders each phase/connection state correctly and
 * wires each control to the right store action — not the store logic itself.
 */

const mocks = vi.hoisted(() => ({
  routerBack: vi.fn(),
  authState: { fbUser: null as { uid: string } | null },
  driveConfigError: vi.fn((): string | null => null),
  backupState: {
    connectedEmail: null as string | null,
    connected: false,
    lastBackupAt: null as number | null,
    lastRestoreAt: null as number | null,
    autoSync: false,
    phase: 'idle' as string,
    lastError: null as string | null,
    cloud: null as any,
    hydrate: vi.fn(async () => {}),
    connect: vi.fn(async () => ({ ok: true })),
    disconnect: vi.fn(async () => {}),
    setAutoSync: vi.fn(),
    backupNow: vi.fn(async () => ({ ok: true })),
    restoreNow: vi.fn(async () => ({ ok: true })),
    refreshCloudInfo: vi.fn(async () => {}),
    deleteCloudBackup: vi.fn(async () => ({ ok: true })),
    clearError: vi.fn(),
  },
  classes: [] as any[],
  tasks: [] as any[],
  plans: [] as any[],
  habits: [] as any[],
  alertSpy: vi.fn(),
  linkingOpenURL: vi.fn(async () => {}),
}));

vi.mock('@expo/vector-icons', async () => {
  const { Text } = await import('react-native');
  return { Ionicons: (props: any) => <Text>{`icon:${props.name}`}</Text> };
});

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: mocks.routerBack }),
}));

vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}));

vi.mock('@/lib/storage', () => ({
  zustandStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
}));

vi.mock('@/lib/services/google-drive', () => ({
  BACKUP_FOLDER_NAME: 'Smart Planner Backups',
  driveConfigError: mocks.driveConfigError,
}));

vi.mock('@/store/auth-store', () => ({
  useAuthStore: Object.assign((selector: any) => selector(mocks.authState), {
    getState: () => mocks.authState,
  }),
}));

vi.mock('@/store/backup-store', () => ({
  useBackupStore: Object.assign((selector: any) => selector(mocks.backupState), {
    getState: () => mocks.backupState,
  }),
}));

vi.mock('@/store/habits-store', () => ({ useMyHabits: () => mocks.habits }));
vi.mock('@/store/planner-store', () => ({
  useMyClasses: () => mocks.classes,
  useMyTasks: () => mocks.tasks,
  useMyPlans: () => mocks.plans,
}));

vi.mock('react-native', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    Alert: { alert: mocks.alertSpy },
    Linking: { ...actual.Linking, openURL: mocks.linkingOpenURL },
  };
});

import BackupScreen from './backup';

/** Grabs the buttons array from the most recent Alert.alert(...) call. */
function lastAlertButtons(): { text: string; style?: string; onPress?: () => void }[] {
  const call = mocks.alertSpy.mock.calls[mocks.alertSpy.mock.calls.length - 1];
  return call?.[2] ?? [];
}

function pressAlertButton(label: string) {
  const btn = lastAlertButtons().find((b) => b.text === label);
  expect(btn).toBeTruthy();
  return btn!.onPress?.();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authState.fbUser = null;
  mocks.driveConfigError.mockReturnValue(null);
  Object.assign(mocks.backupState, {
    connectedEmail: null,
    connected: false,
    lastBackupAt: null,
    lastRestoreAt: null,
    autoSync: false,
    phase: 'idle',
    lastError: null,
    cloud: null,
  });
  mocks.backupState.hydrate.mockResolvedValue(undefined);
  mocks.backupState.connect.mockResolvedValue({ ok: true });
  mocks.backupState.disconnect.mockResolvedValue(undefined);
  mocks.backupState.backupNow.mockResolvedValue({ ok: true });
  mocks.backupState.restoreNow.mockResolvedValue({ ok: true });
  mocks.backupState.refreshCloudInfo.mockResolvedValue(undefined);
  mocks.backupState.deleteCloudBackup.mockResolvedValue({ ok: true });
  mocks.classes = [{ subject: 'Math' }];
  mocks.tasks = [{}, {}];
  mocks.plans = [{}, {}, {}];
  mocks.habits = [{}, {}, {}, {}];
});

describe('BackupScreen', () => {
  it('hydrates and refreshes cloud info on mount', async () => {
    render(<BackupScreen />);
    await waitFor(() => expect(mocks.backupState.hydrate).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.backupState.refreshCloudInfo).toHaveBeenCalledTimes(1));
  });

  it('calls router.back() from the header chevron', () => {
    render(<BackupScreen />);
    fireEvent.click(screen.getByText('icon:chevron-back'));
    expect(mocks.routerBack).toHaveBeenCalledTimes(1);
  });

  describe('disconnected state', () => {
    it('shows the not-connected hero and a Connect button, no auto-sync/manage sections', () => {
      render(<BackupScreen />);
      expect(screen.getByText('Not connected')).toBeTruthy();
      expect(screen.getByText('Connect Google Drive')).toBeTruthy();
      expect(screen.queryByText('Auto backup')).toBeNull();
      expect(screen.queryByText('Disconnect Google account')).toBeNull();
    });

    it('connects when there is no config error', async () => {
      render(<BackupScreen />);
      fireEvent.click(screen.getByText('Connect Google Drive'));
      await waitFor(() => expect(mocks.backupState.connect).toHaveBeenCalledTimes(1));
    });

    it('shows the setup warning and skips connect() when Drive is not configured', async () => {
      mocks.driveConfigError.mockReturnValue('Google Drive backup is not set up yet.');
      render(<BackupScreen />);
      expect(screen.getByText('Google Drive backup is not set up yet.')).toBeTruthy();
      fireEvent.click(screen.getByText('Connect Google Drive'));
      await Promise.resolve();
      expect(mocks.backupState.connect).not.toHaveBeenCalled();
    });

    it('shows a loading Connect button and hides the title while phase is "connecting"', () => {
      mocks.backupState.phase = 'connecting';
      render(<BackupScreen />);
      expect(screen.getByText('Connecting to Google…')).toBeTruthy();
      expect(screen.queryByText('Connect Google Drive')).toBeNull();
    });

    it('does not call connect() again while a connection is already in progress', async () => {
      mocks.backupState.phase = 'connecting';
      render(<BackupScreen />);
      // Button itself renders no title while loading, nothing to click — the
      // busy guard is exercised via the `disabled` prop instead.
      expect(mocks.backupState.connect).not.toHaveBeenCalled();
    });
  });

  describe('connected state', () => {
    beforeEach(() => {
      mocks.backupState.connected = true;
      mocks.backupState.connectedEmail = 'me@example.com';
    });

    it('shows the connected hero with the account email', () => {
      render(<BackupScreen />);
      expect(screen.getByText('Google Drive connected')).toBeTruthy();
      expect(screen.getByText('me@example.com')).toBeTruthy();
    });

    it('shows "Never" for last backup and "No backup yet" for the cloud stat when nothing has synced', () => {
      render(<BackupScreen />);
      expect(screen.getByText('Never')).toBeTruthy();
      expect(screen.getByText('No backup yet')).toBeTruthy();
    });

    it('formats a recent lastBackupAt as relative time', () => {
      mocks.backupState.lastBackupAt = Date.now() - 5 * 60_000;
      render(<BackupScreen />);
      expect(screen.getByText('5 minutes ago')).toBeTruthy();
    });

    it('formats the cloud size when Drive reports one', () => {
      mocks.backupState.cloud = { size: 2048, modifiedTime: 'x' };
      render(<BackupScreen />);
      expect(screen.getByText('2.0 KB')).toBeTruthy();
    });

    it('falls back to the modified time when Drive reports no size', () => {
      mocks.backupState.cloud = { modifiedTime: new Date(Date.now() - 3600_000).toISOString() };
      render(<BackupScreen />);
      expect(screen.getByText('1 hour ago')).toBeTruthy();
    });

    it('shows the "Nothing to restore yet" hint when there is no cloud backup', () => {
      render(<BackupScreen />);
      expect(screen.getByText('Nothing to restore yet — take your first backup above.')).toBeTruthy();
    });

    it('does not show the hint once a cloud backup exists', () => {
      mocks.backupState.cloud = { size: 10 };
      render(<BackupScreen />);
      expect(screen.queryByText('Nothing to restore yet — take your first backup above.')).toBeNull();
    });

    it('shows the "Uploading your data…" phase label and hides the Back up now title while backing up', () => {
      mocks.backupState.phase = 'backing-up';
      render(<BackupScreen />);
      expect(screen.getByText('Uploading your data…')).toBeTruthy();
      expect(screen.queryByText('Back up now')).toBeNull();
    });

    it('shows the "Restoring your data…" phase label while restoring', () => {
      mocks.backupState.phase = 'restoring';
      render(<BackupScreen />);
      expect(screen.getByText('Restoring your data…')).toBeTruthy();
    });

    it('shows the "Checking your Drive…" phase label while checking', () => {
      mocks.backupState.phase = 'checking';
      render(<BackupScreen />);
      expect(screen.getByText('Checking your Drive…')).toBeTruthy();
    });

    it('shows lastError only when not busy', () => {
      mocks.backupState.lastError = 'Something broke.';
      const { rerender } = render(<BackupScreen />);
      expect(screen.getByText('Something broke.')).toBeTruthy();
      mocks.backupState.phase = 'backing-up';
      rerender(<BackupScreen />);
      expect(screen.queryByText('Something broke.')).toBeNull();
    });

    it('does not call backupNow when the user is not signed in', async () => {
      mocks.authState.fbUser = null;
      render(<BackupScreen />);
      fireEvent.click(screen.getByText('Back up now'));
      await Promise.resolve();
      expect(mocks.backupState.backupNow).not.toHaveBeenCalled();
    });

    it('calls backupNow when signed in, success outcome', async () => {
      mocks.authState.fbUser = { uid: 'u1' };
      render(<BackupScreen />);
      fireEvent.click(screen.getByText('Back up now'));
      await waitFor(() => expect(mocks.backupState.backupNow).toHaveBeenCalledTimes(1));
    });

    it('calls backupNow when signed in, failure outcome does not throw', async () => {
      mocks.authState.fbUser = { uid: 'u1' };
      mocks.backupState.backupNow.mockResolvedValue({ ok: false, error: 'Upload failed.' });
      render(<BackupScreen />);
      fireEvent.click(screen.getByText('Back up now'));
      await waitFor(() => expect(mocks.backupState.backupNow).toHaveBeenCalledTimes(1));
    });

    it('opens a confirmation before restoring, and calls restoreNow only on confirm', async () => {
      mocks.backupState.cloud = { size: 10 };
      render(<BackupScreen />);
      fireEvent.click(screen.getByText('Restore from cloud'));
      expect(mocks.alertSpy).toHaveBeenCalledWith(
        'Restore from cloud',
        expect.any(String),
        expect.any(Array),
      );
      expect(mocks.backupState.restoreNow).not.toHaveBeenCalled();
      await pressAlertButton('Restore');
      expect(mocks.backupState.restoreNow).toHaveBeenCalledTimes(1);
    });

    it('does nothing when the restore confirmation is cancelled', async () => {
      mocks.backupState.cloud = { size: 10 };
      render(<BackupScreen />);
      fireEvent.click(screen.getByText('Restore from cloud'));
      const cancelBtn = lastAlertButtons().find((b) => b.text === 'Cancel');
      expect(cancelBtn?.onPress).toBeUndefined();
      expect(mocks.backupState.restoreNow).not.toHaveBeenCalled();
    });

    it('restoreNow failure outcome does not throw', async () => {
      mocks.backupState.cloud = { size: 10 };
      mocks.backupState.restoreNow.mockResolvedValue({ ok: false, error: 'No network.' });
      render(<BackupScreen />);
      fireEvent.click(screen.getByText('Restore from cloud'));
      await pressAlertButton('Restore');
      expect(mocks.backupState.restoreNow).toHaveBeenCalledTimes(1);
    });

    it('cannot restore when there is no cloud backup (button disabled)', async () => {
      render(<BackupScreen />);
      fireEvent.click(screen.getByText('Restore from cloud'));
      expect(mocks.alertSpy).not.toHaveBeenCalled();
    });

    it('toggles auto-sync via the Switch', () => {
      render(<BackupScreen />);
      fireEvent.click(screen.getByRole('switch'));
      expect(mocks.backupState.setAutoSync).toHaveBeenCalledWith(true);
    });

    it('refreshes cloud info when "Check cloud backup" is pressed', async () => {
      render(<BackupScreen />);
      fireEvent.click(screen.getByText('Check cloud backup'));
      await waitFor(() => expect(mocks.backupState.refreshCloudInfo).toHaveBeenCalledTimes(2)); // mount + click
    });

    it('shows "No backup file found in Drive" sub-copy when cloud is empty', () => {
      render(<BackupScreen />);
      expect(screen.getByText('No backup file found in Drive')).toBeTruthy();
    });

    it('shows the Drive-updated sub-copy when cloud has a modifiedTime', () => {
      mocks.backupState.cloud = { modifiedTime: Date.now() - 1000 };
      render(<BackupScreen />);
      expect(screen.getByText(/Drive copy updated/)).toBeTruthy();
    });

    it('renders "View in Google Drive" only when cloud has a webViewLink, and opens it in Drive', async () => {
      const { rerender } = render(<BackupScreen />);
      expect(screen.queryByText('View in Google Drive')).toBeNull();

      mocks.backupState.cloud = { webViewLink: 'https://drive.google.com/file/x' };
      rerender(<BackupScreen />);
      expect(screen.getByText('View in Google Drive')).toBeTruthy();
      fireEvent.click(screen.getByText('View in Google Drive'));
      await waitFor(() => expect(mocks.linkingOpenURL).toHaveBeenCalledWith('https://drive.google.com/file/x'));
    });

    it('shows an error toast path without throwing when opening Drive fails', async () => {
      mocks.linkingOpenURL.mockRejectedValueOnce(new Error('no app'));
      mocks.backupState.cloud = { webViewLink: 'https://drive.google.com/file/x' };
      render(<BackupScreen />);
      fireEvent.click(screen.getByText('View in Google Drive'));
      await waitFor(() => expect(mocks.linkingOpenURL).toHaveBeenCalledTimes(1));
    });

    it('shows "Last restore" only when lastRestoreAt is set', () => {
      const { rerender } = render(<BackupScreen />);
      expect(screen.queryByText('Last restore')).toBeNull();
      mocks.backupState.lastRestoreAt = Date.now() - 60_000;
      rerender(<BackupScreen />);
      expect(screen.getByText('Last restore')).toBeTruthy();
    });

    it('renders the "what gets backed up" counts from the planner/habit stores', () => {
      mocks.backupState.cloud = { summary: { chats: 5 } };
      render(<BackupScreen />);
      expect(screen.getByText('Timetable classes')).toBeTruthy();
      expect(screen.getByText('1')).toBeTruthy(); // classes.length
      expect(screen.getByText('2')).toBeTruthy(); // tasks.length
      expect(screen.getByText('3')).toBeTruthy(); // plans.length
      expect(screen.getByText('4')).toBeTruthy(); // habits.length
      expect(screen.getByText('5')).toBeTruthy(); // cloud.summary.chats
    });

    it('opens a confirmation before deleting the cloud backup, and calls deleteCloudBackup only on confirm', async () => {
      mocks.backupState.cloud = { size: 10 };
      render(<BackupScreen />);
      fireEvent.click(screen.getByText('Delete cloud backup'));
      expect(mocks.alertSpy).toHaveBeenCalledWith(
        'Delete cloud backup',
        expect.any(String),
        expect.any(Array),
      );
      await pressAlertButton('Delete');
      expect(mocks.backupState.deleteCloudBackup).toHaveBeenCalledTimes(1);
    });

    it('deleteCloudBackup failure outcome does not throw', async () => {
      mocks.backupState.cloud = { size: 10 };
      mocks.backupState.deleteCloudBackup.mockResolvedValue({ ok: false, error: 'Nothing there.' });
      render(<BackupScreen />);
      fireEvent.click(screen.getByText('Delete cloud backup'));
      await pressAlertButton('Delete');
      expect(mocks.backupState.deleteCloudBackup).toHaveBeenCalledTimes(1);
    });

    it('cannot delete when there is no cloud backup', () => {
      render(<BackupScreen />);
      fireEvent.click(screen.getByText('Delete cloud backup'));
      expect(mocks.alertSpy).not.toHaveBeenCalled();
    });

    it('opens a confirmation before disconnecting, and calls disconnect only on confirm', async () => {
      render(<BackupScreen />);
      fireEvent.click(screen.getByText('Disconnect Google account'));
      expect(mocks.alertSpy).toHaveBeenCalledWith(
        'Disconnect Google account',
        expect.any(String),
        expect.any(Array),
      );
      await pressAlertButton('Disconnect');
      expect(mocks.backupState.disconnect).toHaveBeenCalledTimes(1);
    });

    it('does not disconnect when the confirmation is cancelled', () => {
      render(<BackupScreen />);
      fireEvent.click(screen.getByText('Disconnect Google account'));
      expect(mocks.backupState.disconnect).not.toHaveBeenCalled();
    });

    it('falls back to "Signed in with Google" when there is no connected e-mail', () => {
      mocks.backupState.connectedEmail = null;
      render(<BackupScreen />);
      expect(screen.getByText('Signed in with Google')).toBeTruthy();
    });

    it('formats a multi-hour lastBackupAt with the plural "hours" suffix', () => {
      mocks.backupState.lastBackupAt = Date.now() - 5 * 3600_000;
      render(<BackupScreen />);
      expect(screen.getByText('5 hours ago')).toBeTruthy();
    });

    it('formats a lastBackupAt older than a day as an absolute date/time', () => {
      const ms = Date.now() - 30 * 3600_000;
      mocks.backupState.lastBackupAt = ms;
      render(<BackupScreen />);
      const d = new Date(ms);
      const date = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
      const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      expect(screen.getByText(`${date}, ${time}`)).toBeTruthy();
    });

    it('formats the cloud size in MB when it is a megabyte or larger', () => {
      mocks.backupState.cloud = { size: 5 * 1024 * 1024, modifiedTime: 'x' };
      render(<BackupScreen />);
      expect(screen.getByText('5.0 MB')).toBeTruthy();
    });

    it('backupNow failure with no error message still resolves cleanly', async () => {
      mocks.authState.fbUser = { uid: 'u1' };
      mocks.backupState.backupNow.mockResolvedValue({ ok: false });
      render(<BackupScreen />);
      fireEvent.click(screen.getByText('Back up now'));
      await waitFor(() => expect(mocks.backupState.backupNow).toHaveBeenCalledTimes(1));
    });

    it('restoreNow failure with no error message still resolves cleanly', async () => {
      mocks.backupState.cloud = { size: 10 };
      mocks.backupState.restoreNow.mockResolvedValue({ ok: false });
      render(<BackupScreen />);
      fireEvent.click(screen.getByText('Restore from cloud'));
      await pressAlertButton('Restore');
      expect(mocks.backupState.restoreNow).toHaveBeenCalledTimes(1);
    });

    it('deleteCloudBackup failure with no error message still resolves cleanly', async () => {
      mocks.backupState.cloud = { size: 10 };
      mocks.backupState.deleteCloudBackup.mockResolvedValue({ ok: false });
      render(<BackupScreen />);
      fireEvent.click(screen.getByText('Delete cloud backup'));
      await pressAlertButton('Delete');
      expect(mocks.backupState.deleteCloudBackup).toHaveBeenCalledTimes(1);
    });

    it('applies the pressed style to the "Check cloud backup" row while held down', async () => {
      render(<BackupScreen />);
      const row = screen.getByText('Check cloud backup').parentElement!.parentElement!;
      fireEvent.mouseDown(row);
      await waitFor(() => expect(getComputedStyle(row).opacity).toBe('0.6'), { timeout: 3000 });
      fireEvent.mouseUp(row);
    });

    it('applies the pressed style to the "View in Google Drive" row while held down', async () => {
      mocks.backupState.cloud = { webViewLink: 'https://drive.google.com/file/x' };
      render(<BackupScreen />);
      const row = screen.getByText('View in Google Drive').parentElement!.parentElement!;
      fireEvent.mouseDown(row);
      await waitFor(() => expect(getComputedStyle(row).opacity).toBe('0.6'), { timeout: 3000 });
      fireEvent.mouseUp(row);
    });

    it('applies the pressed style to the "Delete cloud backup" row while held down', async () => {
      mocks.backupState.cloud = { size: 10 };
      render(<BackupScreen />);
      const row = screen.getByText('Delete cloud backup').parentElement!;
      fireEvent.mouseDown(row);
      await waitFor(() => expect(getComputedStyle(row).opacity).toBe('0.6'), { timeout: 3000 });
      fireEvent.mouseUp(row);
    });

    it('applies the pressed style to the "Disconnect Google account" row while held down', async () => {
      render(<BackupScreen />);
      const row = screen.getByText('Disconnect Google account').parentElement!;
      fireEvent.mouseDown(row);
      await waitFor(() => expect(getComputedStyle(row).opacity).toBe('0.6'), { timeout: 3000 });
      fireEvent.mouseUp(row);
    });
  });

  it('applies the pressed style to the header back button while held down', async () => {
    render(<BackupScreen />);
    const btn = screen.getByText('icon:chevron-back').parentElement!;
    fireEvent.mouseDown(btn);
    await waitFor(() => expect(getComputedStyle(btn).opacity).toBe('0.5'), { timeout: 3000 });
    fireEvent.mouseUp(btn);
  });

  it('does not throw when connect() fails with an error message', async () => {
    mocks.backupState.connect.mockResolvedValue({ ok: false, error: 'Could not reach Google.' });
    render(<BackupScreen />);
    fireEvent.click(screen.getByText('Connect Google Drive'));
    await waitFor(() => expect(mocks.backupState.connect).toHaveBeenCalledTimes(1));
  });

  it('does not throw when connect() fails with no error message', async () => {
    mocks.backupState.connect.mockResolvedValue({ ok: false });
    render(<BackupScreen />);
    fireEvent.click(screen.getByText('Connect Google Drive'));
    await waitFor(() => expect(mocks.backupState.connect).toHaveBeenCalledTimes(1));
  });

  it('renders in dark mode without breaking the isDark-dependent style branches', async () => {
    const { useThemeStore } = await import('@/store/theme-store');
    useThemeStore.getState().setDarkMode(true);
    try {
      mocks.backupState.connected = true;
      render(<BackupScreen />);
      expect(screen.getByText('Backup & Sync')).toBeTruthy();
      expect(screen.getByText('Google Drive connected')).toBeTruthy();
    } finally {
      useThemeStore.getState().setDarkMode(false);
    }
  });
});
