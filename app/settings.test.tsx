import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * Settings now only lists navigation rows (Account, Subscription, Language,
 * Security, Privacy, Terms, About) — the Appearance toggle, Notifications
 * toggle and Backup & Sync row that used to live here were moved onto the
 * Profile screen (see app/(tabs)/profile.tsx, which owns dark-mode /
 * notifications toggling and the Backup & Sync nav row now).
 */
const mocks = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), back: vi.fn() },
  authState: { profile: { name: 'Alex', preferences: {} } as any },
  premium: { isPremium: false },
}));

vi.mock('expo-router', () => ({ useRouter: () => mocks.router }));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: (props: any) => <span data-testid="icon" data-name={props.name} /> }));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}));
const PALETTE = { ink: '#111', subtle: '#999', card: '#fff', bg: '#fff', hairline: '#eee', muted: '#777', primary: '#6C4DFF', pink: '#FF6FAE', orange: '#FFA34D', green: '#3DCB7A', blue: '#4DA3FF', secondary: '#8B7DFF' };
const TINT = { primary: '#EFEBFF', pink: '#FFE9F3', orange: '#FFEEDD', green: '#E3F8EC', blue: '#E7F1FF' };

vi.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: vi.fn(() => ({ Palette: PALETTE, Tint: TINT, isDark: false })),
}));
vi.mock('@/hooks/use-premium', () => ({ usePremium: () => mocks.premium }));
vi.mock('@/store/auth-store', () => ({
  useAuthStore: Object.assign((selector: any) => selector(mocks.authState), { getState: () => mocks.authState }),
}));

import { useAppTheme } from '@/hooks/use-app-theme';
import SettingsScreen from './settings';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authState.profile = { name: 'Alex', preferences: {} } as any;
  mocks.premium.isPremium = false;
  vi.mocked(useAppTheme).mockReturnValue({ Palette: PALETTE, Tint: TINT, isDark: false } as any);
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
    expect(screen.getByText('Subscription')).toBeTruthy();
    expect(screen.getByText('Free')).toBeTruthy();
    expect(screen.getByText('Language')).toBeTruthy();
    // No preferences.language saved yet -> languageLabel's "not set" fallback.
    expect(screen.getByText('System default')).toBeTruthy();
    expect(screen.getByText('Security')).toBeTruthy();
    expect(screen.getByText('Privacy')).toBeTruthy();
    expect(screen.getByText('Terms & Conditions')).toBeTruthy();
    expect(screen.getByText('About')).toBeTruthy();
    expect(screen.getByText('v1.0.0')).toBeTruthy();
    expect(screen.getByText('Smart Planner · v1.0.0')).toBeTruthy();
  });

  it('shows Guest when there is no signed-in profile', () => {
    mocks.authState.profile = null;
    render(<SettingsScreen />);
    expect(screen.getByText('Guest')).toBeTruthy();
  });

  it('shows Premium plan when the user is premium', () => {
    mocks.premium.isPremium = true;
    render(<SettingsScreen />);
    expect(screen.getByText('Premium')).toBeTruthy();
  });

  it('shows the saved language label from profile preferences', () => {
    mocks.authState.profile = { name: 'Alex', preferences: { language: 'ur' } };
    render(<SettingsScreen />);
    expect(screen.getByText('Urdu')).toBeTruthy();
  });

  it('navigates to each row\'s route on press', () => {
    render(<SettingsScreen />);
    fireEvent.click(screen.getByText('Account'));
    expect(mocks.router.push).toHaveBeenCalledWith('/profile');
    fireEvent.click(screen.getByText('Subscription'));
    expect(mocks.router.push).toHaveBeenCalledWith('/premium');
    fireEvent.click(screen.getByText('Language'));
    expect(mocks.router.push).toHaveBeenCalledWith('/language');
    fireEvent.click(screen.getByText('Security'));
    expect(mocks.router.push).toHaveBeenCalledWith('/security');
    fireEvent.click(screen.getByText('Privacy'));
    expect(mocks.router.push).toHaveBeenCalledWith('/privacy-policy');
    fireEvent.click(screen.getByText('Terms & Conditions'));
    expect(mocks.router.push).toHaveBeenCalledWith('/terms');
    fireEvent.click(screen.getByText('About'));
    expect(mocks.router.push).toHaveBeenCalledWith('/about');
  });

  it('back button navigates back', () => {
    render(<SettingsScreen />);
    const icons = screen.getAllByTestId('icon');
    const backIcon = icons.find((el) => el.getAttribute('data-name') === 'chevron-back');
    fireEvent.click(backIcon!.parentElement!);
    expect(mocks.router.back).toHaveBeenCalledTimes(1);
  });

  it('renders without crashing in dark mode', () => {
    vi.mocked(useAppTheme).mockReturnValue({ Palette: PALETTE, Tint: TINT, isDark: true } as any);
    render(<SettingsScreen />);
    expect(screen.getByText('Settings')).toBeTruthy();
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
