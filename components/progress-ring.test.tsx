import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Text } from 'react-native';
import { vi } from 'vitest';

vi.mock('@/lib/storage', () => ({
  zustandStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
}));

import { ProgressRing } from './progress-ring';

// Each rendered slice is 3 nested `View`s (rotate wrapper > clip wrapper > fill),
// react-native-web maps each `View` to exactly one <div>, and the component
// always renders one outer wrap `View` plus one hole `View`. Counting divs is
// therefore a faithful, non-pixel proxy for how many arc slices were built —
// which is what actually encodes the clamping/splitting logic under test.
function divCount(container: HTMLElement) {
  return container.querySelectorAll('div').length;
}

describe('ProgressRing', () => {
  it('renders without throwing for a 0 progress value', () => {
    const { container } = render(<ProgressRing size={80} thickness={8} progress={0} />);
    expect(divCount(container)).toBe(8); // 1 wrap + 2 slices * 3 + 1 hole
  });

  it('renders without throwing for a 1 progress value', () => {
    const { container } = render(<ProgressRing size={80} thickness={8} progress={1} />);
    expect(divCount(container)).toBe(8); // 1 wrap + 2 slices * 3 + 1 hole
  });

  it('renders a mid-range progress value with an extra split slice', () => {
    const { container } = render(<ProgressRing size={80} thickness={8} progress={0.25} />);
    expect(divCount(container)).toBe(11); // 1 wrap + 3 slices * 3 + 1 hole
  });

  it('renders progress=0.5 identically in slice count to progress=0/1', () => {
    const { container } = render(<ProgressRing size={80} thickness={8} progress={0.5} />);
    expect(divCount(container)).toBe(8);
  });

  it('clamps a negative progress value down to 0', () => {
    const { container } = render(<ProgressRing size={80} thickness={8} progress={-0.5} />);
    expect(divCount(container)).toBe(8);
  });

  it('clamps a progress value above 1 down to 1', () => {
    const { container } = render(<ProgressRing size={80} thickness={8} progress={1.5} />);
    expect(divCount(container)).toBe(8);
  });

  it('renders children inside the hole', () => {
    render(
      <ProgressRing size={80} thickness={8} progress={0.5}>
        <Text>75%</Text>
      </ProgressRing>,
    );
    expect(screen.getByText('75%')).toBeTruthy();
  });

  it('falls back to a total of 1 (and renders no slices) when progress is NaN', () => {
    // Math.max(0, Math.min(1, NaN)) is NaN, so both segment values fed into
    // buildSlices are NaN, making their sum NaN too. `total` then hits the
    // `|| 1` fallback (NaN is falsy) instead of dividing by NaN. With total
    // forced to 1, each segment's sweep is still NaN, so the while loop's
    // `remaining > 0.001` check is false immediately and no slice chunks are
    // pushed for either segment - only the outer wrap and hole Views remain.
    const { container } = render(<ProgressRing size={80} thickness={8} progress={NaN} />);
    expect(divCount(container)).toBe(2); // 1 wrap + 0 slices + 1 hole
  });

  it('accepts custom color, trackColor and holeColor without throwing', () => {
    const { container } = render(
      <ProgressRing size={80} thickness={8} progress={0.5} color="#123456" trackColor="#654321" holeColor="#ABCDEF" />,
    );
    expect(divCount(container)).toBe(8);
  });
});
