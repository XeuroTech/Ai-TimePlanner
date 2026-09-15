import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), back: vi.fn() },
  segments: ['(tabs)'] as string[],
  pathname: '/settings' as string | undefined,
  authState: {
    hydrated: false,
    fbUser: null as { uid: string; emailVerified: boolean } | null,
    profile: null as { onboarded: boolean } | null,
    init: vi.fn(async () => {}),
  },
  initObservability: vi.fn(),
  reportError: vi.fn(),
  setAnalyticsUser: vi.fn(),
  setCrashUser: vi.fn(),
  trackScreenView: vi.fn(),
  isDark: false,
}));

vi.mock('react-native-reanimated', () => ({}));
// _layout.tsx imports ThemeProvider/DarkTheme/DefaultTheme from
// 'expo-router/react-navigation' (expo-router's re-export), not directly from
// '@react-navigation/native' — mocking the latter alone leaves the former's
// real module graph loaded for real.
vi.mock('expo-router/react-navigation', () => ({
  ThemeProvider: ({ children, value }: any) => (
    <div data-testid="theme-provider" data-dark={value?.dark}>
      {children}
    </div>
  ),
  DarkTheme: { dark: true },
  DefaultTheme: { dark: false },
}));
vi.mock('expo-router', () => ({
  Stack: Object.assign(
    (props: any) => <div data-testid="stack">{props.children}</div>,
    { Screen: (props: any) => <div data-testid="stack-screen" data-name={props.name} /> },
  ),
  usePathname: () => mocks.pathname,
  useRouter: () => mocks.router,
  useSegments: () => mocks.segments,
}));
vi.mock('expo-status-bar', () => ({
  StatusBar: (props: any) => <div data-testid="status-bar" data-style={props.style} />,
}));
vi.mock('@/components/ui/toast', () => ({
  ToastProvider: ({ children }: any) => <div data-testid="toast-provider">{children}</div>,
}));
vi.mock('@/hooks/use-app-theme', () => ({ useAppTheme: () => ({ isDark: mocks.isDark }) }));
vi.mock('@/hooks/use-auto-backup', () => ({ useAutoBackup: vi.fn() }));
vi.mock('@/hooks/use-reminders', () => ({ useReminders: vi.fn() }));
vi.mock('@/lib/services/observability', () => ({
  initObservability: mocks.initObservability,
  reportError: mocks.reportError,
  setAnalyticsUser: mocks.setAnalyticsUser,
  setCrashUser: mocks.setCrashUser,
  trackScreenView: mocks.trackScreenView,
}));
vi.mock('@/store/auth-store', () => ({
  useAuthStore: Object.assign((selector: any) => selector(mocks.authState), { getState: () => mocks.authState }),
}));

import RootLayout, { ErrorBoundary } from './_layout';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.segments = ['(tabs)'];
  mocks.pathname = '/settings';
  mocks.authState.hydrated = false;
  mocks.authState.fbUser = null;
  mocks.authState.profile = null;
  mocks.isDark = false;
});

