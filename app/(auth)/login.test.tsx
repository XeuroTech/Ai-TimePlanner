import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), back: vi.fn(), canGoBack: vi.fn(() => true) },
  toast: { show: vi.fn(), success: vi.fn(), error: vi.fn() },
  login: vi.fn(),
  sendVerificationEmail: vi.fn(),
  authState: { login: undefined as any, sendVerificationEmail: undefined as any, status: 'idle' as 'idle' | 'loading' },
  alertSpy: vi.fn(),
  theme: { isDark: false },
  platform: { os: 'web' as string },
}));
mocks.authState.login = mocks.login;
mocks.authState.sendVerificationEmail = mocks.sendVerificationEmail;

vi.mock('expo-router', () => ({ useRouter: () => mocks.router }));
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
vi.mock('@/components/ui/toast', () => ({ useToast: () => mocks.toast }));
vi.mock('@/store/auth-store', () => ({
  useAuthStore: (selector: any) => selector(mocks.authState),
}));
// Real react-native-web is used for everything except `Alert` (spied on) and
// `Platform.OS`, made a live getter so a single test can flip it to 'ios' to
// exercise the iOS-only KeyboardAvoidingView behavior branch — under the
// react-native-web alias it otherwise always resolves to 'web'.
vi.mock('react-native', async () => {
  const actual = await vi.importActual<typeof import('react-native')>('react-native');
  const Platform = { ...actual.Platform };
  Object.defineProperty(Platform, 'OS', { get: () => mocks.platform.os, configurable: true });
  return { ...actual, Alert: { alert: mocks.alertSpy }, Platform };
});

import LoginScreen from './login';

beforeEach(() => {
  mocks.router.push.mockClear();
  mocks.router.replace.mockClear();
  mocks.toast.success.mockClear();
  mocks.toast.error.mockClear();
  mocks.login.mockReset();
  mocks.sendVerificationEmail.mockReset();
  mocks.alertSpy.mockClear();
  mocks.authState.status = 'idle';
  mocks.theme.isDark = false;
  mocks.platform.os = 'web';
});

function fillValidCredentials() {
  fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'jane@example.com' } });
  fireEvent.change(screen.getByPlaceholderText('Your password'), { target: { value: 'secret6' } });
}

