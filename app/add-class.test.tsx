import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), back: vi.fn() },
  isDark: false,
  authState: { profile: null as any },
  plannerState: {
    classes: [] as any[],
    tasks: [] as any[],
    plans: [] as any[],
    addClass: vi.fn(),
    addTask: vi.fn(),
    addPlan: vi.fn(),
    togglePlan: vi.fn(),
    removePlan: vi.fn(),
  },
}));

vi.mock('expo-router', () => ({ useRouter: () => mocks.router, useLocalSearchParams: () => ({}) }));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('expo-haptics', () => ({ selectionAsync: vi.fn(async () => {}) }));
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
      primaryDark: '#5B3EEB',
      secondary: '#8B7DFF',
      blue: '#4DA3FF',
      green: '#4CD964',
      orange: '#FFB648',
      pink: '#FF6FAE',
      bg: '#F6F5FF',
      ink: '#1B1B2F',
      muted: '#6E6B8A',
      subtle: '#9AA0B4',
      hairline: '#ECE9FB',
      card: '#FFFFFF',
    },
    Tint: { primary: '#EFEBFF', blue: '#E7F1FF', green: '#E4F9EA', orange: '#FFF3E1', pink: '#FFE9F2' },
    isDark: mocks.isDark,
    setDarkMode: vi.fn(),
  }),
}));
vi.mock('@/store/auth-store', () => ({
  useAuthStore: Object.assign((selector: any) => selector(mocks.authState), { getState: () => mocks.authState }),
  useProfile: () => mocks.authState.profile,
}));
vi.mock('@/store/planner-store', () => ({
  usePlannerStore: Object.assign((selector: any) => selector(mocks.plannerState), {
    getState: () => mocks.plannerState,
  }),
  useMyClasses: () => mocks.plannerState.classes,
}));
// add-class.tsx pulls in REMINDER_OPTIONS from lib/services/reminders.ts, whose
// module scope wires up expo-notifications and reads the theme store — neither
// of which is relevant here, so both are neutralized to plain fakes.
vi.mock('@/lib/services/notifications', () => ({
  cancelAllScheduled: vi.fn(async () => {}),
  cancelByKind: vi.fn(async () => {}),
  getNotificationPermission: vi.fn(async () => 'granted'),
  scheduleDaily: vi.fn(async () => 'id'),
  scheduleOnce: vi.fn(async () => 'id'),
  scheduleWeekly: vi.fn(async () => 'id'),
}));
vi.mock('@/store/theme-store', () => ({
  useThemeStore: { getState: () => ({ notificationsEnabled: true }) },
}));

import AddClassScreen from './add-class';

function getColorHits() {
  const label = screen.getByText('Color');
  const field = label.parentElement as HTMLElement;
  const colorRow = field.lastElementChild as HTMLElement;
  return Array.from(colorRow.children) as HTMLElement[];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authState.profile = null;
  mocks.isDark = false;
});

