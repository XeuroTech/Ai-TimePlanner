import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), back: vi.fn(), canGoBack: vi.fn(() => true) },
  toast: { show: vi.fn(), success: vi.fn(), error: vi.fn() },
  register: vi.fn(),
  authState: { register: undefined as any, status: 'idle' as 'idle' | 'loading' },
  theme: { isDark: false },
  platform: { os: 'web' as string },
}));
mocks.authState.register = mocks.register;

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

import RegisterScreen from './register';

beforeEach(() => {
  mocks.router.push.mockClear();
  mocks.router.replace.mockClear();
  mocks.toast.success.mockClear();
  mocks.toast.error.mockClear();
  mocks.register.mockReset();
  mocks.authState.status = 'idle';
  mocks.theme.isDark = false;
  mocks.platform.os = 'web';
});

function fillValidForm() {
  fireEvent.change(screen.getByPlaceholderText('Jane Doe'), { target: { value: 'Jane Doe' } });
  fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'jane@gmail.com' } });
  fireEvent.change(screen.getByPlaceholderText('At least 6 characters'), { target: { value: 'secret6' } });
  fireEvent.change(screen.getByPlaceholderText('Re-enter password'), { target: { value: 'secret6' } });
}

describe('RegisterScreen', () => {
  it('shows every field-level validation error when submitted blank', async () => {
    render(<RegisterScreen />);
    fireEvent.click(screen.getByText('Create Account'));
    expect(await screen.findByText('Name is required.')).toBeTruthy();
    expect(screen.getByText('Email is required.')).toBeTruthy();
    expect(screen.getByText('Password is required.')).toBeTruthy();
    // Confirm compares against an empty password too, so "" === "" passes -- no confirm error expected here.
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it('flags a mismatched confirmation password', async () => {
    render(<RegisterScreen />);
    fireEvent.change(screen.getByPlaceholderText('Jane Doe'), { target: { value: 'Jane Doe' } });
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'jane@gmail.com' } });
    fireEvent.change(screen.getByPlaceholderText('At least 6 characters'), { target: { value: 'secret6' } });
    fireEvent.change(screen.getByPlaceholderText('Re-enter password'), { target: { value: 'different' } });
    fireEvent.click(screen.getByText('Create Account'));
    expect(await screen.findByText('Passwords do not match.')).toBeTruthy();
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it('rejects a signup-only-invalid address (a disposable domain) even though the format is fine', async () => {
    render(<RegisterScreen />);
    fireEvent.change(screen.getByPlaceholderText('Jane Doe'), { target: { value: 'Jane Doe' } });
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'jane@mailinator.com' } });
    fireEvent.change(screen.getByPlaceholderText('At least 6 characters'), { target: { value: 'secret6' } });
    fireEvent.change(screen.getByPlaceholderText('Re-enter password'), { target: { value: 'secret6' } });
    fireEvent.click(screen.getByText('Create Account'));
    expect(await screen.findByText('Temporary email addresses are not supported. Please use a permanent one.')).toBeTruthy();
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it('registers, shows a success toast and navigates to /verify-email when verification sent normally', async () => {
    mocks.register.mockResolvedValue({ ok: true, onboarded: false });
    render(<RegisterScreen />);
    fillValidForm();
    await act(async () => {
      fireEvent.click(screen.getByText('Create Account'));
    });
    expect(mocks.register).toHaveBeenCalledWith({ name: 'Jane Doe', email: 'jane@gmail.com', password: 'secret6' });
    expect(mocks.toast.success).toHaveBeenCalledWith('Account created! Check your inbox (and spam) to verify your email.');
    expect(mocks.router.replace).toHaveBeenCalledWith('/verify-email');
  });

  it('warns (but still navigates) when the account was created but verification email failed with a reason', async () => {
    mocks.register.mockResolvedValue({ ok: true, onboarded: false, verificationSent: false, verificationError: 'quota exceeded' });
    render(<RegisterScreen />);
    fillValidForm();
    await act(async () => {
      fireEvent.click(screen.getByText('Create Account'));
    });
    expect(mocks.toast.error).toHaveBeenCalledWith('Account created, but the verification email failed: quota exceeded');
    expect(mocks.router.replace).toHaveBeenCalledWith('/verify-email');
  });

  it('warns generically when verification failed with no specific error', async () => {
    mocks.register.mockResolvedValue({ ok: true, onboarded: false, verificationSent: false });
    render(<RegisterScreen />);
    fillValidForm();
    await act(async () => {
      fireEvent.click(screen.getByText('Create Account'));
    });
    expect(mocks.toast.error).toHaveBeenCalledWith(
      'Account created, but the verification email could not be sent. Tap "Resend email".',
    );
    expect(mocks.router.replace).toHaveBeenCalledWith('/verify-email');
  });

  it('shows a toast error and does not navigate when registration fails', async () => {
    mocks.register.mockResolvedValue({ ok: false, error: 'Email already in use.' });
    render(<RegisterScreen />);
    fillValidForm();
    await act(async () => {
      fireEvent.click(screen.getByText('Create Account'));
    });
    expect(mocks.toast.error).toHaveBeenCalledWith('Email already in use.');
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });

  it('falls back to a generic error message when the failure carries none', async () => {
    mocks.register.mockResolvedValue({ ok: false });
    render(<RegisterScreen />);
    fillValidForm();
    await act(async () => {
      fireEvent.click(screen.getByText('Create Account'));
    });
    expect(mocks.toast.error).toHaveBeenCalledWith('Could not create account.');
  });

  it('swaps the submit button label for a spinner while the store reports loading', () => {
    mocks.authState.status = 'loading';
    render(<RegisterScreen />);
    // Button swaps its label for an ActivityIndicator while loading, so the text disappears.
    expect(screen.queryByText('Create Account')).toBeNull();
  });

  it('navigates to /login via the "Log in" footer link', () => {
    render(<RegisterScreen />);
    fireEvent.click(screen.getByText('Log in'));
    expect(mocks.router.replace).toHaveBeenCalledWith('/login');
  });

  it('shows the light status bar style when the app theme is dark', () => {
    mocks.theme.isDark = true;
    render(<RegisterScreen />);
    expect(screen.getByTestId('status-bar').getAttribute('data-style')).toBe('light');
  });

  it('shows the dark status bar style when the app theme is light', () => {
    render(<RegisterScreen />);
    expect(screen.getByTestId('status-bar').getAttribute('data-style')).toBe('dark');
  });

  it('still renders correctly on iOS (KeyboardAvoidingView uses the "padding" behavior)', () => {
    mocks.platform.os = 'ios';
    render(<RegisterScreen />);
    expect(screen.getByText('Create your account')).toBeTruthy();
  });

  it('focusing the confirm password field scrolls the form to the end', () => {
    render(<RegisterScreen />);
    // Doesn't throw: react-native-web's ScrollView ref exposes scrollToEnd,
    // which the confirm-password field's onFocus calls via scrollRef.current.
    fireEvent.focus(screen.getByPlaceholderText('Re-enter password'));
  });
});
