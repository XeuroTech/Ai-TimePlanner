import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), back: vi.fn(), canGoBack: vi.fn(() => true) },
  theme: { isDark: false },
}));

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
    Palette: { bg: '#F6F5FF', ink: '#1B1B2F', muted: '#6E6B8A', green: '#4CD964', primary: '#6C4DFF' },
    Tint: { primary: '#EFEBFF' },
    isDark: mocks.theme.isDark,
    setDarkMode: vi.fn(),
  }),
}));

import SuccessScreen from './success';

beforeEach(() => {
  mocks.theme.isDark = false;
});

describe('SuccessScreen', () => {
  it('renders the celebratory copy', () => {
    render(<SuccessScreen />);
    expect(screen.getByText("You're all set!")).toBeTruthy();
    expect(
      screen.getByText("Your account is ready. Let's personalize your planner in a few quick steps."),
    ).toBeTruthy();
  });

  it('navigates to /category when Continue is pressed', () => {
    render(<SuccessScreen />);
    fireEvent.click(screen.getByText('Continue'));
    expect(mocks.router.replace).toHaveBeenCalledWith('/category');
  });

  it('shows the light status bar style when the app theme is dark', () => {
    mocks.theme.isDark = true;
    render(<SuccessScreen />);
    expect(screen.getByTestId('status-bar').getAttribute('data-style')).toBe('light');
  });

  it('shows the dark status bar style when the app theme is light', () => {
    render(<SuccessScreen />);
    expect(screen.getByTestId('status-bar').getAttribute('data-style')).toBe('dark');
  });
});
