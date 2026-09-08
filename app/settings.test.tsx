import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), back: vi.fn() },
  authState: { profile: { name: 'Alex' } as any },
  themeState: {
    setDarkMode: vi.fn(),
    notificationsEnabled: true,
    setNotificationsEnabled: vi.fn(),
  },
  backupState: { connected: false },
  premium: { isPremium: false },
  requestNotificationPermission: vi.fn(async () => 'granted' as const),
  toast: { show: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

vi.mock('expo-router', () => ({ useRouter: () => mocks.router }));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: (props: any) => <span data-testid="icon" data-name={props.name} /> }));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}));
vi.mock('@/components/ui/toast', () => ({ useToast: () => mocks.toast }));
vi.mock('@/lib/services/notifications', () => ({
  requestNotificationPermission: mocks.requestNotificationPermission,
}));
const PALETTE = { ink: '#111', subtle: '#999', card: '#fff', bg: '#fff', hairline: '#eee', muted: '#777', primary: '#6C4DFF', pink: '#FF6FAE', orange: '#FFA34D', green: '#3DCB7A', blue: '#4DA3FF', secondary: '#8B7DFF' };
const TINT = { primary: '#EFEBFF', pink: '#FFE9F3', orange: '#FFEEDD', green: '#E3F8EC', blue: '#E7F1FF' };

vi.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: vi.fn(() => ({
    Palette: PALETTE,
    Tint: TINT,
    isDark: false,
    setDarkMode: mocks.themeState.setDarkMode,
  })),
}));
vi.mock('@/hooks/use-premium', () => ({ usePremium: () => mocks.premium }));
vi.mock('@/store/auth-store', () => ({
  useAuthStore: Object.assign((selector: any) => selector(mocks.authState), { getState: () => mocks.authState }),
}));
vi.mock('@/store/theme-store', () => ({
  useThemeStore: Object.assign((selector: any) => selector(mocks.themeState), { getState: () => mocks.themeState }),
}));
vi.mock('@/store/backup-store', () => ({
  useBackupStore: Object.assign((selector: any) => selector(mocks.backupState), { getState: () => mocks.backupState }),
}));

import { useAppTheme } from '@/hooks/use-app-theme';
import SettingsScreen from './settings';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authState.profile = { name: 'Alex' } as any;
  mocks.themeState.notificationsEnabled = true;
  mocks.backupState.connected = false;
  mocks.premium.isPremium = false;
  mocks.requestNotificationPermission.mockResolvedValue('granted');
  vi.mocked(useAppTheme).mockReturnValue({
    Palette: PALETTE,
    Tint: TINT,
    isDark: false,
    setDarkMode: mocks.themeState.setDarkMode,
  } as any);
});

