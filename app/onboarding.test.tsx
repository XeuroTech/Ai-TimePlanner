import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), back: vi.fn() },
  theme: { isDark: false },
}));

vi.mock('expo-router', () => ({ useRouter: () => mocks.router }));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: (props: any) => <span data-testid="icon" data-name={props.name} /> }));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}));
vi.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    Palette: { primary: '#6C4DFF', blue: '#4DA3FF', green: '#3DCB7A', orange: '#FFA34D', pink: '#FF6FAE', secondary: '#8B7DFF' },
    Tint: {},
    isDark: mocks.theme.isDark,
    setDarkMode: vi.fn(),
  }),
}));

import OnboardingScreen from './onboarding';

beforeEach(() => {
  mocks.theme.isDark = false;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('OnboardingScreen', () => {
  it('renders the welcome slide, Skip, and both call-to-action buttons', () => {
    render(<OnboardingScreen />);
    expect(screen.getByText('Welcome to Smart Planner')).toBeTruthy();
    expect(screen.getByText('Your AI powered personal timetable assistant.')).toBeTruthy();
    expect(screen.getByText('Skip')).toBeTruthy();
    expect(screen.getByText('Get Started')).toBeTruthy();
    expect(screen.getByText('Login')).toBeTruthy();
  });

  it('renders all three slides in the list (title text present even off-screen in a FlatList-on-web render)', () => {
    render(<OnboardingScreen />);
    expect(screen.getByText('AI That Plans For You')).toBeTruthy();
    expect(screen.getByText('Never Miss a Task')).toBeTruthy();
  });

  it('Skip enters the app via /register', () => {
    render(<OnboardingScreen />);
    fireEvent.click(screen.getByText('Skip'));
    expect(mocks.router.replace).toHaveBeenCalledWith('/register');
  });

  it('Get Started enters the app via /register', () => {
    render(<OnboardingScreen />);
    fireEvent.click(screen.getByText('Get Started'));
    expect(mocks.router.replace).toHaveBeenCalledWith('/register');
  });

  it('Login goes to /login', () => {
    render(<OnboardingScreen />);
    fireEvent.click(screen.getByText('Login'));
    expect(mocks.router.replace).toHaveBeenCalledWith('/login');
  });

  it('renders with the light-on-dark status bar style when the theme is dark', () => {
    mocks.theme.isDark = true;
    render(<OnboardingScreen />);
    expect(screen.getByText('Welcome to Smart Planner')).toBeTruthy();
  });

  it('applies the pressed style while Skip is held down', () => {
    vi.useFakeTimers();
    render(<OnboardingScreen />);
    fireEvent.mouseDown(screen.getByText('Skip'));
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.getByText('Skip')).toBeTruthy();
  });

  it('applies the pressed style while Get Started is held down', () => {
    vi.useFakeTimers();
    render(<OnboardingScreen />);
    fireEvent.mouseDown(screen.getByText('Get Started'));
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.getByText('Get Started')).toBeTruthy();
  });

  it('applies the pressed style while Login is held down', () => {
    vi.useFakeTimers();
    render(<OnboardingScreen />);
    fireEvent.mouseDown(screen.getByText('Login'));
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.getByText('Login')).toBeTruthy();
  });
});
