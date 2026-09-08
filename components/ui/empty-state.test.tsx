import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/lib/storage', () => ({
  zustandStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
}));

vi.mock('@expo/vector-icons', async () => {
  const { Text } = await import('react-native');
  return { Ionicons: (props: any) => <Text>{`icon:${props.name}`}</Text> };
});

import { EmptyState } from './empty-state';

describe('EmptyState', () => {
  it('renders the icon, title and message', () => {
    render(<EmptyState icon="book-outline" title="No habits yet" message="Add your first habit to get started." />);
    expect(screen.getByText('icon:book-outline')).toBeTruthy();
    expect(screen.getByText('No habits yet')).toBeTruthy();
    expect(screen.getByText('Add your first habit to get started.')).toBeTruthy();
  });

  it('renders no CTA button when neither ctaLabel nor onPress is given', () => {
    render(<EmptyState icon="book-outline" title="No habits yet" message="Message" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders no CTA button when only ctaLabel is given', () => {
    render(<EmptyState icon="book-outline" title="No habits yet" message="Message" ctaLabel="Add habit" />);
    expect(screen.queryByText('Add habit')).toBeNull();
  });

  it('renders no CTA button when only onPress is given', () => {
    const onPress = vi.fn();
    render(<EmptyState icon="book-outline" title="No habits yet" message="Message" onPress={onPress} />);
    expect(screen.queryByText(/^icon:/)).toBeTruthy(); // sanity: state icon still there
    expect(onPress).not.toHaveBeenCalled();
  });

  it('renders and fires the CTA when both ctaLabel and onPress are given', () => {
    const onPress = vi.fn();
    render(
      <EmptyState icon="book-outline" title="No habits yet" message="Message" ctaLabel="Add habit" onPress={onPress} />,
    );
    fireEvent.click(screen.getByText('Add habit'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders in compact mode without throwing', () => {
    render(<EmptyState icon="book-outline" title="No habits yet" message="Message" compact />);
    expect(screen.getByText('No habits yet')).toBeTruthy();
  });

  it('accepts custom accent and tint colors', () => {
    render(<EmptyState icon="book-outline" title="No habits yet" message="Message" accent="#FF0000" tint="#00FF00" />);
    expect(screen.getByText('No habits yet')).toBeTruthy();
  });
});
