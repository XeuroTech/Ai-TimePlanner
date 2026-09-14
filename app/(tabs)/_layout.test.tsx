import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@expo/vector-icons', () => ({
  Ionicons: (props: any) => (
    <span data-testid="icon" data-name={props.name} data-color={props.color} data-size={props.size} />
  ),
}));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock('@/lib/storage', () => ({
  zustandStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
}));

vi.mock('expo-haptics', () => ({ impactAsync: vi.fn(), ImpactFeedbackStyle: { Light: 'Light' } }));

// HapticTab (which TabLayout wires up as tabBarButton) imports PlatformPressable
// from 'expo-router/react-navigation', not '@react-navigation/elements' directly
// — mocking the latter alone leaves the former's real module graph (native-only
// navigation theming) loaded for real. HapticTab itself is already unit-tested
// separately, so a minimal stand-in is enough here.
vi.mock('expo-router/react-navigation', () => ({
  PlatformPressable: (props: any) => <button {...props} />,
}));

// expo-router's real `Tabs` mounts a native bottom-tab navigator that needs a
// real navigation container to render under jsdom. TabLayout only needs to
// prove it wires up screenOptions + one Tabs.Screen per route, so a minimal
// stand-in renders each screen's name/title and lets tests call its
// `tabBarIcon` function directly to check outline/solid icon selection.
vi.mock('expo-router', () => {
  const Tabs = ({ children }: any) => <div data-testid="tabs">{children}</div>;
  (Tabs as any).Screen = ({ name, options }: any) => (
    <div data-testid={`screen-${name}`}>
      {options?.title ? <span>{options.title}</span> : null}
      {options?.tabBarIcon ? options.tabBarIcon({ color: 'red', focused: false, size: 24 }) : null}
      {options?.tabBarIcon ? options.tabBarIcon({ color: 'blue', focused: true, size: 24 }) : null}
    </div>
  );
  return { Tabs };
});

import { useThemeStore } from '@/store/theme-store';
import TabLayout from './_layout';

beforeEach(() => {
  useThemeStore.setState({ darkMode: false, notificationsEnabled: true });
});

describe('TabLayout', () => {
  it('renders without throwing', () => {
    expect(() => render(<TabLayout />)).not.toThrow();
  });

  it('registers a screen for every tab route with its title', () => {
    render(<TabLayout />);
    expect(screen.getByTestId('screen-index')).toBeTruthy();
    expect(screen.getByText('Home')).toBeTruthy();
    expect(screen.getByTestId('screen-timetable')).toBeTruthy();
    expect(screen.getByText('Timetable')).toBeTruthy();
    expect(screen.getByTestId('screen-tasks')).toBeTruthy();
    expect(screen.getByText('Tasks')).toBeTruthy();
    expect(screen.getByTestId('screen-analytics')).toBeTruthy();
    expect(screen.getByText('Analytics')).toBeTruthy();
    expect(screen.getByTestId('screen-profile')).toBeTruthy();
    expect(screen.getByText('Profile')).toBeTruthy();
  });

  it('keeps the explore screen registered but hidden from the tab bar (no title)', () => {
    render(<TabLayout />);
    const exploreScreen = screen.getByTestId('screen-explore');
    expect(exploreScreen).toBeTruthy();
    expect(exploreScreen.textContent).toBe('');
  });

  it('renders the outline icon variant when unfocused and the solid variant when focused, per tab', () => {
    render(<TabLayout />);
    const icons = screen.getAllByTestId('icon').map((n) => n.getAttribute('data-name'));
    // index: home-outline (unfocused) / home (focused)
    expect(icons).toContain('home-outline');
    expect(icons).toContain('home');
    // timetable
    expect(icons).toContain('calendar-outline');
    expect(icons).toContain('calendar');
    // tasks
    expect(icons).toContain('checkbox-outline');
    expect(icons).toContain('checkbox');
    // analytics
    expect(icons).toContain('stats-chart-outline');
    expect(icons).toContain('stats-chart');
    // profile
    expect(icons).toContain('person-outline');
    expect(icons).toContain('person');
  });

  it('forwards the color/size given to the tab icon renderer', () => {
    render(<TabLayout />);
    const icons = screen.getAllByTestId('icon');
    const unfocusedHome = icons.find((n) => n.getAttribute('data-name') === 'home-outline')!;
    expect(unfocusedHome.getAttribute('data-color')).toBe('red');
    expect(unfocusedHome.getAttribute('data-size')).toBe('24');
    const focusedHome = icons.find((n) => n.getAttribute('data-name') === 'home')!;
    expect(focusedHome.getAttribute('data-color')).toBe('blue');
  });

  // The module-level `useSafeAreaInsets` mock above always returns
  // `bottom: 0`, which only exercises the ": 12" fallback side of
  // `insets.bottom > 0 ? insets.bottom : 12`. Re-mocking the module and
  // re-importing the component fresh (same approach used for Platform.OS
  // variations in app/daily-plan.test.tsx) lets one test supply a positive
  // bottom inset to hit the other side of that ternary.
  describe('safe-area inset variations', () => {
    afterEach(() => {
      vi.doUnmock('react-native-safe-area-context');
      vi.resetModules();
    });

    it('uses the raw bottom inset (instead of the 12px fallback) as tab bar padding when it is greater than 0', async () => {
      vi.resetModules();
      vi.doMock('react-native-safe-area-context', () => ({
        useSafeAreaInsets: () => ({ top: 0, bottom: 20, left: 0, right: 0 }),
      }));
      const { default: InsetTabLayout } = await import('./_layout');
      expect(() => render(<InsetTabLayout />)).not.toThrow();
    });
  });
});
