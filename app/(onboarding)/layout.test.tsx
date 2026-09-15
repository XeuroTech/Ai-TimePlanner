import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  theme: { Palette: { bg: '#F6F5FF' }, isDark: false, Tint: {}, setDarkMode: vi.fn() },
}));

vi.mock('expo-router', () => ({
  Stack: (props: any) => <div data-testid="stack" data-options={JSON.stringify(props.screenOptions)} />,
}));
vi.mock('@/hooks/use-app-theme', () => ({ useAppTheme: () => mocks.theme }));

import OnboardingLayout from './_layout';

describe('OnboardingLayout', () => {
  it('renders a Stack with headerShown false, slide_from_right animation and the palette background', () => {
    render(<OnboardingLayout />);
    const stack = screen.getByTestId('stack');
    const options = JSON.parse(stack.getAttribute('data-options') ?? '{}');
    expect(options.headerShown).toBe(false);
    expect(options.animation).toBe('slide_from_right');
    expect(options.contentStyle).toEqual({ backgroundColor: '#F6F5FF' });
  });

  it('re-derives the background color from the current palette', () => {
    mocks.theme.Palette = { bg: '#000000' } as any;
    render(<OnboardingLayout />);
    const stack = screen.getByTestId('stack');
    const options = JSON.parse(stack.getAttribute('data-options') ?? '{}');
    expect(options.contentStyle).toEqual({ backgroundColor: '#000000' });
    mocks.theme.Palette = { bg: '#F6F5FF' } as any;
  });
});
