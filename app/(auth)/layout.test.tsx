import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  stackProps: [] as any[],
}));

vi.mock('expo-router', () => ({
  Stack: (props: any) => {
    mocks.stackProps.push(props);
    return null;
  },
}));

vi.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: () => ({ Palette: { bg: '#F6F5FF' }, Tint: {}, isDark: false, setDarkMode: vi.fn() }),
}));

import AuthLayout from './_layout';

describe('AuthLayout', () => {
  it('renders a Stack with headers hidden and a slide-from-right animation, without throwing', () => {
    expect(() => render(<AuthLayout />)).not.toThrow();
    const props = mocks.stackProps.at(-1);
    expect(props.screenOptions.headerShown).toBe(false);
    expect(props.screenOptions.animation).toBe('slide_from_right');
  });

  it('tints the screen background from the current palette', () => {
    render(<AuthLayout />);
    const props = mocks.stackProps.at(-1);
    expect(props.screenOptions.contentStyle).toEqual({ backgroundColor: '#F6F5FF' });
  });
});
