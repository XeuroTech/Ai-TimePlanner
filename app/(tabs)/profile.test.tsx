import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Alert } from 'react-native';

vi.mock('@expo/vector-icons', () => ({
  Ionicons: (props: any) => <span data-testid="icon" data-name={props.name} />,
}));

vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => mocks.insets,
}));

vi.mock('@/lib/storage', () => ({
  zustandStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
}));

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), back: vi.fn() },
  insets: { top: 0, bottom: 0, left: 0, right: 0 },
  authState: {
    fbUser: null as { uid: string; email?: string } | null,
    profile: null as { name?: string; category?: string; preferences: Record<string, unknown> } | null,
    logout: vi.fn(async () => {}),
    deleteAccount: vi.fn(async () => ({ ok: true }) as { ok: boolean; error?: string }),
    updateProfile: vi.fn(async () => {}),
  },
  backupState: {
    connected: false,
    lastBackupAt: null as number | null,
    hydrate: vi.fn(async () => {}),
  },
  getNotificationPermission: vi.fn(async () => 'granted' as 'granted' | 'denied' | 'undetermined'),
  requestNotificationPermission: vi.fn(async () => 'granted' as 'granted' | 'denied' | 'undetermined'),
}));

vi.mock('expo-router', () => ({ useRouter: () => mocks.router }));

vi.mock('@/lib/services/notifications', () => ({
  getNotificationPermission: mocks.getNotificationPermission,
  requestNotificationPermission: mocks.requestNotificationPermission,
}));

vi.mock('@/store/auth-store', () => ({
  useAuthStore: Object.assign((selector: (s: typeof mocks.authState) => unknown) => selector(mocks.authState), {
    getState: () => mocks.authState,
  }),
}));

vi.mock('@/store/backup-store', () => ({
  useBackupStore: Object.assign((selector: (s: typeof mocks.backupState) => unknown) => selector(mocks.backupState), {
    getState: () => mocks.backupState,
  }),
}));

import { useThemeStore } from '@/store/theme-store';
import { ToastProvider } from '@/components/ui/toast';
import ProfileScreen from './profile';

function renderScreen() {
  return render(
    <ToastProvider>
      <ProfileScreen />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.insets = { top: 0, bottom: 0, left: 0, right: 0 };
  mocks.authState.fbUser = null;
  mocks.authState.profile = null;
  mocks.backupState.connected = false;
  mocks.backupState.lastBackupAt = null;
  mocks.getNotificationPermission.mockResolvedValue('granted');
  mocks.requestNotificationPermission.mockResolvedValue('granted');
  useThemeStore.setState({ darkMode: false, notificationsEnabled: true });
  vi.spyOn(Alert, 'alert').mockImplementation(() => {});
});