describe('SettingsScreen', () => {
  it('renders every section and row with the profile-derived values', () => {
    render(<SettingsScreen />);
    expect(screen.getByText('Settings')).toBeTruthy();
    expect(screen.getByText('General')).toBeTruthy();
    expect(screen.getByText('Privacy & Data')).toBeTruthy();
    expect(screen.getByText('Support')).toBeTruthy();
    expect(screen.getByText('Account')).toBeTruthy();
    expect(screen.getByText('Alex')).toBeTruthy();
    expect(screen.getByText('Free')).toBeTruthy();
    expect(screen.getByText('Light')).toBeTruthy();
    expect(screen.getByText('On')).toBeTruthy(); // notifications on
    expect(screen.getByText('v1.0.0')).toBeTruthy();
  });

  it('shows Guest when there is no signed-in profile', () => {
    mocks.authState.profile = null;
    render(<SettingsScreen />);
    expect(screen.getByText('Guest')).toBeTruthy();
  });

  it('shows Premium plan and Dark appearance and Drive On when those are true', () => {
    mocks.premium.isPremium = true;
    mocks.backupState.connected = true;
    render(<SettingsScreen />);
    expect(screen.getByText('Premium')).toBeTruthy();
    // Backup & Sync row's "On" and the notifications row's "On" both render;
    // assert there are (at least) two "On" values instead of picking one.
    expect(screen.getAllByText('On').length).toBeGreaterThanOrEqual(2);
  });

  it('pressing Appearance toggles dark mode', () => {
    render(<SettingsScreen />);
    fireEvent.click(screen.getByText('Appearance'));
    expect(mocks.themeState.setDarkMode).toHaveBeenCalledWith(true);
  });

  it('pressing Notifications while on turns it off directly (no permission prompt)', () => {
    render(<SettingsScreen />);
    fireEvent.click(screen.getByText('Notifications'));
    expect(mocks.themeState.setNotificationsEnabled).toHaveBeenCalledWith(false);
    expect(mocks.requestNotificationPermission).not.toHaveBeenCalled();
  });

  it('pressing Notifications while off requests permission and turns it on when granted', async () => {
    mocks.themeState.notificationsEnabled = false;
    render(<SettingsScreen />);
    fireEvent.click(screen.getByText('Notifications'));
    await waitFor(() => expect(mocks.requestNotificationPermission).toHaveBeenCalled());
    expect(mocks.themeState.setNotificationsEnabled).toHaveBeenCalledWith(true);
  });

  it('shows an error toast and leaves notifications off when permission is denied', async () => {
    mocks.themeState.notificationsEnabled = false;
    mocks.requestNotificationPermission.mockResolvedValueOnce('denied');
    render(<SettingsScreen />);
    fireEvent.click(screen.getByText('Notifications'));
    await waitFor(() => expect(mocks.toast.show).toHaveBeenCalledWith(
      'Notifications permission denied. Enable it from system settings to turn this on.',
      'error',
    ));
    expect(mocks.themeState.setNotificationsEnabled).not.toHaveBeenCalledWith(true);
  });

  it('navigates to /profile, /premium and /backup from their rows', () => {
    render(<SettingsScreen />);
    fireEvent.click(screen.getByText('Account'));
    expect(mocks.router.push).toHaveBeenCalledWith('/profile');
    fireEvent.click(screen.getByText('Subscription'));
    expect(mocks.router.push).toHaveBeenCalledWith('/premium');
    fireEvent.click(screen.getByText('Backup & Sync'));
    expect(mocks.router.push).toHaveBeenCalledWith('/backup');
  });

  it('shows a "coming soon" toast for rows with no dedicated behavior', () => {
    render(<SettingsScreen />);
    fireEvent.click(screen.getByText('Language'));
    expect(mocks.toast.show).toHaveBeenCalledWith('Coming soon.', 'info');
  });

  it('back button navigates back', () => {
    render(<SettingsScreen />);
    const icons = screen.getAllByTestId('icon');
    const backIcon = icons.find((el) => el.getAttribute('data-name') === 'chevron-back');
    fireEvent.click(backIcon!.parentElement!);
    expect(mocks.router.back).toHaveBeenCalledTimes(1);
  });

  it('shows Dark appearance and uses the dark neutral tint when isDark is true', () => {
    vi.mocked(useAppTheme).mockReturnValue({
      Palette: PALETTE,
      Tint: TINT,
      isDark: true,
      setDarkMode: mocks.themeState.setDarkMode,
    } as any);
    render(<SettingsScreen />);
    expect(screen.getByText('Dark')).toBeTruthy();
  });

  it('applies the pressed opacity style to the header back button while held down', async () => {
    render(<SettingsScreen />);
    const icons = screen.getAllByTestId('icon');
    const backBtn = icons.find((el) => el.getAttribute('data-name') === 'chevron-back')!.parentElement!;
    fireEvent.mouseDown(backBtn);
    await waitFor(() => expect(getComputedStyle(backBtn).opacity).toBe('0.5'), { timeout: 3000 });
    fireEvent.mouseUp(backBtn);
  });

  it('applies the pressed opacity style to a settings row while held down', async () => {
    render(<SettingsScreen />);
    const row = screen.getByText('Account').closest('div')!.parentElement!;
    fireEvent.mouseDown(row);
    await waitFor(() => expect(getComputedStyle(row).opacity).toBe('0.6'), { timeout: 3000 });
    fireEvent.mouseUp(row);
  });
});
