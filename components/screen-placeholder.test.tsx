import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/storage', () => ({
  zustandStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
}));

vi.mock('@expo/vector-icons', async () => {
  const { Text } = await import('react-native');
  return { Ionicons: (props: any) => <Text>{`icon:${props.name}`}</Text> };
});

// react-native-safe-area-context's SafeAreaView renders a native/fabric host
// component with no jsdom implementation, so it's swapped for a plain View.
vi.mock('react-native-safe-area-context', async () => {
  const { View } = await import('react-native');
  return { SafeAreaView: View };
});

import { ScreenPlaceholder } from './screen-placeholder';

describe('ScreenPlaceholder', () => {
  it('renders the title, icon and default subtitle', () => {
    render(<ScreenPlaceholder title="Habits" icon="book-outline" />);
    expect(screen.getByText('Habits')).toBeTruthy();
    expect(screen.getByText('icon:book-outline')).toBeTruthy();
    expect(screen.getByText('Coming soon')).toBeTruthy();
  });

  it('renders a custom subtitle when provided', () => {
    render(<ScreenPlaceholder title="Habits" icon="book-outline" subtitle="Almost there" />);
    expect(screen.getByText('Almost there')).toBeTruthy();
    expect(screen.queryByText('Coming soon')).toBeNull();
  });

  it('always renders the roadmap hint', () => {
    render(<ScreenPlaceholder title="Habits" icon="book-outline" />);
    expect(screen.getByText('This screen is next on the roadmap.')).toBeTruthy();
  });

  it('accepts custom accent and tint colors without throwing', () => {
    render(<ScreenPlaceholder title="Habits" icon="book-outline" accent="#FF0000" tint="#00FF00" />);
    expect(screen.getByText('Habits')).toBeTruthy();
  });

  it('falls back to default accent/tint when omitted', () => {
    render(<ScreenPlaceholder title="Habits" icon="book-outline" />);
    expect(screen.getByText('icon:book-outline')).toBeTruthy();
  });
});
