import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), back: vi.fn() },
  isDark: false,
}));

vi.mock('expo-router', () => ({ useRouter: () => mocks.router }));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('@expo/vector-icons', () => ({
  Ionicons: (props: any) => <span data-testid="icon" data-name={props.name} />,
}));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}));
vi.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    Palette: {
      primary: '#6C4DFF',
      bg: '#F6F5FF',
      ink: '#1B1B2F',
      subtle: '#9AA0B4',
      card: '#FFFFFF',
      primaryDark: '#5B3EEB',
    },
    Tint: { primary: '#EFEBFF' },
    isDark: mocks.isDark,
    setDarkMode: vi.fn(),
  }),
}));

import CalendarScreen from './calendar';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isDark = false;
});

describe('CalendarScreen', () => {
  it('renders the header and the current month', () => {
    render(<CalendarScreen />);
    expect(screen.getByText('Calendar')).toBeTruthy();
    const now = new Date();
    const label = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    expect(screen.getByText(label)).toBeTruthy();
  });

  it('the back button calls router.back()', () => {
    render(<CalendarScreen />);
    const backIcon = screen.getAllByTestId('icon').find((el) => el.getAttribute('data-name') === 'chevron-back')!;
    fireEvent.click(backIcon.parentElement!);
    expect(mocks.router.back).toHaveBeenCalledTimes(1);
  });

  it('selects today by default, showing the Today badge and an empty events list', () => {
    render(<CalendarScreen />);
    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText('No events scheduled')).toBeTruthy();
    const now = new Date();
    const label = now.toLocaleDateString('en-US', { day: 'numeric', month: 'long' });
    expect(screen.getByText(`Events on ${label}`)).toBeTruthy();
  });

  it('selecting a different day updates the events header and hides the Today badge', () => {
    render(<CalendarScreen />);
    // Day 15 is always unique across the 42-cell grid (the only out-of-month
    // overflow cells sit right at the start/end of the visible range) —
    // except when today itself is the 15th, in which case it wouldn't be "a
    // different day" at all, so fall back to the also-always-unique 16th.
    const now = new Date();
    const day = now.getDate() === 15 ? 16 : 15;
    fireEvent.click(screen.getByText(String(day)));
    expect(screen.queryByText('Today')).toBeNull();
    const label = new Date(now.getFullYear(), now.getMonth(), day).toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'long',
    });
    expect(screen.getByText(`Events on ${label}`)).toBeTruthy();
    // Still no events wired up for any day.
    expect(screen.getByText('No events scheduled')).toBeTruthy();
  });

  it('navigating to the next month updates the month label, and back navigates to the previous', () => {
    render(<CalendarScreen />);
    const now = new Date();
    const nextLabel = new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
    const currentLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const chevrons = screen.getAllByTestId('icon').filter((el) => el.getAttribute('data-name') === 'chevron-forward');
    fireEvent.click(chevrons[0].parentElement!);
    expect(screen.getByText(nextLabel)).toBeTruthy();
    expect(screen.queryByText(currentLabel)).toBeNull();

    const backChevrons = screen
      .getAllByTestId('icon')
      .filter((el) => el.getAttribute('data-name') === 'chevron-back');
    // backChevrons[0] is the header back button; the month-nav one is the other.
    const monthBack = backChevrons.find((el) => el.parentElement !== screen.getAllByTestId('icon')[0].parentElement)!;
    fireEvent.click(monthBack.parentElement!);
    expect(screen.getByText(currentLabel)).toBeTruthy();
  });

  it('pressing the floating add button navigates to the daily plan for the selected date', () => {
    render(<CalendarScreen />);
    const addIcon = screen.getAllByTestId('icon').find((el) => el.getAttribute('data-name') === 'add')!;
    fireEvent.click(addIcon.parentElement!);
    expect(mocks.router.push).toHaveBeenCalledWith({
      pathname: '/daily-plan',
      params: { date: expect.any(String) },
    });
  });

  it('renders without crashing in dark mode (isDark-dependent StatusBar branch)', () => {
    mocks.isDark = true;
    render(<CalendarScreen />);
    expect(screen.getByText('Calendar')).toBeTruthy();
  });

  it('applies the pressed style to the header back button while held down', async () => {
    render(<CalendarScreen />);
    const backIcon = screen.getAllByTestId('icon').find((el) => el.getAttribute('data-name') === 'chevron-back')!;
    const btn = backIcon.parentElement!;
    fireEvent.mouseDown(btn);
    await waitFor(() => expect(getComputedStyle(btn).opacity).toBe('0.5'), { timeout: 3000 });
    fireEvent.mouseUp(btn);
  });

  it('applies the pressed style to the previous-month nav button while held down', async () => {
    render(<CalendarScreen />);
    const chevrons = screen.getAllByTestId('icon').filter((el) => el.getAttribute('data-name') === 'chevron-back');
    // chevrons[0] is the header button, chevrons[1] is the month-nav "previous" button.
    const btn = chevrons[1].parentElement!;
    fireEvent.mouseDown(btn);
    await waitFor(() => expect(getComputedStyle(btn).opacity).toBe('0.5'), { timeout: 3000 });
    fireEvent.mouseUp(btn);
  });

  it('applies the pressed style to the next-month nav button while held down', async () => {
    render(<CalendarScreen />);
    const forwardIcon = screen.getAllByTestId('icon').find((el) => el.getAttribute('data-name') === 'chevron-forward')!;
    const btn = forwardIcon.parentElement!;
    fireEvent.mouseDown(btn);
    await waitFor(() => expect(getComputedStyle(btn).opacity).toBe('0.5'), { timeout: 3000 });
    fireEvent.mouseUp(btn);
  });

  it('applies the pressed style (darker background) to the floating add button while held down', async () => {
    render(<CalendarScreen />);
    const addIcon = screen.getAllByTestId('icon').find((el) => el.getAttribute('data-name') === 'add')!;
    const btn = addIcon.parentElement!;
    // fabPressed swaps the background to Palette.primaryDark (#5B3EEB) rather
    // than dimming opacity like the other Pressables on this screen.
    fireEvent.mouseDown(btn);
    await waitFor(() => expect(getComputedStyle(btn).backgroundColor).toBe('rgb(91, 62, 235)'), { timeout: 3000 });
    fireEvent.mouseUp(btn);
  });

  /**
   * `EVENTS` is a hardcoded empty object (see the module-level comment in
   * calendar.tsx) — this is an intentional stub screen with no data source
   * wired up yet. As a result `selectedEvents` is always `[]`, so:
   *   - the `selectedEvents.length === 0` false branch (the populated-events
   *     list JSX, and the `.map` callback inside it) never runs,
   *   - `hasEvents` is always false, so its true branch (the colored event
   *     dot) never runs, along with the nested `isSelected ? '#FFFFFF' : ...`
   *     color ternary that only matters on that dead branch.
   * These are permanently unreachable until a real events data source is
   * wired in, so they are deliberately left uncovered rather than forcing a
   * fake render path that could never happen with the current EVENTS
   * constant.
   */
});
