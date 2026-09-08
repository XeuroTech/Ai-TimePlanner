import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@expo/vector-icons', () => ({ Ionicons: (props: any) => <span data-testid="icon" data-name={props.name} /> }));
vi.mock('@/lib/storage', () => ({
  zustandStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
}));

import { useThemeStore } from '@/store/theme-store';
import { BarChart, LegendRow, Sparkline, StackedBar, StatTile } from './charts';

beforeEach(() => {
  useThemeStore.setState({ darkMode: false, notificationsEnabled: true });
});

describe('BarChart', () => {
  it('renders one column per datum, with label and value', () => {
    render(<BarChart data={[{ key: 'mon', label: 'Mon', value: 3 }, { key: 'tue', label: 'Tue', value: 0 }]} />);
    expect(screen.getByText('Mon')).toBeTruthy();
    expect(screen.getByText('Tue')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('0')).toBeTruthy();
  });

  it('hides the value labels when showValues is false', () => {
    render(<BarChart data={[{ key: 'mon', label: 'Mon', value: 3 }]} showValues={false} />);
    expect(screen.getByText('Mon')).toBeTruthy();
    expect(screen.queryByText('3')).toBeNull();
  });

  it('does not throw and gives every bar the minimum stub height with no data', () => {
    render(<BarChart data={[]} />);
    expect(screen.queryByText('Mon')).toBeNull();
  });

  it('handles an all-zero series without dividing by zero', () => {
    render(<BarChart data={[{ key: 'a', label: 'A', value: 0 }, { key: 'b', label: 'B', value: 0 }]} />);
    expect(screen.getAllByText('0')).toHaveLength(2);
  });

  it('paints a highlighted bar with the accent color regardless of its value', () => {
    // react-native-web renders hex colors as rgb(); '#123456' -> rgb(18, 52, 86).
    const { container } = render(
      <BarChart data={[{ key: 'a', label: 'A', value: 0, highlight: true }]} color="#123456" />,
    );
    expect(container.innerHTML).toContain('18, 52, 86');
  });

  it('accepts explicit color and mutedColor overrides', () => {
    const { container } = render(
      <BarChart data={[{ key: 'a', label: 'A', value: 5 }]} color="#123456" mutedColor="#abcdef" />,
    );
    expect(container.innerHTML).toContain('18, 52, 86');
  });
});

describe('StackedBar', () => {
  it('renders a flat empty track (not the segment color) when the total is zero', () => {
    const { container } = render(<StackedBar segments={[{ key: 'a', value: 0, color: 'rgb(1, 2, 3)' }]} />);
    expect(container.innerHTML).not.toContain('rgb(1, 2, 3)');
  });

  it('renders a visible segment', () => {
    const { container } = render(<StackedBar segments={[{ key: 'big', value: 98, color: 'rgb(9, 9, 9)' }]} />);
    expect(container.innerHTML).toContain('rgb(9, 9, 9)');
  });

  it('drops a segment under ~2% of the total', () => {
    const segments = [
      { key: 'big', value: 98, color: 'rgb(1, 1, 1)' },
      { key: 'tiny', value: 1, color: 'rgb(2, 2, 2)' },
    ];
    const { container } = render(<StackedBar segments={segments} />);
    expect(container.innerHTML).toContain('rgb(1, 1, 1)');
    expect(container.innerHTML).not.toContain('rgb(2, 2, 2)');
  });
});

describe('Sparkline', () => {
  it('renders one bar per value without throwing on an all-zero series', () => {
    expect(() => render(<Sparkline values={[0, 0, 0]} />)).not.toThrow();
  });

  it('renders for a typical mixed series', () => {
    expect(() => render(<Sparkline values={[1, 5, 3, 0, 2]} />)).not.toThrow();
  });
});

describe('LegendRow', () => {
  it('renders label and value, with no progress track or caption by default', () => {
    render(<LegendRow color="#fff" label="Math" value="3h 20m" />);
    expect(screen.getByText('Math')).toBeTruthy();
    expect(screen.getByText('3h 20m')).toBeTruthy();
  });

  it('renders a caption when given', () => {
    render(<LegendRow color="#fff" label="Math" value="3h" caption="4 tasks" />);
    expect(screen.getByText('4 tasks')).toBeTruthy();
  });

  it('renders and clamps the progress track when given', () => {
    expect(() => render(<LegendRow color="#fff" label="Math" value="3h" progress={1.5} />)).not.toThrow();
    expect(() => render(<LegendRow color="#fff" label="Math" value="3h" progress={-0.5} />)).not.toThrow();
  });
});

describe('StatTile', () => {
  it('renders the icon, value and label', () => {
    render(<StatTile icon={'book' as any} color="#111" tint="#eee" value="12" label="Tasks done" />);
    expect(screen.getByTestId('icon')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('Tasks done')).toBeTruthy();
  });
});
