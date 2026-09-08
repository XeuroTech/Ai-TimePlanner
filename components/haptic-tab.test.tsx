import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ impactAsync: vi.fn() }));

vi.mock('expo-haptics', () => ({
  impactAsync: mocks.impactAsync,
  ImpactFeedbackStyle: { Light: 'Light' },
}));

// @react-navigation/elements' real PlatformPressable pulls in native-only
// navigation theming; HapticTab only needs a pressable that forwards
// onPressIn, so a plain button stand-in is enough.
vi.mock('@react-navigation/elements', () => ({
  PlatformPressable: ({ onPressIn, children, ...rest }: any) => (
    <button onMouseDown={onPressIn} {...rest}>
      {children}
    </button>
  ),
}));

import { HapticTab } from './haptic-tab';

afterEach(() => {
  mocks.impactAsync.mockClear();
  delete (process.env as any).EXPO_OS;
});

describe('HapticTab', () => {
  it('fires a light impact haptic on press-in when running on iOS', () => {
    process.env.EXPO_OS = 'ios';
    render(<HapticTab accessibilityRole="button">Tab</HapticTab> as any);
    fireEvent.mouseDown(screen.getByText('Tab'));
    expect(mocks.impactAsync).toHaveBeenCalledWith('Light');
  });

  it('does not fire haptics on press-in on non-iOS platforms', () => {
    process.env.EXPO_OS = 'android';
    render(<HapticTab accessibilityRole="button">Tab</HapticTab> as any);
    fireEvent.mouseDown(screen.getByText('Tab'));
    expect(mocks.impactAsync).not.toHaveBeenCalled();
  });

  it('still calls a caller-supplied onPressIn regardless of platform', () => {
    process.env.EXPO_OS = 'android';
    const onPressIn = vi.fn();
    render(<HapticTab accessibilityRole="button" onPressIn={onPressIn}>Tab</HapticTab> as any);
    fireEvent.mouseDown(screen.getByText('Tab'));
    expect(onPressIn).toHaveBeenCalledTimes(1);
  });
});
