import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

// expo-symbols' real SymbolView only renders a native view when Platform.OS
// is 'ios' (it renders its `fallback` prop otherwise), and under jsdom
// react-native-web reports Platform.OS as 'web' — so nothing would ever be
// on screen to assert against. Stand in a minimal element that forwards the
// props IconSymbol passes through, so they're inspectable.
vi.mock('expo-symbols', () => ({
  SymbolView: ({ name, tintColor, weight, style }: any) => (
    <span
      aria-hidden
      data-symbol-name={name}
      data-weight={weight}
      style={{ color: tintColor, ...(Array.isArray(style) ? Object.assign({}, ...style) : style) }}
    />
  ),
}));

// This file is only ever bundled for iOS (the .ios.tsx platform extension), so
// it's imported directly by relative path rather than through the bare
// '@/components/ui/icon-symbol' specifier, which this test setup always
// resolves to the plain icon-symbol.tsx fallback.
import { IconSymbol } from './icon-symbol.ios';

describe('IconSymbol (iOS SymbolView)', () => {
  it('renders the symbol view for a given name', () => {
    const { container } = render(<IconSymbol name="house.fill" color="#000" />);
    const node = container.querySelector('[data-symbol-name]');
    expect(node?.getAttribute('data-symbol-name')).toBe('house.fill');
  });

  it('defaults size to 24 and weight to regular', () => {
    const { container } = render(<IconSymbol name="house.fill" color="#000" />);
    const node = container.querySelector('[data-symbol-name]') as HTMLElement;
    expect(node.getAttribute('data-weight')).toBe('regular');
    expect(getComputedStyle(node).width).toBe('24px');
    expect(getComputedStyle(node).height).toBe('24px');
  });

  it('reflects a custom size, color and weight', () => {
    const { container } = render(
      <IconSymbol name="paperplane.fill" color="#ff0000" size={40} weight="bold" />
    );
    const node = container.querySelector('[data-symbol-name]') as HTMLElement;
    expect(node.getAttribute('data-weight')).toBe('bold');
    expect(getComputedStyle(node).width).toBe('40px');
    expect(getComputedStyle(node).height).toBe('40px');
    expect(getComputedStyle(node).color).toBe('rgb(255, 0, 0)');
  });

  it('merges a custom style prop on top of the size style', () => {
    const { container } = render(
      <IconSymbol name="house.fill" color="#000" style={{ marginTop: 5 }} />
    );
    const node = container.querySelector('[data-symbol-name]') as HTMLElement;
    expect(getComputedStyle(node).marginTop).toBe('5px');
  });
});
