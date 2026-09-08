import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ scheme: 'light' as 'light' | 'dark' | null }));
vi.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => mocks.scheme }));

import { ThemedView } from './themed-view';

describe('ThemedView', () => {
  it('renders its children with the light theme background color by default', () => {
    mocks.scheme = 'light';
    const { container } = render(
      <ThemedView testID="view">
        <></>
      </ThemedView>
    );
    const node = container.firstElementChild as HTMLElement;
    expect(getComputedStyle(node).backgroundColor).toBe('rgb(255, 255, 255)'); // #fff
  });

  it('renders with the dark theme background color when the scheme is dark', () => {
    mocks.scheme = 'dark';
    const { container } = render(<ThemedView />);
    const node = container.firstElementChild as HTMLElement;
    expect(getComputedStyle(node).backgroundColor).toBe('rgb(21, 23, 24)'); // #151718
  });

  it('uses the lightColor override when provided and theme is light', () => {
    mocks.scheme = 'light';
    const { container } = render(<ThemedView lightColor="#ff0000" />);
    const node = container.firstElementChild as HTMLElement;
    expect(getComputedStyle(node).backgroundColor).toBe('rgb(255, 0, 0)');
  });

  it('uses the darkColor override when provided and theme is dark', () => {
    mocks.scheme = 'dark';
    const { container } = render(<ThemedView darkColor="#00ff00" />);
    const node = container.firstElementChild as HTMLElement;
    expect(getComputedStyle(node).backgroundColor).toBe('rgb(0, 255, 0)');
  });

  it('ignores a lightColor override while in dark mode and falls back to the dark default', () => {
    mocks.scheme = 'dark';
    const { container } = render(<ThemedView lightColor="#ff0000" />);
    const node = container.firstElementChild as HTMLElement;
    expect(getComputedStyle(node).backgroundColor).toBe('rgb(21, 23, 24)'); // #151718
  });

  it('merges a custom style prop and forwards other view props', () => {
    mocks.scheme = 'light';
    const { container } = render(<ThemedView style={{ padding: 12 }} testID="my-view" />);
    const node = container.firstElementChild as HTMLElement;
    expect(getComputedStyle(node).padding).toBe('12px');
    expect(node.getAttribute('data-testid')).toBe('my-view');
  });
});
