import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), back: vi.fn(), canGoBack: vi.fn(() => true) },
  toast: { show: vi.fn(), success: vi.fn(), error: vi.fn() },
  sendVerificationEmail: vi.fn(),
  refreshEmailVerified: vi.fn(),
  logout: vi.fn(),
  authState: {
    fbUser: null as any,
    profile: null as any,
    sendVerificationEmail: undefined as any,
    refreshEmailVerified: undefined as any,
    logout: undefined as any,
  },
  theme: { isDark: false },
  platform: { os: 'web' as string },
}));
mocks.authState.sendVerificationEmail = mocks.sendVerificationEmail;
mocks.authState.refreshEmailVerified = mocks.refreshEmailVerified;
mocks.authState.logout = mocks.logout;

vi.mock('expo-router', () => ({
  useRouter: () => mocks.router,
  Redirect: ({ href }: any) => <div data-testid="redirect" data-href={href} />,
}));
vi.mock('expo-status-bar', () => ({
  StatusBar: (props: any) => <span data-testid="status-bar" data-style={props.style} />,
}));
vi.mock('@expo/vector-icons', () => ({ Ionicons: (props: any) => <span data-testid="icon" data-name={props.name} /> }));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}));
vi.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    Palette: { bg: '#fff', ink: '#000', muted: '#666', primary: '#6C4DFF', card: '#fff', hairline: '#eee', subtle: '#999' },
    Tint: { primary: '#EFEBFF' },
    isDark: mocks.theme.isDark,
    setDarkMode: vi.fn(),
  }),
}));
vi.mock('@/lib/firebase/config', () => ({ firebaseConfig: { authDomain: 'test-project.firebaseapp.com' } }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => mocks.toast }));
vi.mock('@/store/auth-store', () => ({
  useAuthStore: (selector: any) => selector(mocks.authState),
}));
// Real react-native-web is kept for everything except `Platform.OS`, which is
// made a live getter so a single test can flip it to 'ios' to exercise the
// iOS-only KeyboardAvoidingView behavior branch — under the react-native-web
// alias it otherwise always resolves to 'web' and that branch would be
// unreachable.
vi.mock('react-native', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-native')>();
  const Platform = { ...actual.Platform };
  Object.defineProperty(Platform, 'OS', { get: () => mocks.platform.os, configurable: true });
  return { ...actual, Platform };
});

import VerifyEmailScreen from './verify-email';

/**
 * Flushes the microtasks from the mount effect's `void check()` (an async
 * function that awaits `refreshEmailVerified()`) WITHOUT advancing the fake
 * timers — advancing/running timers here would also fire the freshly
 * scheduled `setInterval` poll a spurious extra time, since fake-timer
 * "run pending" semantics treat a just-scheduled interval as already due.
 */
async function flushMount() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.router.replace.mockClear();
  mocks.toast.success.mockClear();
  mocks.toast.error.mockClear();
  mocks.sendVerificationEmail.mockReset();
  mocks.refreshEmailVerified.mockReset().mockResolvedValue(false);
  mocks.logout.mockReset().mockResolvedValue(undefined);
  mocks.authState.fbUser = { uid: 'u1', email: 'jane@example.com', emailVerified: false };
  mocks.authState.profile = { onboarded: false };
  mocks.theme.isDark = false;
  mocks.platform.os = 'web';
});

afterEach(() => {
  vi.useRealTimers();
});

