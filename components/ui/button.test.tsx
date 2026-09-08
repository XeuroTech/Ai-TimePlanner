import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/lib/storage', () => ({
  zustandStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
}));

vi.mock('@expo/vector-icons', async () => {
  const { Text } = await import('react-native');
  return { Ionicons: (props: any) => <Text>{`icon:${props.name}`}</Text> };
});

import { Button } from './button';

describe('Button', () => {
  it('renders the title for the primary variant', () => {
    render(<Button title="Save" onPress={() => {}} />);
    expect(screen.getByText('Save')).toBeTruthy();
  });

  it('renders the title for the secondary variant', () => {
    render(<Button title="Save" onPress={() => {}} variant="secondary" />);
    expect(screen.getByText('Save')).toBeTruthy();
  });

  it('renders the title for the ghost variant', () => {
    render(<Button title="Save" onPress={() => {}} variant="ghost" />);
    expect(screen.getByText('Save')).toBeTruthy();
  });

  it('fires onPress when pressed', () => {
    const onPress = vi.fn();
    render(<Button title="Save" onPress={onPress} />);
    fireEvent.click(screen.getByText('Save'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire onPress when disabled', () => {
    const onPress = vi.fn();
    render(<Button title="Save" onPress={onPress} disabled />);
    fireEvent.click(screen.getByText('Save'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('does not fire onPress while loading', () => {
    const onPress = vi.fn();
    const { container } = render(<Button title="Save" onPress={onPress} loading />);
    fireEvent.click(container.firstElementChild as Element);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows an activity indicator and hides the title while loading', () => {
    render(<Button title="Save" onPress={() => {}} loading />);
    expect(screen.queryByText('Save')).toBeNull();
  });

  it('renders an icon when one is provided', () => {
    render(<Button title="Save" onPress={() => {}} icon="add" />);
    expect(screen.getByText('icon:add')).toBeTruthy();
  });

  it('renders no icon when none is provided', () => {
    render(<Button title="Save" onPress={() => {}} />);
    expect(screen.queryByText(/^icon:/)).toBeNull();
  });

  it('applies the pressed style while held down and not disabled', async () => {
    const { container } = render(<Button title="Save" onPress={() => {}} />);
    const pressable = container.firstElementChild as HTMLElement;
    // react-native-web's Pressable drives its `pressed` render-prop state off
    // real "mousedown"/"mouseup" DOM events (its responder system listens for
    // them at the document level). Activation is delayed ~50ms (its default
    // `delayPressStart`), so we wait for it, exercising the
    // `pressed && !isDisabled && styles.pressed` branch in the style
    // callback - not just the always-false default.
    fireEvent.mouseDown(pressable);
    await waitFor(() => {
      expect(getComputedStyle(pressable).opacity).toBe('0.95');
    });
    fireEvent.mouseUp(pressable);
  });

  it('does not apply the pressed style while held down when disabled', async () => {
    const { container } = render(<Button title="Save" onPress={() => {}} disabled />);
    const pressable = container.firstElementChild as HTMLElement;
    fireEvent.mouseDown(pressable);
    // Give the (disabled) responder the same window to have activated in, to
    // prove disabled Pressables genuinely never reach the pressed style
    // rather than the assertion just running before activation would occur.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(getComputedStyle(pressable).opacity).not.toBe('0.95');
    fireEvent.mouseUp(pressable);
  });
});
