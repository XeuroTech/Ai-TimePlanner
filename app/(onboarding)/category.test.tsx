import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), back: vi.fn() },
  authState: {
    profile: { name: 'Alex' } as any,
    updateProfile: vi.fn(async () => {}),
    completeOnboarding: vi.fn(async () => {}),
  },
  theme: { isDark: false },
}));

vi.mock('expo-router', () => ({ useRouter: () => mocks.router }));
vi.mock('expo-status-bar', () => ({
  StatusBar: (props: any) => <span data-testid="status-bar" data-style={props.style} />,
}));
vi.mock('@expo/vector-icons', () => ({ Ionicons: (props: any) => <span data-testid="icon" data-name={props.name} /> }));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}));
vi.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: () => ({ Palette: { primary: '#6C4DFF' }, Tint: { primary: '#EFEBFF' }, isDark: mocks.theme.isDark, setDarkMode: vi.fn() }),
}));
vi.mock('@/store/auth-store', () => ({
  useAuthStore: Object.assign((selector: any) => selector(mocks.authState), { getState: () => mocks.authState }),
}));

import { CATEGORIES } from '@/constants/categories';
import CategoryScreen from './category';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authState.profile = { name: 'Alex' } as any;
  mocks.theme.isDark = false;
});

describe('CategoryScreen', () => {
  it('renders the header and every category card', () => {
    render(<CategoryScreen />);
    expect(screen.getByText('What best describes you?')).toBeTruthy();
    for (const c of CATEGORIES) {
      expect(screen.getByText(c.label)).toBeTruthy();
    }
  });

  it('does nothing when Continue is pressed with no category selected', () => {
    render(<CategoryScreen />);
    fireEvent.click(screen.getByText('Continue'));
    expect(mocks.authState.updateProfile).not.toHaveBeenCalled();
    expect(mocks.authState.completeOnboarding).not.toHaveBeenCalled();
  });

  it('selecting a category then continuing saves the category and completes onboarding', async () => {
    render(<CategoryScreen />);
    fireEvent.click(screen.getByText('Student'));
    fireEvent.click(screen.getByText('Continue'));

    await waitFor(() => expect(mocks.authState.updateProfile).toHaveBeenCalledWith({ category: 'student' }));
    expect(mocks.authState.completeOnboarding).toHaveBeenCalledWith({ name: 'Alex' });
    expect(mocks.router.replace).toHaveBeenCalledWith('/(tabs)');
  });

  it('switching the selection before continuing uses the latest category', async () => {
    render(<CategoryScreen />);
    fireEvent.click(screen.getByText('Student'));
    fireEvent.click(screen.getByText('Teacher'));
    fireEvent.click(screen.getByText('Continue'));

    await waitFor(() => expect(mocks.authState.updateProfile).toHaveBeenCalledWith({ category: 'teacher' }));
  });

  it('falls back to no name when the profile has none yet', async () => {
    mocks.authState.profile = null;
    render(<CategoryScreen />);
    fireEvent.click(screen.getByText('Developer'));
    fireEvent.click(screen.getByText('Continue'));

    await waitFor(() => expect(mocks.authState.completeOnboarding).toHaveBeenCalledWith({ name: undefined }));
  });

  it('shows the light status bar style when the app theme is dark', () => {
    mocks.theme.isDark = true;
    render(<CategoryScreen />);
    expect(screen.getByTestId('status-bar').getAttribute('data-style')).toBe('light');
  });

  it('shows the dark status bar style when the app theme is light', () => {
    render(<CategoryScreen />);
    expect(screen.getByTestId('status-bar').getAttribute('data-style')).toBe('dark');
  });

  it('applies the pressed style on a category card while held down', async () => {
    render(<CategoryScreen />);
    const card = screen.getByText('Student').parentElement as HTMLElement;
    // react-native-web's Pressable drives its `pressed` render-prop state off
    // real "mousedown"/"mouseup" DOM events (see components/ui/button.test.tsx),
    // exercising the `pressed && styles.cardPressed` branch in the style callback.
    fireEvent.mouseDown(card);
    await waitFor(() => {
      expect(getComputedStyle(card).transform).toContain('0.98');
    });
    fireEvent.mouseUp(card);
  });

  // Note: onContinue's own `if (!selected || saving) return;` re-entrancy
  // guard is not separately exercised here. Both of its conditions mirror the
  // Continue Button's own `disabled`/`loading` props exactly (`disabled={!selected}`,
  // `loading={saving}`), and Button (see components/ui/button.test.tsx) never
  // invokes onPress while disabled or loading. So there is no way to trigger
  // onContinue a second time -- or with nothing selected -- through the
  // rendered UI; the guard's true branch is unreachable dead code from a
  // black-box test's perspective, not a missing test case.
});
