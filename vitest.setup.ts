import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { configure } from '@testing-library/dom';

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