describe('ProfileScreen', () => {
  it('shows Guest defaults when signed out, with no email and the default category', () => {
    renderScreen();
    expect(screen.getByText('Guest')).toBeTruthy();
    expect(screen.getByText('G')).toBeTruthy(); // avatar initial
    expect(screen.getByText('Other')).toBeTruthy(); // getCategory(undefined) falls back to 'other'
    expect(screen.getByText('Upgrade to Premium')).toBeTruthy();
    expect(screen.queryByText('PRO')).toBeNull();
  });

  it("shows the signed-in user's name, email and chosen category", () => {
    mocks.authState.fbUser = { uid: 'u1', email: 'jane@example.com' };
    mocks.authState.profile = { name: 'Jane', category: 'student', preferences: {} };
    renderScreen();
    expect(screen.getByText('Jane')).toBeTruthy();
    expect(screen.getByText('J')).toBeTruthy();
    expect(screen.getByText('jane@example.com')).toBeTruthy();
    expect(screen.getByText('Student')).toBeTruthy();
  });

  it('shows the PRO badge and premium banner copy when the profile is on the premium plan', () => {
    mocks.authState.profile = { preferences: { plan: 'premium' } };
    renderScreen();
    expect(screen.getByText('PRO')).toBeTruthy();
    expect(screen.getByText('Premium Member')).toBeTruthy();
    expect(screen.getByText(/All features unlocked/)).toBeTruthy();
  });

  it('shows the upgrade banner copy on the free plan', () => {
    mocks.authState.profile = { preferences: {} };
    renderScreen();
    expect(screen.queryByText('PRO')).toBeNull();
    expect(screen.getByText('Upgrade to Premium')).toBeTruthy();
    expect(screen.getByText(/Unlimited AI schedules/)).toBeTruthy();
  });

  it('navigates to /daily-routine, /habits, /backup and /settings from their respective rows', () => {
    renderScreen();
    fireEvent.click(screen.getByText('Daily Routine'));
    expect(mocks.router.push).toHaveBeenCalledWith('/daily-routine');
    fireEvent.click(screen.getByText('Habit Tracker'));
    expect(mocks.router.push).toHaveBeenCalledWith('/habits');
    fireEvent.click(screen.getByText('Backup & Sync'));
    expect(mocks.router.push).toHaveBeenCalledWith('/backup');
    fireEvent.click(screen.getByText('Settings'));
    expect(mocks.router.push).toHaveBeenCalledWith('/settings');
  });

  it('navigates to /settings from the avatar edit button and to /premium from the banner', () => {
    renderScreen();
    const icons = screen.getAllByTestId('icon');
    const pencil = icons.find((n) => n.getAttribute('data-name') === 'pencil')!;
    fireEvent.click(pencil);
    expect(mocks.router.push).toHaveBeenCalledWith('/settings');
    fireEvent.click(screen.getByText('Upgrade to Premium'));
    expect(mocks.router.push).toHaveBeenCalledWith('/premium');
  });

  it('shows a "Coming soon" toast for a nav row with no route (Help & Support)', () => {
    renderScreen();
    fireEvent.click(screen.getByText('Help & Support'));
    expect(screen.getByText('Coming soon.')).toBeTruthy();
    expect(mocks.router.push).not.toHaveBeenCalled();
  });

  it('does nothing when pressing a "value" row (Language)', () => {
    renderScreen();
    fireEvent.click(screen.getByText('Language'));
    expect(mocks.router.push).not.toHaveBeenCalled();
    expect(screen.queryByText('Coming soon.')).toBeNull();
  });

  it.each([
    [false, null, 'Off'],
    [true, null, 'Connected'],
    [true, 1717000000000, 'Synced'],
  ] as const)('shows "%s"/"%s" backup state as "%s"', (connected, lastBackupAt, expected) => {
    mocks.backupState.connected = connected;
    mocks.backupState.lastBackupAt = lastBackupAt;
    renderScreen();
    expect(screen.getByText(expected)).toBeTruthy();
  });

  it('hydrates the backup connection state on mount', async () => {
    renderScreen();
    await waitFor(() => expect(mocks.backupState.hydrate).toHaveBeenCalledTimes(1));
  });

  it('toggles dark mode directly via the store', () => {
    renderScreen();
    const switches = screen.getAllByRole('switch');
    // PREFERENCES order: Daily Routine (nav), Habit Tracker (nav), Notifications (switch 0), Dark Mode (switch 1)
    fireEvent.click(switches[1]);
    expect(useThemeStore.getState().darkMode).toBe(true);
  });

  it('turns notifications off immediately without requesting permission', async () => {
    renderScreen();
    const switches = screen.getAllByRole('switch');
    fireEvent.click(switches[0]);
    await waitFor(() => expect(useThemeStore.getState().notificationsEnabled).toBe(false));
    expect(mocks.requestNotificationPermission).not.toHaveBeenCalled();
  });

  it('requests permission when turning notifications on, and enables it when granted', async () => {
    useThemeStore.setState({ notificationsEnabled: false });
    mocks.requestNotificationPermission.mockResolvedValue('granted');
    renderScreen();
    const switches = screen.getAllByRole('switch');
    fireEvent.click(switches[0]);
    await waitFor(() => expect(useThemeStore.getState().notificationsEnabled).toBe(true));
    expect(mocks.requestNotificationPermission).toHaveBeenCalledTimes(1);
  });

  it('keeps notifications off and shows an error toast when permission is denied', async () => {
    useThemeStore.setState({ notificationsEnabled: false });
    mocks.requestNotificationPermission.mockResolvedValue('denied');
    renderScreen();
    const switches = screen.getAllByRole('switch');
    fireEvent.click(switches[0]);
    await screen.findByText(/Notifications permission denied/);
    expect(useThemeStore.getState().notificationsEnabled).toBe(false);
  });

  it('force-disables notifications if the OS permission was revoked behind the app\'s back', async () => {
    useThemeStore.setState({ notificationsEnabled: true });
    mocks.getNotificationPermission.mockResolvedValue('denied');
    renderScreen();
    await waitFor(() => expect(useThemeStore.getState().notificationsEnabled).toBe(false));
  });

  it('does not re-check OS permission when notifications are already off', () => {
    useThemeStore.setState({ notificationsEnabled: false });
    renderScreen();
    expect(mocks.getNotificationPermission).not.toHaveBeenCalled();
  });

  it('opens the category picker and switches category on selecting a different one', () => {
    mocks.authState.fbUser = { uid: 'u1' };
    mocks.authState.profile = { category: 'other', preferences: {} };
    renderScreen();
    expect(screen.queryByText('Choose your category')).toBeNull();
    fireEvent.click(screen.getAllByText('Other')[0]); // category chip
    expect(screen.getByText('Choose your category')).toBeTruthy();
    fireEvent.click(screen.getByText('Employee'));
    expect(mocks.authState.updateProfile).toHaveBeenCalledWith({ category: 'employee' });
  });

  it('does not call updateProfile when re-selecting the already-active category', () => {
    mocks.authState.fbUser = { uid: 'u1' };
    mocks.authState.profile = { category: 'student', preferences: {} };
    renderScreen();
    fireEvent.click(screen.getByText('Student')); // opens picker via the chip
    fireEvent.click(screen.getAllByText('Student').slice(-1)[0]); // the row inside the sheet
    expect(mocks.authState.updateProfile).not.toHaveBeenCalled();
  });

  it('confirms logout through the native alert and calls the auth store', async () => {
    renderScreen();
    fireEvent.click(screen.getByText('Logout'));
    expect(Alert.alert).toHaveBeenCalledWith(
      'Log out',
      'Are you sure you want to log out?',
      expect.any(Array),
    );
    const buttons = (Alert.alert as any).mock.calls[0][2];
    const confirm = buttons.find((b: any) => b.text === 'Log out');
    await confirm.onPress();
    expect(mocks.authState.logout).toHaveBeenCalledTimes(1);
  });

  it('confirms account deletion and shows no extra alert when it succeeds', async () => {
    mocks.authState.deleteAccount.mockResolvedValue({ ok: true });
    renderScreen();
    fireEvent.click(screen.getByText('Delete Account'));
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const buttons = (Alert.alert as any).mock.calls[0][2];
    const confirm = buttons.find((b: any) => b.text === 'Delete');
    await confirm.onPress();
    expect(mocks.authState.deleteAccount).toHaveBeenCalledTimes(1);
    expect(Alert.alert).toHaveBeenCalledTimes(1); // no follow-up error alert
  });

  it('shows a follow-up alert with the failure reason when account deletion fails', async () => {
    mocks.authState.deleteAccount.mockResolvedValue({ ok: false, error: 'Network error' });
    renderScreen();
    fireEvent.click(screen.getByText('Delete Account'));
    const buttons = (Alert.alert as any).mock.calls[0][2];
    const confirm = buttons.find((b: any) => b.text === 'Delete');
    await confirm.onPress();
    expect(Alert.alert).toHaveBeenLastCalledWith('Could not delete account', 'Network error');
  });

  it('falls back to a generic message when account deletion fails without an error string', async () => {
    mocks.authState.deleteAccount.mockResolvedValue({ ok: false });
    renderScreen();
    fireEvent.click(screen.getByText('Delete Account'));
    const buttons = (Alert.alert as any).mock.calls[0][2];
    const confirm = buttons.find((b: any) => b.text === 'Delete');
    await confirm.onPress();
    expect(Alert.alert).toHaveBeenLastCalledWith('Could not delete account', 'Please try again.');
  });

  it('renders without crashing when the device reports a bottom safe-area inset', () => {
    // Exercises the `insets.bottom > 0 ? insets.bottom : 12` branch used to pad
    // the scroll content above the tab bar (there's nothing else observable
    // from outside — the content itself is unaffected).
    mocks.insets = { top: 0, bottom: 24, left: 0, right: 0 };
    renderScreen();
    expect(screen.getByText('Guest')).toBeTruthy();
  });

  async function expectPressedOpacity(el: HTMLElement, opacity: string) {
    fireEvent.mouseDown(el);
    await waitFor(() => expect(getComputedStyle(el).opacity).toBe(opacity));
    fireEvent.mouseUp(el);
  }

  it('applies the pressed style while held down on the nav rows, avatar edit button, category chip, premium banner, logout and delete-account buttons', async () => {
    mocks.authState.profile = { preferences: {} }; // free plan: exactly one "diamond" icon (the banner)
    renderScreen();
    const iconByName = (name: string) => screen.getAllByTestId('icon').find((n) => n.getAttribute('data-name') === name)!;

    // Nav row (Daily Routine): pressed && row.kind !== 'toggle' && styles.rowPressed
    await expectPressedOpacity(iconByName('alarm-outline').parentElement!.parentElement!, '0.6');

    // Avatar edit button: pressed && styles.pressed
    await expectPressedOpacity(iconByName('pencil').parentElement!, '0.6');

    // Category chip: pressed && styles.pressed
    await expectPressedOpacity(iconByName('chevron-down').parentElement!, '0.6');

    // Premium/upgrade banner: pressed && styles.premiumPressed
    await expectPressedOpacity(iconByName('diamond').parentElement!.parentElement!, '0.7');

    // Logout button: pressed && styles.logoutPressed
    await expectPressedOpacity(iconByName('log-out-outline').parentElement!, '0.85');

    // Delete Account (text-only Pressable): pressed && styles.pressed
    await expectPressedOpacity(screen.getByText('Delete Account').parentElement!, '0.6');
  });

  it('applies the pressed style to a row inside the category picker sheet', async () => {
    mocks.authState.fbUser = { uid: 'u1' };
    mocks.authState.profile = { category: 'other', preferences: {} };
    renderScreen();
    fireEvent.click(screen.getAllByText('Other')[0]); // opens the sheet via the chip
    const studentIcon = screen.getAllByTestId('icon').find((n) => n.getAttribute('data-name') === 'school')!;
    await expectPressedOpacity(studentIcon.parentElement!.parentElement!, '0.6');
  });

  /**
   * react-native-web's <Modal animationType="slide"> keeps the whole subtree
   * mounted until a CSS `animationend` fires on its internal animation
   * wrapper div, and jsdom never runs real CSS animations, so tests must
   * dispatch it manually. That handler bails out unless
   * `e.currentTarget === e.target`, so a bubbled event from a descendant
   * never reaches it — fire it on every ancestor up to <body> instead (a
   * no-op on the wrong element) rather than guessing which nested wrapper is
   * the real one.
   */
  function fireAnimationEndOnAncestors(from: HTMLElement) {
    let el: HTMLElement | null = from;
    while (el && el.tagName !== 'BODY') {
      fireEvent.animationEnd(el);
      el = el.parentElement;
    }
  }

  it('closes the category picker when tapping the backdrop', () => {
    renderScreen();
    fireEvent.click(screen.getByText('Other')); // category chip opens the sheet
    const heading = screen.getByText('Choose your category');
    expect(heading).toBeTruthy();
    const backdrop = heading.parentElement!.previousElementSibling as HTMLElement;
    fireEvent.click(backdrop);
    fireAnimationEndOnAncestors(heading);
    expect(screen.queryByText('Choose your category')).toBeNull();
  });

  it('closes the category picker on Escape once the open animation has settled', () => {
    renderScreen();
    fireEvent.click(screen.getByText('Other'));
    const heading = screen.getByText('Choose your category');
    // Simulate the opening animation finishing so the modal becomes "active"
    // (react-native-web only listens for Escape while active).
    fireAnimationEndOnAncestors(heading);
    fireEvent.keyUp(document, { key: 'Escape' });
    // And the closing animation finishing so the content actually unmounts.
    fireAnimationEndOnAncestors(heading);
    expect(screen.queryByText('Choose your category')).toBeNull();
  });
});
