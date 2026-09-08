import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PanResponder, Platform } from 'react-native';

vi.mock('@expo/vector-icons', () => ({ Ionicons: (props: any) => <span data-testid="icon" data-name={props.name} /> }));
vi.mock('expo-haptics', () => ({ selectionAsync: vi.fn(async () => {}) }));
vi.mock('@/lib/storage', () => ({
  zustandStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
}));

import * as Haptics from 'expo-haptics';
import { useThemeStore } from '@/store/theme-store';
import { ClockDial, ClockTimeField, ClockTimePickerModal } from './clock-time-picker';

beforeEach(() => {
  useThemeStore.setState({ darkMode: false, notificationsEnabled: true });
});

const HOUR_HINT = 'Drag or tap to pick the hour';
const MINUTE_HINT = 'Drag or tap to pick the minutes';

/**
 * The actual dial `View` (the one carrying `{...pan.panHandlers}`) has no
 * testID, but it's always the next DOM sibling of the hint text right above
 * it, so this is a stable way to grab it regardless of the current value.
 */
function dialEl(hint: string) {
  return screen.getByText(hint).nextElementSibling as HTMLElement;
}

/**
 * Dragging the dial goes through React Native's PanResponder, which
 * react-native-web wires to real pointer events and real layout measurement
 * (`measureInWindow`) — neither of which jsdom provides meaningfully (no
 * layout engine, all bounding boxes are zero). That interaction is exercised
 * manually/on-device instead; these tests cover everything else: rendering,
 * mode/AM-PM taps, the modal lifecycle, and every field/variant branch.
 */