describe('VerifyEmailScreen', () => {
  it('redirects to /login when there is no signed-in user', async () => {
    mocks.authState.fbUser = null;
    render(<VerifyEmailScreen />);
    expect(screen.getByTestId('redirect').getAttribute('data-href')).toBe('/login');
    // Surprising but real: React hooks can't be called conditionally, so the
    // mount-poll `useEffect` (and its `refreshEmailVerified()` call) runs
    // unconditionally before the component's own `if (!fbUser)` early return.
    // It's harmless here (the result is discarded and Redirect already fired),
    // but it does mean an extra auth check fires for a signed-out visitor.
    await flushMount();
    expect(mocks.refreshEmailVerified).toHaveBeenCalledTimes(1);
  });

  it('shows the verification copy with the signed-in email and the sender hint', async () => {
    render(<VerifyEmailScreen />);
    await flushMount();
    expect(screen.getByText('Verify your email')).toBeTruthy();
    expect(screen.getByText(/jane@example.com/)).toBeTruthy();
    expect(screen.getByText(/noreply@test-project\.firebaseapp\.com/)).toBeTruthy();
  });

  it('polls once on mount and, if already verified, navigates on to /success (not onboarded)', async () => {
    mocks.refreshEmailVerified.mockResolvedValue(true);
    render(<VerifyEmailScreen />);
    await flushMount();
    expect(mocks.router.replace).toHaveBeenCalledWith('/success');
  });

  it('navigates to /(tabs) instead when the profile is already onboarded', async () => {
    mocks.authState.profile = { onboarded: true };
    mocks.refreshEmailVerified.mockResolvedValue(true);
    render(<VerifyEmailScreen />);
    await flushMount();
    expect(mocks.router.replace).toHaveBeenCalledWith('/(tabs)');
  });

  it('re-polls on the background interval and eventually navigates once verified', async () => {
    render(<VerifyEmailScreen />);
    await flushMount();
    expect(mocks.refreshEmailVerified).toHaveBeenCalledTimes(1);
    mocks.refreshEmailVerified.mockResolvedValue(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(mocks.refreshEmailVerified).toHaveBeenCalledTimes(2);
    expect(mocks.router.replace).toHaveBeenCalledWith('/success');
  });

  it('"I\'ve Verified — Continue" shows an error toast when still unverified', async () => {
    render(<VerifyEmailScreen />);
    await flushMount();
    mocks.refreshEmailVerified.mockResolvedValue(false);
    await act(async () => {
      fireEvent.click(screen.getByText("I've Verified — Continue"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.toast.error).toHaveBeenCalledWith(
      'Still not verified. Check your inbox and spam folder, or resend the email.',
    );
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });

  it('"I\'ve Verified — Continue" navigates on to /success once verified', async () => {
    render(<VerifyEmailScreen />);
    await flushMount();
    mocks.refreshEmailVerified.mockResolvedValue(true);
    await act(async () => {
      fireEvent.click(screen.getByText("I've Verified — Continue"));
    });
    expect(mocks.router.replace).toHaveBeenCalledWith('/success');
  });

  it('resend sets the cooldown and toasts success', async () => {
    render(<VerifyEmailScreen />);
    await flushMount();
    mocks.sendVerificationEmail.mockResolvedValue({ ok: true, cooldownSeconds: 20 });
    await act(async () => {
      fireEvent.click(screen.getByText('Resend email'));
    });
    expect(mocks.toast.success).toHaveBeenCalledWith('Verification email sent. Check your inbox and spam folder.');
    expect(screen.getByText('Resend email in 20s')).toBeTruthy();
  });

  it('resend applies a retry cooldown and toasts the error on failure', async () => {
    render(<VerifyEmailScreen />);
    await flushMount();
    mocks.sendVerificationEmail.mockResolvedValue({ ok: false, error: 'Throttled.', retryInSeconds: 15 });
    await act(async () => {
      fireEvent.click(screen.getByText('Resend email'));
    });
    expect(mocks.toast.error).toHaveBeenCalledWith('Throttled.');
    expect(screen.getByText('Resend email in 15s')).toBeTruthy();
  });

  it('"Use a different account" logs out and returns to /login', async () => {
    render(<VerifyEmailScreen />);
    await flushMount();
    await act(async () => {
      fireEvent.click(screen.getByText('Use a different account'));
    });
    expect(mocks.logout).toHaveBeenCalled();
    expect(mocks.router.replace).toHaveBeenCalledWith('/login');
  });

  it('resend failure with no retryInSeconds leaves the cooldown at zero (button stays enabled)', async () => {
    render(<VerifyEmailScreen />);
    await flushMount();
    mocks.sendVerificationEmail.mockResolvedValue({ ok: false, error: 'Something went wrong.' });
    await act(async () => {
      fireEvent.click(screen.getByText('Resend email'));
    });
    expect(mocks.toast.error).toHaveBeenCalledWith('Something went wrong.');
    // No cooldown applied: the label is still the plain, clickable one.
    expect(screen.getByText('Resend email')).toBeTruthy();
  });

  it('ticks the resend cooldown down every second until it reaches zero', async () => {
    render(<VerifyEmailScreen />);
    await flushMount();
    mocks.sendVerificationEmail.mockResolvedValue({ ok: true, cooldownSeconds: 2 });
    await act(async () => {
      fireEvent.click(screen.getByText('Resend email'));
    });
    expect(screen.getByText('Resend email in 2s')).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByText('Resend email in 1s')).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByText('Resend email')).toBeTruthy();
  });

  it('re-checks when the app comes back to the foreground (AppState "change" -> active)', async () => {
    render(<VerifyEmailScreen />);
    await flushMount();
    expect(mocks.refreshEmailVerified).toHaveBeenCalledTimes(1);
    mocks.refreshEmailVerified.mockResolvedValue(true);

    // react-native-web's AppState listens for the DOM "visibilitychange"
    // event and reports whatever `document.visibilityState` resolves to;
    // jsdom's default ("visible") always maps to AppState's "active", which
    // is exactly the state this screen re-checks on.
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.refreshEmailVerified).toHaveBeenCalledTimes(2);
    expect(mocks.router.replace).toHaveBeenCalledWith('/success');
  });

  it('does not re-check when the app goes to the background (AppState "change" -> background)', async () => {
    render(<VerifyEmailScreen />);
    await flushMount();
    expect(mocks.refreshEmailVerified).toHaveBeenCalledTimes(1);

    // Force react-native-web's AppState.currentState to report "background"
    // (it derives this from document.visibilityState) so the listener's
    // `state === 'active'` check takes its false branch.
    const originalDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    try {
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(mocks.refreshEmailVerified).toHaveBeenCalledTimes(1);
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(document, 'visibilityState', originalDescriptor);
      } else {
        delete (document as any).visibilityState;
      }
    }
  });

  it('stops re-checking on the background interval once already navigated (guards against a stray extra call)', async () => {
    mocks.refreshEmailVerified.mockResolvedValue(true);
    render(<VerifyEmailScreen />);
    await flushMount();
    expect(mocks.refreshEmailVerified).toHaveBeenCalledTimes(1);
    expect(mocks.router.replace).toHaveBeenCalledTimes(1);

    // The next interval tick's `check()` call hits the
    // `cancelled || navigated.current` guard and returns before ever calling
    // refreshEmailVerified again.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(mocks.refreshEmailVerified).toHaveBeenCalledTimes(1);
    expect(mocks.router.replace).toHaveBeenCalledTimes(1);
  });

  it('goOn itself guards against a second navigation (manual check after an auto-navigate)', async () => {
    mocks.refreshEmailVerified.mockResolvedValue(true);
    render(<VerifyEmailScreen />);
    await flushMount();
    expect(mocks.router.replace).toHaveBeenCalledTimes(1);

    // Unlike the background poll, "I've Verified — Continue" (checkAgain)
    // does not itself guard on `navigated.current` -- it relies on goOn's own
    // internal check, which this exercises.
    await act(async () => {
      fireEvent.click(screen.getByText("I've Verified — Continue"));
    });
    expect(mocks.router.replace).toHaveBeenCalledTimes(1);
  });

  it('shows the light status bar style when the app theme is dark', async () => {
    mocks.theme.isDark = true;
    render(<VerifyEmailScreen />);
    await flushMount();
    expect(screen.getByTestId('status-bar').getAttribute('data-style')).toBe('light');
  });

  it('shows the dark status bar style when the app theme is light', async () => {
    render(<VerifyEmailScreen />);
    await flushMount();
    expect(screen.getByTestId('status-bar').getAttribute('data-style')).toBe('dark');
  });

  it('still renders correctly on iOS (KeyboardAvoidingView uses the "padding" behavior)', async () => {
    mocks.platform.os = 'ios';
    render(<VerifyEmailScreen />);
    await flushMount();
    expect(screen.getByText('Verify your email')).toBeTruthy();
  });
});

describe('VerifyEmailScreen SENDER fallback', () => {
  // SENDER is computed once at module scope from
  // `firebaseConfig.authDomain ?? 'firebaseapp.com'`. The rest of this file's
  // mock always supplies an authDomain, so the `??` fallback is only
  // reachable by re-importing the module fresh with a config that omits it.
  afterEach(() => {
    vi.doUnmock('@/lib/firebase/config');
    vi.resetModules();
  });

  it('falls back to "firebaseapp.com" in the sender hint when authDomain is unset', async () => {
    vi.resetModules();
    vi.doMock('@/lib/firebase/config', () => ({ firebaseConfig: {} }));
    const { default: FallbackVerifyEmailScreen } = await import('./verify-email');
    render(<FallbackVerifyEmailScreen />);
    await flushMount();
    expect(screen.getByText(/noreply@firebaseapp\.com/)).toBeTruthy();
  });
});
