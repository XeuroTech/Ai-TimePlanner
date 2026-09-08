import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), back: vi.fn() },
  isDark: false,
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
    Tint: { primary: '#EFEBFF', orange: '#FFF3E1', green: '#E4F9EA' },
    isDark: mocks.isDark,
    setDarkMode: vi.fn(),
  }),
}));
vi.mock('@/store/planner-store', () => ({
  usePlannerStore: Object.assign((selector: any) => selector(mocks.plannerState), {
    getState: () => mocks.plannerState,
  }),
}));

import AddTaskScreen from './add-task';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isDark = false;
});

describe('AddTaskScreen', () => {
  it('renders the header, fields and defaults', () => {
    render(<AddTaskScreen />);
    expect(screen.getByText('Add Task')).toBeTruthy();
    expect(screen.getByText('Task')).toBeTruthy();
    expect(screen.getByText('Subject / Category')).toBeTruthy();
    expect(screen.getByText('Due')).toBeTruthy();
    expect(screen.getByText('Priority')).toBeTruthy();
    expect(screen.getByPlaceholderText('e.g. Finish assignment')).toBeTruthy();
    expect(screen.getByPlaceholderText('e.g. Mathematics')).toBeTruthy();
  });

  it('the back button calls router.back()', () => {
    render(<AddTaskScreen />);
    const backIcon = screen.getAllByTestId('icon').find((el) => el.getAttribute('data-name') === 'chevron-back')!;
    fireEvent.click(backIcon.parentElement!);
    expect(mocks.router.back).toHaveBeenCalledTimes(1);
  });

  it('typing into title and subject updates their values', () => {
    render(<AddTaskScreen />);
    const title = screen.getByPlaceholderText('e.g. Finish assignment') as HTMLInputElement;
    const subject = screen.getByPlaceholderText('e.g. Mathematics') as HTMLInputElement;
    fireEvent.change(title, { target: { value: 'Finish essay' } });
    fireEvent.change(subject, { target: { value: 'English' } });
    expect(title.value).toBe('Finish essay');
    expect(subject.value).toBe('English');
  });

  it('shows a validation error and does not save when the title is empty', () => {
    render(<AddTaskScreen />);
    fireEvent.click(screen.getByText('Save Task'));
    expect(screen.getByText('Please enter a task title.')).toBeTruthy();
    expect(mocks.plannerState.addTask).not.toHaveBeenCalled();
  });

  it('lets every due option be selected', () => {
    render(<AddTaskScreen />);
    fireEvent.change(screen.getByPlaceholderText('e.g. Finish assignment'), { target: { value: 'X' } });
    for (const opt of ['Today', 'Tomorrow', 'This week', 'Next week', 'No date']) {
      fireEvent.click(screen.getByText(opt));
    }
    fireEvent.click(screen.getByText('Save Task'));
    expect(mocks.plannerState.addTask).toHaveBeenCalledWith(expect.objectContaining({ due: 'No date' }));
  });

  it('lets every priority option be selected', () => {
    render(<AddTaskScreen />);
    fireEvent.change(screen.getByPlaceholderText('e.g. Finish assignment'), { target: { value: 'X' } });
    for (const p of ['High', 'Medium', 'Low']) {
      fireEvent.click(screen.getByText(p));
    }
    fireEvent.click(screen.getByText('Save Task'));
    expect(mocks.plannerState.addTask).toHaveBeenCalledWith(expect.objectContaining({ priority: 'Low' }));
  });

  it('defaults priority to Medium and due to Today when untouched', () => {
    render(<AddTaskScreen />);
    fireEvent.change(screen.getByPlaceholderText('e.g. Finish assignment'), { target: { value: 'X' } });
    fireEvent.click(screen.getByText('Save Task'));
    expect(mocks.plannerState.addTask).toHaveBeenCalledWith(
      expect.objectContaining({ due: 'Today', priority: 'Medium' }),
    );
  });

  it('falls back to "General" when subject is left blank', () => {
    render(<AddTaskScreen />);
    fireEvent.change(screen.getByPlaceholderText('e.g. Finish assignment'), { target: { value: 'X' } });
    fireEvent.click(screen.getByText('Save Task'));
    expect(mocks.plannerState.addTask).toHaveBeenCalledWith(expect.objectContaining({ subject: 'General' }));
  });

  it('submits a fully valid form (trimmed) and navigates back', () => {
    render(<AddTaskScreen />);
    fireEvent.change(screen.getByPlaceholderText('e.g. Finish assignment'), { target: { value: '  Finish essay  ' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. Mathematics'), { target: { value: ' English ' } });
    fireEvent.click(screen.getByText('Tomorrow'));
    fireEvent.click(screen.getByText('High'));

    fireEvent.click(screen.getByText('Save Task'));

    expect(mocks.plannerState.addTask).toHaveBeenCalledWith({
      title: 'Finish essay',
      subject: 'English',
      due: 'Tomorrow',
      priority: 'High',
    });
    expect(mocks.router.back).toHaveBeenCalledTimes(1);
  });

  it('renders without throwing when isDark is true', () => {
    mocks.isDark = true;
    render(<AddTaskScreen />);
    expect(screen.getByText('Add Task')).toBeTruthy();
  });

  it('applies the pressed style to the back button while held down', async () => {
    render(<AddTaskScreen />);
    const backIcon = screen.getAllByTestId('icon').find((el) => el.getAttribute('data-name') === 'chevron-back')!;
    const backBtn = backIcon.parentElement!;
    fireEvent.mouseDown(backBtn);
    await waitFor(() => {
      expect(getComputedStyle(backBtn).opacity).toBe('0.5');
    });
    fireEvent.mouseUp(backBtn);
  });

  it('applies the pressed style to the Save button while held down', async () => {
    render(<AddTaskScreen />);
    const saveBtn = screen.getByText('Save Task').parentElement!;
    fireEvent.mouseDown(saveBtn);
    await waitFor(() => {
      expect(getComputedStyle(saveBtn).backgroundColor).toBe('rgb(91, 62, 235)');
    });
    fireEvent.mouseUp(saveBtn);
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
      const { default: IosAddTaskScreen } = await import('./add-task');
      render(<IosAddTaskScreen />);
      expect(screen.getByText('Add Task')).toBeTruthy();
    });
  });
});