describe('AddClassScreen', () => {
  it('renders the "other" category defaults when no profile is signed in', () => {
    render(<AddClassScreen />);
    expect(screen.getByText('Add Event')).toBeTruthy();
    expect(screen.getByText('Title')).toBeTruthy();
    expect(screen.getByText('With')).toBeTruthy();
    expect(screen.getByText('Location')).toBeTruthy();
    expect(screen.getByText('Save Event')).toBeTruthy();
    expect(screen.getByPlaceholderText('e.g. Appointment')).toBeTruthy();
  });

  it('adapts title, field labels and placeholders to the signed-in profile category', () => {
    mocks.authState.profile = { category: 'student' };
    render(<AddClassScreen />);
    expect(screen.getByText('Add Class')).toBeTruthy();
    expect(screen.getByText('Subject')).toBeTruthy();
    expect(screen.getByText('Teacher')).toBeTruthy();
    expect(screen.getByText('Room')).toBeTruthy();
    expect(screen.getByPlaceholderText('e.g. Mathematics')).toBeTruthy();
    expect(screen.getByPlaceholderText('e.g. Mr. Khan')).toBeTruthy();
    expect(screen.getByPlaceholderText('e.g. Class Room 2')).toBeTruthy();
    expect(screen.getByText('Save Class')).toBeTruthy();
  });

  it('the back button calls router.back()', () => {
    render(<AddClassScreen />);
    const backIcon = screen.getAllByTestId('icon').find((el) => el.getAttribute('data-name') === 'chevron-back')!;
    fireEvent.click(backIcon.parentElement!);
    expect(mocks.router.back).toHaveBeenCalledTimes(1);
  });

  it('renders without throwing when isDark is true', () => {
    mocks.isDark = true;
    render(<AddClassScreen />);
    expect(screen.getByText('Add Event')).toBeTruthy();
  });

  it('applies the pressed style to the back button while held down', async () => {
    render(<AddClassScreen />);
    const backIcon = screen.getAllByTestId('icon').find((el) => el.getAttribute('data-name') === 'chevron-back')!;
    const backBtn = backIcon.parentElement!;
    // react-native-web's Pressable drives its `pressed` render-prop state off
    // real "mousedown"/"mouseup" DOM events, with a ~50ms delayPressStart
    // before it activates — wait for it rather than asserting synchronously.
    fireEvent.mouseDown(backBtn);
    await waitFor(() => {
      expect(getComputedStyle(backBtn).opacity).toBe('0.5');
    });
    fireEvent.mouseUp(backBtn);
  });

  it('applies the pressed style to the Save button while held down', async () => {
    render(<AddClassScreen />);
    const saveBtn = screen.getByText('Save Event').parentElement!;
    fireEvent.mouseDown(saveBtn);
    await waitFor(() => {
      expect(getComputedStyle(saveBtn).backgroundColor).toBe('rgb(91, 62, 235)');
    });
    fireEvent.mouseUp(saveBtn);
  });

  it('typing into subject, person and place updates their values', () => {
    render(<AddClassScreen />);
    const subject = screen.getByPlaceholderText('e.g. Appointment') as HTMLInputElement;
    const person = screen.getByPlaceholderText('e.g. Someone') as HTMLInputElement;
    const place = screen.getByPlaceholderText('e.g. Somewhere') as HTMLInputElement;
    fireEvent.change(subject, { target: { value: 'Team sync' } });
    fireEvent.change(person, { target: { value: 'Bob' } });
    fireEvent.change(place, { target: { value: 'Zoom' } });
    expect(subject.value).toBe('Team sync');
    expect(person.value).toBe('Bob');
    expect(place.value).toBe('Zoom');
  });

  it('shows a duration helper under End Time derived from Start Time', () => {
    render(<AddClassScreen />);
    expect(screen.getByText('1h')).toBeTruthy(); // default 9:00 AM -> 10:00 AM
  });

  it('moving Start Time past End Time pushes End Time forward to preserve the duration', () => {
    vi.useFakeTimers().setSystemTime(new Date(2026, 0, 5, 11, 0)); // 11:00 AM
    render(<AddClassScreen />);
    fireEvent.click(screen.getByText('9:00 AM'));
    expect(screen.getByText('Start time')).toBeTruthy();
    fireEvent.click(screen.getByText('Now'));
    fireEvent.click(screen.getByText('OK'));

    expect(screen.getByText('11:00 AM')).toBeTruthy();
    expect(screen.getByText('12:00 PM')).toBeTruthy();
    expect(screen.queryByText('9:00 AM')).toBeNull();
    expect(screen.queryByText('10:00 AM')).toBeNull();
    vi.useRealTimers();
  });

  it('leaves End Time untouched when Start Time is changed but stays before End Time', () => {
    render(<AddClassScreen />);
    fireEvent.click(screen.getByText('9:00 AM'));
    expect(screen.getByText('Start time')).toBeTruthy();
    // Confirm without changing anything: the new start (9:00 AM) is still
    // before the current end (10:00 AM), so end must be left alone.
    fireEvent.click(screen.getByText('OK'));
    expect(screen.getByText('9:00 AM')).toBeTruthy();
    expect(screen.getByText('10:00 AM')).toBeTruthy();
  });

  it('setting End Time at/before Start Time and saving shows a validation error, without calling addClass', () => {
    vi.useFakeTimers().setSystemTime(new Date(2026, 0, 5, 6, 0)); // 6:00 AM
    render(<AddClassScreen />);
    fireEvent.change(screen.getByPlaceholderText('e.g. Appointment'), { target: { value: 'Math' } });
    fireEvent.click(screen.getByText('10:00 AM'));
    expect(screen.getByText('End time')).toBeTruthy();
    fireEvent.click(screen.getByText('Now'));
    fireEvent.click(screen.getByText('OK'));

    fireEvent.click(screen.getByText('Save Event'));
    expect(screen.getByText('End time must be after start time.')).toBeTruthy();
    expect(mocks.plannerState.addClass).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('shows a validation error and does not save when the subject is empty', () => {
    render(<AddClassScreen />);
    fireEvent.click(screen.getByText('Save Event'));
    expect(screen.getByText('Please enter a title.')).toBeTruthy();
    expect(mocks.plannerState.addClass).not.toHaveBeenCalled();
  });

  it('lets every day be selected', () => {
    render(<AddClassScreen />);
    fireEvent.change(screen.getByPlaceholderText('e.g. Appointment'), { target: { value: 'X' } });
    fireEvent.click(screen.getByText('Fri'));
    fireEvent.click(screen.getByText('Save Event'));
    expect(mocks.plannerState.addClass).toHaveBeenCalledWith(expect.objectContaining({ day: 4 }));
  });

  it('lets every reminder option be selected', () => {
    render(<AddClassScreen />);
    fireEvent.change(screen.getByPlaceholderText('e.g. Appointment'), { target: { value: 'X' } });
    for (const opt of ['None', 'At start', '10 min before', '30 min before', '1 hour before']) {
      fireEvent.click(screen.getByText(opt));
    }
    fireEvent.click(screen.getByText('Save Event'));
    expect(mocks.plannerState.addClass).toHaveBeenCalledWith(expect.objectContaining({ reminder: '1 hour before' }));
  });

  it('lets every repeat option be selected', () => {
    render(<AddClassScreen />);
    fireEvent.change(screen.getByPlaceholderText('e.g. Appointment'), { target: { value: 'X' } });
    for (const opt of ['Never', 'Daily', 'Weekly', 'Weekdays']) {
      fireEvent.click(screen.getByText(opt));
    }
    fireEvent.click(screen.getByText('Save Event'));
    expect(mocks.plannerState.addClass).toHaveBeenCalledWith(expect.objectContaining({ repeat: 'Weekdays' }));
  });

  it('lets every color swatch be selected', () => {
    render(<AddClassScreen />);
    fireEvent.change(screen.getByPlaceholderText('e.g. Appointment'), { target: { value: 'X' } });
    const hits = getColorHits();
    // 7 preset swatches + 1 trailing custom-color swatch.
    expect(hits).toHaveLength(8);
    fireEvent.click(hits[2]); // green
    fireEvent.click(screen.getByText('Save Event'));
    expect(mocks.plannerState.addClass).toHaveBeenCalledWith(expect.objectContaining({ color: '#4CD964' }));
  });

  it('submits a fully valid form and navigates back', () => {
    render(<AddClassScreen />);
    fireEvent.change(screen.getByPlaceholderText('e.g. Appointment'), { target: { value: '  Team sync  ' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. Someone'), { target: { value: ' Bob ' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. Somewhere'), { target: { value: ' Zoom ' } });
    fireEvent.click(screen.getByText('Fri'));
    fireEvent.click(screen.getByText('10 min before'));
    fireEvent.click(screen.getByText('Daily'));

    fireEvent.click(screen.getByText('Save Event'));

    expect(mocks.plannerState.addClass).toHaveBeenCalledWith({
      subject: 'Team sync',
      day: 4,
      start: 540,
      end: 600,
      teacher: 'Bob',
      room: 'Zoom',
      reminder: '10 min before',
      repeat: 'Daily',
      color: '#6C4DFF',
    });
    expect(mocks.router.back).toHaveBeenCalledTimes(1);
  });

  it('omits teacher/room when left blank (trimmed to undefined)', () => {
    render(<AddClassScreen />);
    fireEvent.change(screen.getByPlaceholderText('e.g. Appointment'), { target: { value: 'X' } });
    fireEvent.click(screen.getByText('Save Event'));
    expect(mocks.plannerState.addClass).toHaveBeenCalledWith(
      expect.objectContaining({ teacher: undefined, room: undefined }),
    );
  });

  describe('platform-specific module behavior', () => {
    afterEach(() => {
      vi.doUnmock('react-native');
      vi.resetModules();
    });

    it('uses the "padding" KeyboardAvoidingView behavior when Platform.OS is "ios"', async () => {
      vi.resetModules();
      vi.doMock('react-native', async (importOriginal) => {
        const actual = await importOriginal<typeof import('react-native')>();
        return { ...actual, Platform: { ...actual.Platform, OS: 'ios' } };
      });
      const { default: IosAddClassScreen } = await import('./add-class');
      render(<IosAddClassScreen />);
      expect(screen.getByText('Add Event')).toBeTruthy();
    });
  });
});
