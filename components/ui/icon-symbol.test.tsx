import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

// The real @expo/vector-icons/MaterialIcons pulls in raw react-native-vector-icons
// source with JSX the bundler chokes on under this test setup, and it's a real
// native font-icon component anyway — stand in a minimal element that forwards
// the props IconSymbol cares about (name/color/size/style) so they're inspectable.
vi.mock('@expo/vector-icons/MaterialIcons', () => ({
  default: ({ name, color, size, style }: any) => (
    <span aria-hidden data-icon-name={name} style={{ color, fontSize: size, ...style }} />
  ),
}));

import { IconSymbol } from './icon-symbol';

describe('IconSymbol (MaterialIcons fallback)', () => {
  it('renders without throwing for a mapped SF Symbol name', () => {
    const { container } = render(<IconSymbol name="house.fill" color="#000" />);
    expect(container.firstChild).toBeTruthy();
  });

  it('defaults to size 24 when no size prop is given', () => {
    const { container } = render(<IconSymbol name="house.fill" color="#000" />);
    const node = container.querySelector('[aria-hidden]') ?? (container.firstChild as HTMLElement);
    expect(getComputedStyle(node as Element).fontSize).toBe('24px');
  });

  it('reflects a custom size prop', () => {
    const { container } = render(<IconSymbol name="paperplane.fill" color="#000" size={40} />);
    const node = container.querySelector('[aria-hidden]') ?? (container.firstChild as HTMLElement);
    expect(getComputedStyle(node as Element).fontSize).toBe('40px');
  });

  it('reflects the color prop', () => {
    const { container } = render(<IconSymbol name="chevron.right" color="#ff0000" />);
    const node = container.querySelector('[aria-hidden]') ?? (container.firstChild as HTMLElement);
    expect(getComputedStyle(node as Element).color).toBe('rgb(255, 0, 0)');
  });

  it.each([
    ['house.fill', 'home'],
    ['paperplane.fill', 'send'],
    ['chevron.left.forwardslash.chevron.right', 'code'],
    ['chevron.right', 'chevron-right'],
  ] as const)('maps SF Symbol name %s to the Material Icons name %s', (name, materialName) => {
    const { container } = render(<IconSymbol name={name} color="#000" />);
    const node = container.querySelector('[data-icon-name]');
    expect(node?.getAttribute('data-icon-name')).toBe(materialName);
  });

  it('applies a custom style prop', () => {
    const { container } = render(
      <IconSymbol name="house.fill" color="#000" style={{ marginTop: 5 }} />
    );
    const node = container.querySelector('[aria-hidden]') ?? (container.firstChild as HTMLElement);
    expect(getComputedStyle(node as Element).marginTop).toBe('5px');
  });
});
