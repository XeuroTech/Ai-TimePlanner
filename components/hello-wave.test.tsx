import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Text } from 'react-native';

// react-native-reanimated pulls in react-native-worklets' native turbo module
// at import time, which doesn't exist under jsdom. HelloWave only needs
// Animated.Text to render its children with a style, so a thin RN Text
// stand-in is enough — no animation behavior is under test here.
vi.mock('react-native-reanimated', () => ({
  default: { Text },
}));

import { HelloWave } from './hello-wave';

describe('HelloWave', () => {
  it('renders the waving hand emoji', () => {
    render(<HelloWave />);
    expect(screen.getByText('👋')).toBeTruthy();
  });
});
