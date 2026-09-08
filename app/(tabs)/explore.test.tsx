import Module from 'node:module';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

/*
 * `explore.tsx` loads its sample image via a literal `require('@/assets/…')`
 * call, evaluated eagerly as part of building the element tree (not lazily,
 * inside the collapsed section). Vitest's `vi.mock` only intercepts the
 * statically-analyzed ESM import graph — a runtime `require()` call falls
 * through to Node's real `Module._resolveFilename`, which has no idea what
 * the `@` alias means and throws "Cannot find module". There's no
 * `vitest.config.ts` asset transform to lean on (out of scope to add one
 * here), so the two Node module-loader hooks it actually goes through are
 * patched directly, for the duration of this file only.
 */
const ASSET_SPECIFIER = '@/assets/images/react-logo.png';
let restore: () => void;

beforeAll(() => {
  const anyModule = Module as any;
  const originalResolveFilename = anyModule._resolveFilename;
  const originalPngExtension = anyModule._extensions['.png'];

  anyModule._resolveFilename = function (request: string, ...rest: unknown[]) {
    if (request === ASSET_SPECIFIER) return ASSET_SPECIFIER;
    return originalResolveFilename.call(this, request, ...rest);
  };
  anyModule._extensions['.png'] = (mod: any, filename: string) => {
    if (filename === ASSET_SPECIFIER) {
      mod.exports = 'react-logo.png';
      return;
    }
    originalPngExtension(mod, filename);
  };

  restore = () => {
    anyModule._resolveFilename = originalResolveFilename;
    anyModule._extensions['.png'] = originalPngExtension;
  };
});

afterAll(() => restore());

// `IconSymbol` renders MaterialIcons for its chevron/header glyphs; the real
// @expo/vector-icons/MaterialIcons pulls in unparseable Flow source under this
// test setup, so it's swapped for a minimal element exposing name/color/size.
vi.mock('@expo/vector-icons/MaterialIcons', () => ({
  default: ({ name, color, size, style }: any) => (
    <span aria-hidden data-icon-name={name} style={{ color, fontSize: size, ...style }} />
  ),
}));

// `expo-image`'s real native module has no jsdom implementation; a plain img
// is enough to prove the screen wires up a source.
vi.mock('expo-image', () => ({
  Image: (props: any) => <img alt="" src={typeof props.source === 'string' ? props.source : props.source?.uri} />,
}));

// ExternalLink (rendered inside each Collapsible section) uses expo-router's
// real `Link`, which drags in native navigation machinery that doesn't
// resolve under jsdom — same stand-in used by external-link.test.tsx.
vi.mock('expo-router', () => ({
  Link: ({ href, onPress, children, ...rest }: any) => (
    <a href={href} onClick={onPress} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('expo-web-browser', () => ({
  openBrowserAsync: vi.fn(),
  WebBrowserPresentationStyle: { AUTOMATIC: 'AUTOMATIC' },
}));

// ParallaxScrollView drives react-native-reanimated worklets, which need a
// real native runtime; stub it down to pass-through values as in
// components/parallax-scroll-view.test.tsx.
vi.mock('react-native-reanimated', async () => {
  const RN = await import('react-native');
  return {
    __esModule: true,
    default: { ScrollView: RN.ScrollView, View: RN.View },
    useAnimatedRef: () => ({ current: null }),
    useAnimatedStyle: () => ({}),
    useScrollOffset: () => ({ value: 0 }),
    interpolate: (_value: number, _input: number[], output: number[]) => output[0],
  };
});

import TabTwoScreen from './explore';

describe('TabTwoScreen (Explore)', () => {
  it('renders the title and intro copy', () => {
    render(<TabTwoScreen />);
    expect(screen.getByText('Explore')).toBeTruthy();
    expect(screen.getByText('This app includes example code to help you get started.')).toBeTruthy();
  });

  it('renders every collapsible section header, collapsed by default', () => {
    render(<TabTwoScreen />);
    expect(screen.getByText('File-based routing')).toBeTruthy();
    expect(screen.getByText('Android, iOS, and web support')).toBeTruthy();
    expect(screen.getByText('Images')).toBeTruthy();
    expect(screen.getByText('Light and dark mode components')).toBeTruthy();
    expect(screen.getByText('Animations')).toBeTruthy();
    // Body copy only present once a section is expanded.
    expect(screen.queryByText(/This app has two screens/)).toBeNull();
  });

  it('expands the "File-based routing" section on press, revealing its body and link', () => {
    render(<TabTwoScreen />);
    fireEvent.click(screen.getByText('File-based routing'));
    expect(screen.getByText(/This app has two screens/)).toBeTruthy();
    expect(screen.getByText('app/(tabs)/index.tsx')).toBeTruthy();
    const link = screen.getByText('Learn more').closest('a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('https://docs.expo.dev/router/introduction');
  });

  it('expands the "Images" section, rendering the example image', () => {
    render(<TabTwoScreen />);
    fireEvent.click(screen.getByText('Images'));
    expect(screen.getByText(/you can use the/)).toBeTruthy();
    const img = document.querySelector('img');
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toBe('react-logo.png');
  });

  it('expands the "Android, iOS, and web support" section', () => {
    render(<TabTwoScreen />);
    fireEvent.click(screen.getByText('Android, iOS, and web support'));
    expect(screen.getByText(/You can open this project on Android, iOS/)).toBeTruthy();
  });

  it('expands the "Light and dark mode components" section', () => {
    render(<TabTwoScreen />);
    fireEvent.click(screen.getByText('Light and dark mode components'));
    expect(screen.getByText(/useColorScheme\(\)/)).toBeTruthy();
  });

  it('expands the "Animations" section and omits the iOS-only note on the web platform', () => {
    render(<TabTwoScreen />);
    fireEvent.click(screen.getByText('Animations'));
    expect(screen.getByText(/waving hand animation/)).toBeTruthy();
    // `Platform.select({ ios: ... })` has no `web`/`default` key, so under
    // react-native-web (Platform.OS === 'web') it resolves to undefined.
    expect(screen.queryByText(/provides a parallax effect/)).toBeNull();
  });

  it('collapses a section again on a second press', () => {
    render(<TabTwoScreen />);
    const header = screen.getByText('File-based routing');
    fireEvent.click(header);
    expect(screen.getByText(/This app has two screens/)).toBeTruthy();
    fireEvent.click(header);
    expect(screen.queryByText(/This app has two screens/)).toBeNull();
  });
});
