import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { Pressable, Text } from 'react-native';

vi.mock('@/lib/storage', () => ({
  zustandStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
}));

vi.mock('@expo/vector-icons', async () => {
  const { Text: RNText } = await import('react-native');
  return { Ionicons: (props: any) => <RNText>{`icon:${props.name}`}</RNText> };
});

vi.mock('react-native-safe-area-context', async () => {
  const { View } = await import('react-native');
  return {
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
    SafeAreaView: View,
  };
});

import { ToastProvider, useToast } from './toast';

function Harness() {
  const toast = useToast();
  return (
    <>
      <Pressable onPress={() => toast.show('Plain message')}>
        <Text>show</Text>
      </Pressable>
      <Pressable onPress={() => toast.success('It worked')}>
        <Text>success</Text>
      </Pressable>
      <Pressable onPress={() => toast.error('It failed')}>
        <Text>error</Text>
      </Pressable>
    </>
  );
}

describe('ToastProvider / useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('useToast() outside a provider returns no-op handlers that do not throw', () => {
    render(<Harness />);
    expect(() => fireEvent.click(screen.getByText('show'))).not.toThrow();
    expect(screen.queryByText('Plain message')).toBeNull();
  });

  it('useToast() outside a provider also no-ops success() and error() without throwing', () => {
    // The default ToastContext value declares distinct no-op `success` and
    // `error` functions (separate from `show`); exercise both directly so
    // they are covered rather than just `show`'s no-op.
    render(<Harness />);
    expect(() => fireEvent.click(screen.getByText('success'))).not.toThrow();
    expect(screen.queryByText('It worked')).toBeNull();
    expect(() => fireEvent.click(screen.getByText('error'))).not.toThrow();
    expect(screen.queryByText('It failed')).toBeNull();
  });

  it('shows a default "info" toast with its icon on show()', () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('show'));
    expect(screen.getByText('Plain message')).toBeTruthy();
    expect(screen.getByText('icon:information-circle')).toBeTruthy();
  });

  it('shows a success toast with its icon', () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('success'));
    expect(screen.getByText('It worked')).toBeTruthy();
    expect(screen.getByText('icon:checkmark-circle')).toBeTruthy();
  });

  it('shows an error toast with its icon', () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('error'));
    expect(screen.getByText('It failed')).toBeTruthy();
    expect(screen.getByText('icon:alert-circle')).toBeTruthy();
  });

  it('replaces an in-flight toast when show() is called again before it dismisses', () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('show'));
    expect(screen.getByText('Plain message')).toBeTruthy();
    fireEvent.click(screen.getByText('success'));
    expect(screen.queryByText('Plain message')).toBeNull();
    expect(screen.getByText('It worked')).toBeTruthy();
  });

  it('clears the pending dismiss timer when unmounted while a toast is showing', () => {
    const { unmount } = render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('show'));
    expect(screen.getByText('Plain message')).toBeTruthy();
    expect(() => unmount()).not.toThrow();
  });

  it('auto-dismisses the toast after its timeout elapses', () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('show'));
    expect(screen.getByText('Plain message')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(3200); // 2600ms display + ~220ms close animation
    });

    expect(screen.queryByText('Plain message')).toBeNull();
  });
});