describe('ClockDial', () => {
  it('shows hour labels and the hour-picking hint in hour mode', () => {
    render(<ClockDial value={9 * 60 + 5} onChange={vi.fn()} mode="hour" onModeChange={vi.fn()} />);
    expect(screen.getByText('Drag or tap to pick the hour')).toBeTruthy();
    expect(screen.getByText('9')).toBeTruthy(); // hour label
    expect(screen.getByText('05')).toBeTruthy(); // minute readout
  });

  it('shows minute labels and the minute-picking hint in minute mode', () => {
    render(<ClockDial value={9 * 60 + 5} onChange={vi.fn()} mode="minute" onModeChange={vi.fn()} />);
    expect(screen.getByText('Drag or tap to pick the minutes')).toBeTruthy();
    // "05" appears twice: the minute readout and its matching ring label.
    expect(screen.getAllByText('05')).toHaveLength(2);
  });

  it('tapping the hour readout switches to hour mode', () => {
    const onModeChange = vi.fn();
    render(<ClockDial value={9 * 60} onChange={vi.fn()} mode="minute" onModeChange={onModeChange} />);
    fireEvent.click(screen.getByText('09'));
    expect(onModeChange).toHaveBeenCalledWith('hour');
  });

  it('tapping the minute readout switches to minute mode', () => {
    const onModeChange = vi.fn();
    render(<ClockDial value={9 * 60} onChange={vi.fn()} mode="hour" onModeChange={onModeChange} />);
    fireEvent.click(screen.getByText('00'));
    expect(onModeChange).toHaveBeenCalledWith('minute');
  });

  it('tapping the inactive AM/PM button recomputes the time and fires onChange', () => {
    const onChange = vi.fn();
    render(<ClockDial value={9 * 60} onChange={onChange} mode="hour" onModeChange={vi.fn()} />); // 9:00 AM
    fireEvent.click(screen.getByText('PM'));
    expect(onChange).toHaveBeenCalledWith(21 * 60); // 9:00 PM
  });

  it('tapping the already-active AM/PM button does nothing', () => {
    const onChange = vi.fn();
    render(<ClockDial value={9 * 60} onChange={onChange} mode="hour" onModeChange={vi.fn()} />); // already AM
    fireEvent.click(screen.getByText('AM'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('fires the haptic on non-web platforms and swallows a rejected promise', async () => {
    const originalOS = Platform.OS;
    Platform.OS = 'ios';
    vi.mocked(Haptics.selectionAsync).mockRejectedValueOnce(new Error('unavailable'));
    const onChange = vi.fn();
    render(<ClockDial value={9 * 60} onChange={onChange} mode="hour" onModeChange={vi.fn()} />); // 9:00 AM
    fireEvent.click(screen.getByText('PM'));
    expect(onChange).toHaveBeenCalledWith(21 * 60);
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    // Let the rejected promise's `.catch(() => {})` actually run before restoring.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    Platform.OS = originalOS;
  });

  /**
   * Real gestures go through core `PanResponder`, which react-native-web wires
   * to genuine `mousedown`/`mousemove`/`mouseup` DOM events dispatched at
   * `document` (see react-native-web's responder-event system) and to a real
   * `measureInWindow` (`getBoundingClientRect`, which jsdom always reports as
   * all-zero). That means `fireEvent.mouseDown/Move/Up` with explicit
   * `clientX`/`clientY` genuinely drives the same code path a touch would —
   * jsdom just has no layout, so the dial's centre is always (0, 0) and the
   * touch coordinates map onto the dial's local space directly.
   */
  describe('dragging the dial (real pointer events)', () => {
    it('dragging to a point on the ring picks that hour and fires onChange', async () => {
      const onChange = vi.fn();
      render(<ClockDial value={0} onChange={onChange} mode="hour" onModeChange={vi.fn()} />); // 12:00 AM
      // (234, 134) is due east of the dial's centre -> 90 degrees clockwise from 12 -> hour slot 3.
      fireEvent.mouseDown(dialEl(HOUR_HINT), { button: 0, buttons: 1, clientX: 234, clientY: 134 });
      expect(onChange).toHaveBeenCalledWith(3 * 60);
      // Let the pending real `measureInWindow` (`setTimeout`) callback run too.
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
    });

    it('tapping the already-selected hour slot is a no-op (unchanged value, no onChange)', () => {
      const onChange = vi.fn();
      render(<ClockDial value={0} onChange={onChange} mode="hour" onModeChange={vi.fn()} />); // hour12 = 12
      // (134, 0) is due north (12 o'clock) -> slot 0 -> hour 12, i.e. unchanged.
      fireEvent.mouseDown(dialEl(HOUR_HINT), { button: 0, buttons: 1, clientX: 134, clientY: 0 });
      expect(onChange).not.toHaveBeenCalled();
    });

    it('dragging in minute mode with the default (1-minute) step snaps to whole minutes', () => {
      const onChange = vi.fn();
      render(<ClockDial value={9 * 60} onChange={onChange} mode="minute" onModeChange={vi.fn()} />); // 9:00
      // 90 degrees -> raw minute 15.
      fireEvent.mouseDown(dialEl(MINUTE_HINT), { button: 0, buttons: 1, clientX: 234, clientY: 134 });
      expect(onChange).toHaveBeenCalledWith(9 * 60 + 15);
    });

    it('dragging in minute mode with a 5-minute step snaps to the nearest step', () => {
      const onChange = vi.fn();
      render(
        <ClockDial value={9 * 60} onChange={onChange} mode="minute" onModeChange={vi.fn()} minuteStep={5} />,
      );
      // 45 degrees -> raw minute 7.5 (rounds to 8) -> snapped to the nearest 5 -> 10.
      fireEvent.mouseDown(dialEl(MINUTE_HINT), { button: 0, buttons: 1, clientX: 234, clientY: 34 });
      expect(onChange).toHaveBeenCalledWith(9 * 60 + 10);
    });

    it('continuing to move the pointer after the initial grant keeps updating the value', () => {
      const onChange = vi.fn();
      render(<ClockDial value={0} onChange={onChange} mode="hour" onModeChange={vi.fn()} />);
      const el = dialEl(HOUR_HINT);
      fireEvent.mouseDown(el, { button: 0, buttons: 1, clientX: 234, clientY: 134 }); // hour 3
      fireEvent.mouseMove(el, { buttons: 1, clientX: 134, clientY: 234 }); // due south -> hour 6
      expect(onChange).toHaveBeenNthCalledWith(1, 3 * 60);
      expect(onChange).toHaveBeenNthCalledWith(2, 6 * 60);
    });

    it('can pick up an in-progress pointer move even if the press did not start on the dial', () => {
      const onChange = vi.fn();
      render(<ClockDial value={0} onChange={onChange} mode="hour" onModeChange={vi.fn()} />);
      // A mousedown elsewhere keeps a pointer "tracked" by the responder system,
      // so the following mousemove over the dial is processed as a real drag —
      // this is the only way to exercise `onMoveShouldSetPanResponder`, since
      // once the dial is already the responder, further moves skip straight to
      // `onPanResponderMove` without re-asking "should this view respond?".
      fireEvent.mouseDown(document.body, { button: 0, buttons: 1 });
      fireEvent.mouseMove(dialEl(HOUR_HINT), { buttons: 1, clientX: 234, clientY: 134 });
      expect(onChange).toHaveBeenCalledWith(3 * 60);
    });

    it('releasing the drag in hour mode hands off to minute mode', () => {
      const onModeChange = vi.fn();
      render(<ClockDial value={0} onChange={vi.fn()} mode="hour" onModeChange={onModeChange} />);
      const el = dialEl(HOUR_HINT);
      fireEvent.mouseDown(el, { button: 0, buttons: 1, clientX: 234, clientY: 134 });
      fireEvent.mouseUp(el, { button: 0, buttons: 1 });
      expect(onModeChange).toHaveBeenCalledWith('minute');
    });

    it('releasing the drag in minute mode leaves the mode unchanged', () => {
      const onModeChange = vi.fn();
      render(<ClockDial value={9 * 60} onChange={vi.fn()} mode="minute" onModeChange={onModeChange} />);
      const el = dialEl(MINUTE_HINT);
      fireEvent.mouseDown(el, { button: 0, buttons: 1, clientX: 234, clientY: 134 });
      fireEvent.mouseUp(el, { button: 0, buttons: 1 });
      expect(onModeChange).not.toHaveBeenCalled();
    });

    it('starting a touch on another control mid-drag cannot steal the dial (termination is always rejected)', () => {
      const onChange = vi.fn();
      render(<ClockDial value={0} onChange={onChange} mode="hour" onModeChange={vi.fn()} />);
      const el = dialEl(HOUR_HINT);
      fireEvent.mouseDown(el, { button: 0, buttons: 1, clientX: 234, clientY: 134 }); // grant -> hour 3
      // The PM button wants the responder too, but the dial's
      // `onPanResponderTerminationRequest` always rejects the handoff.
      fireEvent.mouseDown(screen.getByText('PM'), { button: 0, buttons: 1 });
      fireEvent.mouseMove(el, { buttons: 1, clientX: 134, clientY: 234 }); // drag continues -> hour 6
      expect(onChange).toHaveBeenNthCalledWith(1, 3 * 60);
      expect(onChange).toHaveBeenNthCalledWith(2, 6 * 60);
    });

    /**
     * The test above drives a *real* competing mousedown to prove the dial
     * doesn't visibly lose the drag, but react-native-web's Pressable never
     * actually enters the low-level Responder negotiation for a plain tap, so
     * `onPanResponderTerminationRequest` itself never runs that way. It's
     * still real production wiring worth pinning down directly: capture the
     * exact config object handed to `PanResponder.create` and invoke the
     * callback itself, the same way the gesture system would if something
     * ever did request the handoff.
     */
    it('onPanResponderTerminationRequest always returns false (direct callback check)', () => {
      const createSpy = vi.spyOn(PanResponder, 'create');
      render(<ClockDial value={0} onChange={vi.fn()} mode="hour" onModeChange={vi.fn()} />);
      const config = createSpy.mock.calls[createSpy.mock.calls.length - 1][0];
      expect(config.onPanResponderTerminationRequest!({} as any, {} as any)).toBe(false);
      createSpy.mockRestore();
    });

    it('renders an off-grid minute value that has no matching ring label', () => {
      render(<ClockDial value={9 * 60 + 7} onChange={vi.fn()} mode="minute" onModeChange={vi.fn()} />);
      // 7 isn't a multiple of 5, so only the padded minute readout shows it —
      // exercises the `activeIndex = -1` / off-label-dot branches.
      expect(screen.getByText('07')).toBeTruthy();
      expect(screen.getByText(MINUTE_HINT)).toBeTruthy();
    });
  });
});

describe('ClockTimePickerModal', () => {
  it('renders nothing when not visible', () => {
    render(<ClockTimePickerModal visible={false} value={9 * 60} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.queryByText('Select time')).toBeNull();
  });

  it('renders the sheet, seeded from `value`, when visible', () => {
    render(<ClockTimePickerModal visible value={9 * 60 + 5} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByText('Select time')).toBeTruthy();
    expect(screen.getByText('09')).toBeTruthy();
    expect(screen.getByText('05')).toBeTruthy();
  });

  it('uses a custom title and confirm label when given', () => {
    render(
      <ClockTimePickerModal
        visible
        value={9 * 60}
        title="Wake-up time"
        confirmLabel="Done"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText('Wake-up time')).toBeTruthy();
    expect(screen.getByText('Done')).toBeTruthy();
  });

  it('Cancel calls onCancel without confirming a value', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<ClockTimePickerModal visible value={9 * 60} onCancel={onCancel} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('OK confirms the unedited draft (the original value) when nothing was changed', () => {
    const onConfirm = vi.fn();
    render(<ClockTimePickerModal visible value={9 * 60 + 30} onCancel={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText('OK'));
    expect(onConfirm).toHaveBeenCalledWith(9 * 60 + 30);
  });

  it('"Now" sets the draft to the current time, then OK confirms that', () => {
    vi.useFakeTimers().setSystemTime(new Date(2026, 0, 5, 14, 30));
    const onConfirm = vi.fn();
    render(<ClockTimePickerModal visible value={9 * 60} onCancel={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText('Now'));
    fireEvent.click(screen.getByText('OK'));
    expect(onConfirm).toHaveBeenCalledWith(14 * 60 + 30);
    vi.useRealTimers();
  });

  it('clicking inside the sheet but not on a button swallows the tap instead of dismissing', () => {
    const onCancel = vi.fn();
    render(<ClockTimePickerModal visible value={9 * 60} onCancel={onCancel} onConfirm={vi.fn()} />);
    // The title text isn't wrapped in its own Pressable, so the click bubbles
    // up to the sheet's own no-op `onPress` (added specifically so taps on
    // blank sheet area don't fall through to the backdrop's dismiss handler).
    fireEvent.click(screen.getByText('Select time'));
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByText('Select time')).toBeTruthy();
  });

  it('shows a pressed visual state on Now, Cancel and OK while they are held down', async () => {
    vi.useFakeTimers();
    render(<ClockTimePickerModal visible value={9 * 60} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    const now = screen.getByText('Now').parentElement as HTMLElement;
    const cancel = screen.getByText('Cancel').parentElement as HTMLElement;
    const ok = screen.getByText('OK').parentElement as HTMLElement;

    for (const btn of [now, cancel, ok]) {
      const before = btn.className;
      fireEvent.mouseDown(btn, { button: 0, buttons: 1 });
      // The pressed visual state activates after react-native-web's default
      // ~50ms press-in delay, not synchronously on grant.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60);
      });
      expect(btn.className).not.toBe(before);
      fireEvent.mouseUp(btn, { button: 0, buttons: 1 });
    }
    vi.useRealTimers();
  });
});

describe('ClockTimeField', () => {
  it('renders the label and the formatted current time (input variant, the default)', () => {
    render(<ClockTimeField label="Wake up" value={9 * 60 + 5} onChange={vi.fn()} />);
    expect(screen.getByText('Wake up')).toBeTruthy();
    expect(screen.getByText('9:05 AM')).toBeTruthy();
  });

  it('renders no label row for the pill variant, even if one is passed', () => {
    render(<ClockTimeField label="Wake up" value={9 * 60} onChange={vi.fn()} variant="pill" />);
    expect(screen.queryByText('Wake up')).toBeNull();
    expect(screen.getByText('9:00 AM')).toBeTruthy();
  });

  it('shows a helper string when given', () => {
    render(<ClockTimeField value={9 * 60} onChange={vi.fn()} helper="Custom helper" />);
    expect(screen.getByText('Custom helper')).toBeTruthy();
  });

  it('derives a duration helper from compareTo when no explicit helper is given', () => {
    render(<ClockTimeField value={10 * 60} onChange={vi.fn()} compareTo={9 * 60} />);
    expect(screen.getByText('1h')).toBeTruthy();
  });

  it('shows no duration helper when compareTo is not before the value', () => {
    render(<ClockTimeField value={9 * 60} onChange={vi.fn()} compareTo={10 * 60} />);
    expect(screen.queryByText(/^\d+h/)).toBeNull();
  });

  it('opens the picker modal on press and closes it on Cancel', () => {
    render(<ClockTimeField value={9 * 60} onChange={vi.fn()} />); // no label -> modal title defaults to "Select time"
    expect(screen.queryByText('Select time')).toBeNull();
    fireEvent.click(screen.getByText('9:00 AM'));
    expect(screen.getByText('Select time')).toBeTruthy();
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Select time')).toBeNull();
  });

  it('confirming the modal calls onChange with the (unedited) value and closes the modal', () => {
    const onChange = vi.fn();
    render(<ClockTimeField label="Wake up" value={9 * 60} onChange={onChange} />);
    fireEvent.click(screen.getByText('9:00 AM'));
    fireEvent.click(screen.getByText('OK'));
    expect(onChange).toHaveBeenCalledWith(9 * 60);
    expect(screen.queryByText('Select time')).toBeNull();
  });

  it('uses the field label as the modal title when no explicit title is given', () => {
    render(<ClockTimeField label="Bedtime" value={9 * 60} onChange={vi.fn()} />);
    fireEvent.click(screen.getByText('9:00 AM'));
    // "Bedtime" now appears twice: once as the field's own label, once as the modal title.
    expect(screen.getAllByText('Bedtime')).toHaveLength(2);
  });

  it('opens the picker from the pill-variant trigger too', () => {
    render(<ClockTimeField value={9 * 60} onChange={vi.fn()} variant="pill" />);
    fireEvent.click(screen.getByText('9:00 AM'));
    expect(screen.getByText('Select time')).toBeTruthy();
  });

  it('shows a pressed visual state on the input-variant trigger while held', async () => {
    vi.useFakeTimers();
    render(<ClockTimeField value={9 * 60} onChange={vi.fn()} />);
    const trigger = screen.getByText('9:00 AM').parentElement as HTMLElement;
    const before = trigger.className;
    fireEvent.mouseDown(trigger, { button: 0, buttons: 1 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60);
    });
    expect(trigger.className).not.toBe(before);
    fireEvent.mouseUp(trigger, { button: 0, buttons: 1 });
    vi.useRealTimers();
  });

  it('shows a pressed visual state on the pill-variant trigger while held', async () => {
    vi.useFakeTimers();
    render(<ClockTimeField value={9 * 60} onChange={vi.fn()} variant="pill" />);
    const trigger = screen.getByText('9:00 AM').parentElement as HTMLElement;
    const before = trigger.className;
    fireEvent.mouseDown(trigger, { button: 0, buttons: 1 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60);
    });
    expect(trigger.className).not.toBe(before);
    fireEvent.mouseUp(trigger, { button: 0, buttons: 1 });
    vi.useRealTimers();
  });
});
