import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { configure } from '@testing-library/dom';

// expo-modules-core's EventEmitter/NativeModule/uuid helpers read these off a
// `globalThis.expo` object that Metro's native runtime installs before any
// JS module code runs. Under Vitest nothing installs it, so every package
// that transitively imports expo-modules-core (expo-constants,
// expo-localization, expo-blur, …) throws "Cannot read properties of
// undefined (reading 'EventEmitter')" at module-load time, before a single
// test can even be collected. A minimal stand-in is enough — nothing here
// exercises real native module calls.
class StubEventEmitter {
  addListener() {
    return { remove: () => {} };
  }
  removeListener() {}
  removeAllListeners() {}
  emit() {}
}
(globalThis as any).expo = {
  EventEmitter: StubEventEmitter,
  NativeModule: class {},
  SharedObject: class {},
  SharedRef: class {},
  // A stub member must be usable both as a plain function
  // (`modules.X.method()`) and as a base class (`class Y extends
  // modules.X.SomeClass {}`, as expo-file-system does) — an arrow function
  // has no `.prototype` and breaks the latter with "is not a constructor",
  // so this uses a plain `function` declaration instead.
  modules: new Proxy(
    {},
    {
      get: () =>
        new Proxy({}, { get: () => function stub() { return undefined; } }),
    },
  ),
  uuidv4: () => 'test-uuid-v4',
  uuidv5: () => 'test-uuid-v5',
};

// expo's web "fast refresh" bootstrapping is Metro-only glue (it raw-`require`s
// files like './setupFastRefresh' that only exist in Metro's bundle graph).
// Vitest never runs inside Metro, so importing it directly throws
// "Cannot find module './setupFastRefresh'".
vi.mock('expo/src/winter/runtime', () => ({}));
vi.mock('expo/src/async-require/setup', () => ({}));
// Expo.fx.tsx raw-`require`s './async-require/messageSocket' at module scope
// whenever `globalThis.expo` is defined (which the stub above now makes
// true) — that raw require bypasses Vite's module graph entirely and can't
// be intercepted by mocking the required file itself, so the whole
// containing module is neutralized instead.
vi.mock('expo/src/Expo.fx', () => ({}));

// expo-blur's native module resolution isn't meaningful under jsdom; nothing
// in this suite asserts on real blur rendering, so a plain View stand-in is
// enough for any screen that imports BlurView. Plain `.ts` (not `.tsx`), so
// this uses createElement rather than JSX.
vi.mock('expo-blur', async () => {
  const React = await import('react');
  const { View } = await import('react-native');
  return {
    BlurView: ({ intensity: _intensity, tint: _tint, ...rest }: any) => React.createElement(View, rest),
  };
});

// expo-image's real <Image> resolves to a native view manager
// (requireNativeViewManager), which throws under jsdom ("not available on
// web") — a plain RN Image renders the same `source`/`style` props fine for
// what these tests assert on.
vi.mock('expo-image', async () => {
  const React = await import('react');
  const { Image } = await import('react-native');
  return {
    Image: (props: any) => React.createElement(Image, props),
  };
});

// Without this, a component/hook rendered in one test stays mounted (and
// subscribed to whatever stores it touched) into the next test in the same
// file — `test.globals` is off, so @testing-library/react's usual automatic
// cleanup-on-afterEach never registers itself.
afterEach(() => {
  cleanup();
});

// react-native-web's Pressable activates its `pressed` render-prop style
// (and other findBy*/waitFor-observed async state) via a real ~50ms
// setTimeout. Under this suite's full 74-file parallel run that timer can
// occasionally take longer than testing-library's 1000ms default to fire —
// every test asserting a pressed style passes reliably alone but has been
// observed to intermittently miss the default window when the whole suite
// runs together. Raising the default here (rather than passing a per-call
// timeout in every affected test) fixes it suite-wide.
configure({ asyncUtilTimeout: 5000 });