describe('LoginScreen', () => {
  it('shows validation errors for empty email/password and does not call login', () => {
    render(<LoginScreen />);
    fireEvent.click(screen.getByText('Log In'));
    expect(screen.getByText('Email is required.')).toBeTruthy();
    expect(screen.getByText('Password is required.')).toBeTruthy();
    expect(mocks.login).not.toHaveBeenCalled();
  });

  it('logs in with remember=true (the default) and goes to /category when not onboarded', async () => {
    mocks.login.mockResolvedValue({ ok: true, onboarded: false, emailVerified: true });
    render(<LoginScreen />);
    fillValidCredentials();
    await act(async () => {
      fireEvent.click(screen.getByText('Log In'));
    });
    expect(mocks.login).toHaveBeenCalledWith('jane@example.com', 'secret6', true);
    expect(mocks.toast.success).toHaveBeenCalledWith('Welcome back!');
    expect(mocks.router.replace).toHaveBeenCalledWith('/category');
  });

  it('goes to /(tabs) when the profile is already onboarded', async () => {
    mocks.login.mockResolvedValue({ ok: true, onboarded: true, emailVerified: true });
    render(<LoginScreen />);
    fillValidCredentials();
    await act(async () => {
      fireEvent.click(screen.getByText('Log In'));
    });
    expect(mocks.router.replace).toHaveBeenCalledWith('/(tabs)');
  });

  it('unchecking "Remember me" passes false through to login()', async () => {
    mocks.login.mockResolvedValue({ ok: true, onboarded: true, emailVerified: true });
    render(<LoginScreen />);
    fillValidCredentials();
    fireEvent.click(screen.getByText('Remember me'));
    await act(async () => {
      fireEvent.click(screen.getByText('Log In'));
    });
    expect(mocks.login).toHaveBeenCalledWith('jane@example.com', 'secret6', false);
  });

  it('shows a toast error and does not navigate when login fails', async () => {
    mocks.login.mockResolvedValue({ ok: false, error: 'Wrong password.' });
    render(<LoginScreen />);
    fillValidCredentials();
    await act(async () => {
      fireEvent.click(screen.getByText('Log In'));
    });
    expect(mocks.toast.error).toHaveBeenCalledWith('Wrong password.');
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });

  it('falls back to a generic error message when the failure carries none', async () => {
    mocks.login.mockResolvedValue({ ok: false });
    render(<LoginScreen />);
    fillValidCredentials();
    await act(async () => {
      fireEvent.click(screen.getByText('Log In'));
    });
    expect(mocks.toast.error).toHaveBeenCalledWith('Login failed.');
  });

  it('prompts to verify the email when login succeeds but the address is unverified', async () => {
    mocks.login.mockResolvedValue({ ok: true, onboarded: false, emailVerified: false });
    render(<LoginScreen />);
    fillValidCredentials();
    await act(async () => {
      fireEvent.click(screen.getByText('Log In'));
    });
    expect(mocks.alertSpy).toHaveBeenCalledTimes(1);
    const [title, message, buttons] = mocks.alertSpy.mock.calls[0];
    expect(title).toBe('Verify your email');
    expect(message).toContain('jane@example.com');
    expect(buttons.map((b: any) => b.text)).toEqual(['Resend Email', 'Continue']);
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });

  it('"Resend Email" resends the verification email and toasts success', async () => {
    mocks.login.mockResolvedValue({ ok: true, onboarded: false, emailVerified: false });
    mocks.sendVerificationEmail.mockResolvedValue({ ok: true, cooldownSeconds: 30 });
    render(<LoginScreen />);
    fillValidCredentials();
    await act(async () => {
      fireEvent.click(screen.getByText('Log In'));
    });
    const [, , buttons] = mocks.alertSpy.mock.calls[0];
    await act(async () => {
      buttons[0].onPress();
    });
    expect(mocks.sendVerificationEmail).toHaveBeenCalled();
    expect(mocks.toast.success).toHaveBeenCalledWith('Verification email sent. Check your inbox and spam folder.');
  });

  it('"Resend Email" toasts the error when resending fails', async () => {
    mocks.login.mockResolvedValue({ ok: true, onboarded: false, emailVerified: false });
    mocks.sendVerificationEmail.mockResolvedValue({ ok: false, error: 'Too many requests.' });
    render(<LoginScreen />);
    fillValidCredentials();
    await act(async () => {
      fireEvent.click(screen.getByText('Log In'));
    });
    const [, , buttons] = mocks.alertSpy.mock.calls[0];
    await act(async () => {
      buttons[0].onPress();
    });
    expect(mocks.toast.error).toHaveBeenCalledWith('Too many requests.');
  });

  it('"Continue" navigates to /verify-email', async () => {
    mocks.login.mockResolvedValue({ ok: true, onboarded: false, emailVerified: false });
    render(<LoginScreen />);
    fillValidCredentials();
    await act(async () => {
      fireEvent.click(screen.getByText('Log In'));
    });
    const [, , buttons] = mocks.alertSpy.mock.calls[0];
    buttons[1].onPress();
    expect(mocks.router.replace).toHaveBeenCalledWith('/verify-email');
  });

  it('dismissing the alert (e.g. back button/tap-outside) also navigates to /verify-email', async () => {
    mocks.login.mockResolvedValue({ ok: true, onboarded: false, emailVerified: false });
    render(<LoginScreen />);
    fillValidCredentials();
    await act(async () => {
      fireEvent.click(screen.getByText('Log In'));
    });
    const options = mocks.alertSpy.mock.calls[0][3];
    options.onDismiss();
    expect(mocks.router.replace).toHaveBeenCalledWith('/verify-email');
  });

  it('navigates to /forgot-password from the "Forgot password?" link', () => {
    render(<LoginScreen />);
    fireEvent.click(screen.getByText('Forgot password?'));
    expect(mocks.router.push).toHaveBeenCalledWith('/forgot-password');
  });

  it('navigates to /register from the "Sign up" footer link', () => {
    render(<LoginScreen />);
    fireEvent.click(screen.getByText('Sign up'));
    expect(mocks.router.replace).toHaveBeenCalledWith('/register');
  });

  it('hides the submit button label (shows a spinner) while the store reports loading', () => {
    mocks.authState.status = 'loading';
    render(<LoginScreen />);
    expect(screen.queryByText('Log In')).toBeNull();
  });

  it('shows the light status bar style when the app theme is dark', () => {
    mocks.theme.isDark = true;
    render(<LoginScreen />);
    expect(screen.getByTestId('status-bar').getAttribute('data-style')).toBe('light');
  });

  it('shows the dark status bar style when the app theme is light', () => {
    render(<LoginScreen />);
    expect(screen.getByTestId('status-bar').getAttribute('data-style')).toBe('dark');
  });

  it('still renders correctly on iOS (KeyboardAvoidingView uses the "padding" behavior)', () => {
    mocks.platform.os = 'ios';
    render(<LoginScreen />);
    expect(screen.getByText('Welcome back')).toBeTruthy();
  });

  it('focusing the password field scrolls the form to the end', () => {
    render(<LoginScreen />);
    // Doesn't throw: react-native-web's ScrollView ref exposes scrollToEnd,
    // which the password field's onFocus calls via scrollRef.current.
    fireEvent.focus(screen.getByPlaceholderText('Your password'));
  });
});
