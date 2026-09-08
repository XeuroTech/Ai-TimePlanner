import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Text, View } from 'react-native';

const mocks = vi.hoisted(() => ({ scheme: 'light' as 'light' | 'dark' }));
vi.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => mocks.scheme }));

// react-native-reanimated needs a real native runtime to drive its worklets;
// under jsdom it's stubbed down to plain pass-through values so the component
// still renders its header/content instead of throwing on import or on the
// missing native side.
vi.mock('react-native-reanimated', async () => {
  const RN = await import('react-native');
  return {
    __esModule: true,
    default: { ScrollView: RN.ScrollView, View: RN.View },
    useAnimatedRef: () => ({ current: null }),
    // Invoke the worklet factory synchronously (as the real hook would on the
    // native/UI thread) so the component's `useAnimatedStyle(() => {...})`
    // callback body is actually exercised by these tests, not just declared.
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useScrollOffset: () => ({ value: 0 }),
    interpolate: (_value: number, _input: number[], output: number[]) => output[0],
  };
});

import ParallaxScrollView from './parallax-scroll-view';

describe('ParallaxScrollView', () => {
  beforeEach(() => {
    mocks.scheme = 'light';
  });

  it('renders the header image and children content', () => {
    render(
      <ParallaxScrollView
        headerImage={<Text>Header art</Text>}
        headerBackgroundColor={{ light: 'rgb(1, 2, 3)', dark: 'rgb(4, 5, 6)' }}>
        <Text>Body content</Text>
      </ParallaxScrollView>,
    );
    expect(screen.getByText('Header art')).toBeTruthy();
    expect(screen.getByText('Body content')).toBeTruthy();
  });

  it('uses the light header background color for a light color scheme', () => {
    mocks.scheme = 'light';
    render(
      <ParallaxScrollView
        headerImage={<View testID="header-image" />}
        headerBackgroundColor={{ light: 'rgb(1, 2, 3)', dark: 'rgb(4, 5, 6)' }}>
        <Text>Body</Text>
      </ParallaxScrollView>,
    );
    const header = screen.getByTestId('header-image').parentElement as HTMLElement;
    expect(getComputedStyle(header).backgroundColor).toBe('rgb(1, 2, 3)');
  });

  it('uses the dark header background color for a dark color scheme', () => {
    mocks.scheme = 'dark';
    render(
      <ParallaxScrollView
        headerImage={<View testID="header-image" />}
        headerBackgroundColor={{ light: 'rgb(1, 2, 3)', dark: 'rgb(4, 5, 6)' }}>
        <Text>Body</Text>
      </ParallaxScrollView>,
    );
    const header = screen.getByTestId('header-image').parentElement as HTMLElement;
    expect(getComputedStyle(header).backgroundColor).toBe('rgb(4, 5, 6)');
  });

  it('falls back to the light color scheme when none is reported', () => {
    mocks.scheme = null as unknown as 'light';
    render(
      <ParallaxScrollView
        headerImage={<View testID="header-image" />}
        headerBackgroundColor={{ light: 'rgb(1, 2, 3)', dark: 'rgb(4, 5, 6)' }}>
        <Text>Body</Text>
      </ParallaxScrollView>,
    );
    const header = screen.getByTestId('header-image').parentElement as HTMLElement;
    expect(getComputedStyle(header).backgroundColor).toBe('rgb(1, 2, 3)');
  });
});
