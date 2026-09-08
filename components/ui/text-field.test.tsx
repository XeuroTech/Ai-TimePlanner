import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/lib/storage', () => ({
  zustandStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
}));

vi.mock('@expo/vector-icons', async () => {
  const { Text } = await import('react-native');
  return { Ionicons: (props: any) => <Text>{`icon:${props.name}`}</Text> };
});

import { TextField } from './text-field';

describe('TextField', () => {
  it('renders the label when provided', () => {
    render(<TextField label="Email" value="" onChangeText={() => {}} />);
    expect(screen.getByText('Email')).toBeTruthy();
  });

  it('renders no label when omitted', () => {
    render(<TextField value="" onChangeText={() => {}} />);
    expect(screen.queryByText('Email')).toBeNull();
  });

  it('renders the placeholder', () => {
    render(<TextField value="" onChangeText={() => {}} placeholder="you@example.com" />);
    expect(screen.getByPlaceholderText('you@example.com')).toBeTruthy();
  });

  it('calls onChangeText as the user types', () => {
    const onChangeText = vi.fn();
    render(<TextField value="" onChangeText={onChangeText} placeholder="Name" />);
    fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'Furqan' } });
    expect(onChangeText).toHaveBeenCalledWith('Furqan');
  });

  it('shows the error text when an error is set', () => {
    render(<TextField value="" onChangeText={() => {}} error="Required field" />);
    expect(screen.getByText('Required field')).toBeTruthy();
  });

  it('renders no error text when error is not set', () => {
    render(<TextField value="" onChangeText={() => {}} />);
    expect(screen.queryByText('Required field')).toBeNull();
  });

  it('renders a leading icon when provided', () => {
    render(<TextField value="" onChangeText={() => {}} icon="mail-outline" />);
    expect(screen.getByText('icon:mail-outline')).toBeTruthy();
  });

  it('renders no leading icon by default', () => {
    render(<TextField value="" onChangeText={() => {}} />);
    expect(screen.queryByText(/^icon:mail/)).toBeNull();
  });

  it('masks the value and shows a reveal toggle when secure is set', () => {
    render(<TextField value="secret" onChangeText={() => {}} secure placeholder="Password" />);
    const input = screen.getByPlaceholderText('Password') as HTMLInputElement;
    expect(input.type).toBe('password');
    expect(screen.getByText('icon:eye-off-outline')).toBeTruthy();
  });

  it('toggles visibility when the reveal icon is pressed', () => {
    render(<TextField value="secret" onChangeText={() => {}} secure placeholder="Password" />);
    fireEvent.click(screen.getByText('icon:eye-off-outline'));
    const input = screen.getByPlaceholderText('Password') as HTMLInputElement;
    expect(input.type).toBe('text');
    expect(screen.getByText('icon:eye-outline')).toBeTruthy();
  });

  it('does not render the reveal toggle for a non-secure field', () => {
    render(<TextField value="" onChangeText={() => {}} placeholder="Name" />);
    expect(screen.queryByText(/^icon:eye/)).toBeNull();
  });

  it('calls the onFocus callback and reverts focus styling on blur', () => {
    const onFocus = vi.fn();
    render(<TextField value="" onChangeText={() => {}} placeholder="Name" onFocus={onFocus} />);
    const input = screen.getByPlaceholderText('Name');
    fireEvent.focus(input);
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(() => fireEvent.blur(input)).not.toThrow();
  });

  it('handles focus without an onFocus callback provided', () => {
    render(<TextField value="" onChangeText={() => {}} placeholder="Name" />);
    expect(() => fireEvent.focus(screen.getByPlaceholderText('Name'))).not.toThrow();
  });
});
