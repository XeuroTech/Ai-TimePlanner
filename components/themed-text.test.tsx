import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ scheme: 'light' as 'light' | 'dark' | null }));
vi.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => mocks.scheme }));

import { ThemedText } from './themed-text';

describe('ThemedText', () => {
  it('renders its children with the default type and theme color', () => {
    mocks.scheme = 'light';
    render(<ThemedText>Hello</ThemedText>);
    const node = screen.getByText('Hello');
    expect(node).toBeTruthy();
    expect(node.style.color).toBe('rgb(17, 24, 28)'); // #11181C
  });

  it.each([
    ['default', 16],
    ['title', 32],
    ['defaultSemiBold', 16],
    ['subtitle', 20],
    ['link', 16],
  ] as const)('renders the %s type with its expected font size', (type, fontSize) => {
    render(<ThemedText type={type}>Text</ThemedText>);
    const node = screen.getByText('Text');
    expect(getComputedStyle(node).fontSize).toBe(`${fontSize}px`);
  });

  it('applies the link color for the link type, overriding the theme color', () => {
    render(<ThemedText type="link">Link text</ThemedText>);
    const node = screen.getByText('Link text');
    // The type-specific style (styles.link, with its own color) is placed
    // after the {color} theme override in the style array, so it wins.
    expect(getComputedStyle(node).color).toBe('rgb(10, 126, 164)'); // #0a7ea4
  });

  it('uses the light color override when provided and theme is light', () => {
    mocks.scheme = 'light';
    render(<ThemedText lightColor="#ff0000">Colored</ThemedText>);
    expect(screen.getByText('Colored').style.color).toBe('rgb(255, 0, 0)');
  });

  it('uses the dark color override when provided and theme is dark', () => {
    mocks.scheme = 'dark';
    render(<ThemedText darkColor="#00ff00">Colored</ThemedText>);
    expect(screen.getByText('Colored').style.color).toBe('rgb(0, 255, 0)');
  });

  it('falls back to the theme default text color when no override is given', () => {
    mocks.scheme = 'dark';
    render(<ThemedText>Default dark</ThemedText>);
    expect(screen.getByText('Default dark').style.color).toBe('rgb(236, 237, 238)'); // #ECEDEE
  });

  it('merges a custom style prop on top of the type styles', () => {
    render(<ThemedText style={{ marginTop: 10 }}>Styled</ThemedText>);
    const node = screen.getByText('Styled');
    expect(node.style.marginTop).toBe('10px');
  });
});
