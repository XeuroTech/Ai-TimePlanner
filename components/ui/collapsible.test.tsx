import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ scheme: 'light' as 'light' | 'dark' | null }));
vi.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => mocks.scheme }));

// Collapsible renders an IconSymbol('chevron.right'), which is only mapped in
// the MaterialIcons fallback set and pulls in @expo/vector-icons' real font
// component (unparseable JSX under this test setup) — stand in a minimal
// element that exposes the rotation style Collapsible drives.
vi.mock('@expo/vector-icons/MaterialIcons', () => ({
  default: ({ color, size, style }: any) => {
    // RN's `transform` is an array of single-key objects (e.g.
    // [{ rotate: '90deg' }]); convert to the CSS string form a DOM style
    // object expects, the way react-native-web's real style flattening would.
    const transform = Array.isArray(style?.transform)
      ? style.transform.map((t: Record<string, string>) => `${Object.keys(t)[0]}(${Object.values(t)[0]})`).join(' ')
      : undefined;
    return (
      <span
        aria-hidden
        data-icon
        style={{ color, fontSize: size, ...style, ...(transform ? { transform } : {}) }}
      />
    );
  },
}));

import { Collapsible } from './collapsible';

describe('Collapsible', () => {
  it('renders the title and starts collapsed (children not rendered)', () => {
    render(
      <Collapsible title="Section title">
        <>Hidden content</>
      </Collapsible>
    );
    expect(screen.getByText('Section title')).toBeTruthy();
    expect(screen.queryByText('Hidden content')).toBeNull();
  });

  it('reveals the children after pressing the heading', () => {
    render(
      <Collapsible title="Section title">
        <>Revealed content</>
      </Collapsible>
    );
    fireEvent.click(screen.getByText('Section title'));
    expect(screen.getByText('Revealed content')).toBeTruthy();
  });

  it('hides the children again after a second press', () => {
    render(
      <Collapsible title="Section title">
        <>Toggled content</>
      </Collapsible>
    );
    const heading = screen.getByText('Section title');
    fireEvent.click(heading);
    expect(screen.getByText('Toggled content')).toBeTruthy();
    fireEvent.click(heading);
    expect(screen.queryByText('Toggled content')).toBeNull();
  });

  it('rotates the chevron icon from 0deg to 90deg when opened', () => {
    const { container } = render(
      <Collapsible title="Section title">
        <>Content</>
      </Collapsible>
    );
    expect(getComputedStyle(container.querySelector('[data-icon]')!).transform).toBe('rotate(0deg)');
    fireEvent.click(screen.getByText('Section title'));
    expect(getComputedStyle(container.querySelector('[data-icon]')!).transform).toBe('rotate(90deg)');
  });

  it('uses the light icon color when the color scheme is light', () => {
    mocks.scheme = 'light';
    const { container } = render(
      <Collapsible title="Section title">
        <>Content</>
      </Collapsible>
    );
    const icon = container.querySelector('[data-icon]') as HTMLElement;
    expect(getComputedStyle(icon).color).toBe('rgb(104, 112, 118)'); // Colors.light.icon #687076
  });

  it('uses the dark icon color when the color scheme is dark', () => {
    mocks.scheme = 'dark';
    const { container } = render(
      <Collapsible title="Section title">
        <>Content</>
      </Collapsible>
    );
    const icon = container.querySelector('[data-icon]') as HTMLElement;
    expect(getComputedStyle(icon).color).toBe('rgb(155, 161, 166)'); // Colors.dark.icon #9BA1A6
  });

  it('falls back to the light icon color when the color scheme is null', () => {
    mocks.scheme = null;
    const { container } = render(
      <Collapsible title="Section title">
        <>Content</>
      </Collapsible>
    );
    const icon = container.querySelector('[data-icon]') as HTMLElement;
    expect(getComputedStyle(icon).color).toBe('rgb(104, 112, 118)'); // Colors.light.icon
  });
});
