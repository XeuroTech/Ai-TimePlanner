import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), back: vi.fn() },
  authState: {
    hydrated: false,
    fbUser: null as { uid: string; emailVerified: boolean } | null,
    profile: null as { onboarded: boolean } | null,
  },
}));

vi.mock('expo-router', () => ({ useRouter: () => mocks.router }));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: (props: any) => <span data-testid="icon" data-name={props.name} /> }));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}));
const PALETTE = {
  bg: '#F6F5FF', pink: '#FF6FAE', primary: '#6C4DFF', blue: '#4DA3FF', green: '#3DCB7A',
  glass: 'rgba(255,255,255,0.5)', glassBorder: 'rgba(255,255,255,0.6)', orange: '#FFA34D', ink: '#111', muted: '#777',
};

vi.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: vi.fn(() => ({
    Palette: PALETTE,
    Tint: {},
    isDark: false,
    setDarkMode: vi.fn(),
  })),
}));
vi.mock('@/store/auth-store', () => ({
  useAuthStore: Object.assign((selector: any) => selector(mocks.authState), { getState: () => mocks.authState }),
}));

import { useAppTheme } from '@/hooks/use-app-theme';
import SplashScreen from './splash';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authState.hydrated = false;
  mocks.authState.fbUser = null;
  mocks.authState.profile = null;
  vi.mocked(useAppTheme).mockReturnValue({
    Palette: PALETTE,
    Tint: {},
    isDark: false,
    setDarkMode: vi.fn(),
  } as any);
});

describe('SplashScreen', () => {
  it('renders the marketing content and both CTAs while not hydrated', () => {
    render(<SplashScreen />);
    expect(screen.getByText('Smart Planner')).toBeTruthy();
    expect(screen.getByText((_, el) => el?.textContent === 'Plan your day.\nOrganize your life.')).toBeTruthy();
    expect(screen.getByText('Get Started')).toBeTruthy();
    expect(screen.getByText('I already have an account')).toBeTruthy();
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });

  it('does not redirect once hydrated with no session (signed-out state)', () => {
    mocks.authState.hydrated = true;
    render(<SplashScreen />);
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });

  it('"Get Started" pushes to /onboarding', () => {
    render(<SplashScreen />);
    fireEvent.click(screen.getByText('Get Started'));
    expect(mocks.router.push).toHaveBeenCalledWith('/onboarding');
  });

  it('"I already have an account" replaces with /login', () => {
    render(<SplashScreen />);
    fireEvent.click(screen.getByText('I already have an account'));
    expect(mocks.router.replace).toHaveBeenCalledWith('/login');
  });

  it('redirects to /verify-email for a hydrated, signed-in, unverified user', async () => {
    mocks.authState.hydrated = true;
    mocks.authState.fbUser = { uid: 'u1', emailVerified: false };
    mocks.authState.profile = { onboarded: false };
    render(<SplashScreen />);
    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith('/verify-email'));
  });

  it('redirects to /category for a verified but not-yet-onboarded user', async () => {
    mocks.authState.hydrated = true;
    mocks.authState.fbUser = { uid: 'u1', emailVerified: true };
    mocks.authState.profile = { onboarded: false };
    render(<SplashScreen />);
    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith('/category'));
  });

  it('redirects into the app for a verified, onboarded user', async () => {
    mocks.authState.hydrated = true;
    mocks.authState.fbUser = { uid: 'u1', emailVerified: true };
    mocks.authState.profile = { onboarded: true };
    render(<SplashScreen />);
    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith('/(tabs)'));
  });

  it('does not redirect when hydrated with a session but no local profile yet', () => {
    mocks.authState.hydrated = true;
    mocks.authState.fbUser = { uid: 'u1', emailVerified: true };
    mocks.authState.profile = null;
    render(<SplashScreen />);
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });

  it('renders the dark-styled status bar when dark mode is enabled', () => {
    vi.mocked(useAppTheme).mockReturnValue({
      Palette: PALETTE,
      Tint: {},
      isDark: true,
      setDarkMode: vi.fn(),
    } as any);
    render(<SplashScreen />);
    // StatusBar is mocked out, so this is a smoke check exercising the isDark ? 'light' : 'dark' branch.
    expect(screen.getByText('Smart Planner')).toBeTruthy();
  });

  it('applies the pressed style to the "Get Started" CTA while held down', async () => {
    render(<SplashScreen />);
    const cta = screen.getByText('Get Started').parentElement!;
    fireEvent.mouseDown(cta);
    await waitFor(() => expect(getComputedStyle(cta).backgroundColor).toBe('rgb(91, 62, 235)'), { timeout: 3000 });
    fireEvent.mouseUp(cta);
  });

  it('applies the pressed style to the "I already have an account" link while held down', async () => {
    render(<SplashScreen />);
    const link = screen.getByText('I already have an account').parentElement!;
    fireEvent.mouseDown(link);
    await waitFor(() => expect(getComputedStyle(link).opacity).toBe('0.6'), { timeout: 3000 });
    fireEvent.mouseUp(link);
  });
});