describe('RootLayout', () => {
  it('mounts the theme/toast providers, the Stack, and the status bar without throwing', () => {
    render(<RootLayout />);
    expect(screen.getByTestId('theme-provider')).toBeTruthy();
    expect(screen.getByTestId('toast-provider')).toBeTruthy();
    expect(screen.getByTestId('stack')).toBeTruthy();
    expect(screen.getByTestId('status-bar')).toBeTruthy();
  });

  it('uses the dark theme and status bar style when isDark is true', () => {
    mocks.isDark = true;
    render(<RootLayout />);
    expect(screen.getByTestId('theme-provider').getAttribute('data-dark')).toBe('true');
    expect(screen.getByTestId('status-bar').getAttribute('data-style')).toBe('light');
  });

  it('registers a Stack.Screen for every top-level route', () => {
    render(<RootLayout />);
    const names = screen.getAllByTestId('stack-screen').map((el) => el.getAttribute('data-name'));
    expect(names).toEqual(
      expect.arrayContaining([
        'splash', 'onboarding', '(auth)', '(onboarding)', '(tabs)',
        'add-class', 'add-task', 'settings', 'backup', 'premium', 'modal',
      ]),
    );
  });

  it('calls initObservability and init() on mount', () => {
    render(<RootLayout />);
    expect(mocks.initObservability).toHaveBeenCalledTimes(1);
    expect(mocks.authState.init).toHaveBeenCalledTimes(1);
  });

  it('reports a screen_view for the current pathname', () => {
    mocks.pathname = '/premium';
    render(<RootLayout />);
    expect(mocks.trackScreenView).toHaveBeenCalledWith('/premium');
  });

  it('does not track a screen view when pathname is not yet available', () => {
    mocks.pathname = undefined;
    render(<RootLayout />);
    expect(mocks.trackScreenView).not.toHaveBeenCalled();
  });

  it('attributes analytics/crash reporting to the signed-in uid, and clears it when signed out', () => {
    mocks.authState.fbUser = { uid: 'user-1', emailVerified: true };
    render(<RootLayout />);
    expect(mocks.setAnalyticsUser).toHaveBeenCalledWith('user-1');
    expect(mocks.setCrashUser).toHaveBeenCalledWith('user-1');
  });

  it('clears the analytics/crash user id when signed out', () => {
    mocks.authState.fbUser = null;
    render(<RootLayout />);
    expect(mocks.setAnalyticsUser).toHaveBeenCalledWith(null);
    expect(mocks.setCrashUser).toHaveBeenCalledWith(null);
  });

  describe('auth gate redirects', () => {
    it('does nothing before the auth store has hydrated', () => {
      mocks.authState.hydrated = false;
      mocks.segments = ['(tabs)'];
      render(<RootLayout />);
      expect(mocks.router.replace).not.toHaveBeenCalled();
    });

    it('sends an unauthenticated user in the tabs group to /login', () => {
      mocks.authState.hydrated = true;
      mocks.segments = ['(tabs)'];
      render(<RootLayout />);
      expect(mocks.router.replace).toHaveBeenCalledWith('/login');
    });

    it('sends an unauthenticated user in the onboarding group to /login', () => {
      mocks.authState.hydrated = true;
      mocks.segments = ['(onboarding)'];
      render(<RootLayout />);
      expect(mocks.router.replace).toHaveBeenCalledWith('/login');
    });

    it('does not redirect an unauthenticated user already outside tabs/onboarding', () => {
      mocks.authState.hydrated = true;
      mocks.segments = ['(auth)'];
      render(<RootLayout />);
      expect(mocks.router.replace).not.toHaveBeenCalled();
    });

    it('sends an unverified signed-in user in the tabs group to /verify-email', () => {
      mocks.authState.hydrated = true;
      mocks.authState.fbUser = { uid: 'u1', emailVerified: false };
      mocks.authState.profile = { onboarded: true };
      mocks.segments = ['(tabs)'];
      render(<RootLayout />);
      expect(mocks.router.replace).toHaveBeenCalledWith('/verify-email');
    });

    it('does not redirect an unverified signed-in user already outside tabs/onboarding', () => {
      mocks.authState.hydrated = true;
      mocks.authState.fbUser = { uid: 'u1', emailVerified: false };
      mocks.authState.profile = { onboarded: true };
      mocks.segments = ['(auth)'];
      render(<RootLayout />);
      expect(mocks.router.replace).not.toHaveBeenCalled();
    });

    it('sends a verified, onboarded user sitting in (auth) into (tabs)', () => {
      mocks.authState.hydrated = true;
      mocks.authState.fbUser = { uid: 'u1', emailVerified: true };
      mocks.authState.profile = { onboarded: true };
      mocks.segments = ['(auth)'];
      render(<RootLayout />);
      expect(mocks.router.replace).toHaveBeenCalledWith('/(tabs)');
    });

    it('sends a verified, onboarded user sitting in (onboarding) into (tabs)', () => {
      mocks.authState.hydrated = true;
      mocks.authState.fbUser = { uid: 'u1', emailVerified: true };
      mocks.authState.profile = { onboarded: true };
      mocks.segments = ['(onboarding)'];
      render(<RootLayout />);
      expect(mocks.router.replace).toHaveBeenCalledWith('/(tabs)');
    });

    it('does not redirect a verified-but-not-onboarded user sitting in (onboarding)', () => {
      mocks.authState.hydrated = true;
      mocks.authState.fbUser = { uid: 'u1', emailVerified: true };
      mocks.authState.profile = { onboarded: false };
      mocks.segments = ['(onboarding)'];
      render(<RootLayout />);
      expect(mocks.router.replace).not.toHaveBeenCalled();
    });

    it('does not redirect a fully authenticated, onboarded user already in (tabs)', () => {
      mocks.authState.hydrated = true;
      mocks.authState.fbUser = { uid: 'u1', emailVerified: true };
      mocks.authState.profile = { onboarded: true };
      mocks.segments = ['(tabs)'];
      render(<RootLayout />);
      expect(mocks.router.replace).not.toHaveBeenCalled();
    });
  });
});

describe('ErrorBoundary', () => {
  it('reports the error and renders its message and stack with a retry link', async () => {
    const error = new Error('Something exploded');
    const retry = vi.fn(async () => {});
    render(<ErrorBoundary error={error} retry={retry} />);

    expect(mocks.reportError).toHaveBeenCalledWith(error, 'root-error-boundary');
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.getByText('Something exploded')).toBeTruthy();
    expect(screen.getByText('Tap to retry')).toBeTruthy();

    fireEvent.click(screen.getByText('Tap to retry'));
    await waitFor(() => expect(retry).toHaveBeenCalledTimes(1));
  });

  it('falls back to "Unknown error" when the error has no message', () => {
    const error = { stack: undefined } as unknown as Error;
    render(<ErrorBoundary error={error} retry={vi.fn(async () => {})} />);
    expect(screen.getByText('Unknown error')).toBeTruthy();
  });
});
