// jsdom has no `AnimationEvent`/`TransitionEvent` constructors. React (see
// react-dom-client.development.js's `"AnimationEvent" in window` check) reads
// that absence as "this environment can't run CSS animations at all" and
// disables its onAnimationEnd/onTransitionEnd event delegation entirely at
// module-init time — so `fireEvent.animationEnd(...)` silently never reaches
// any onAnimationEnd handler, no matter which element it's dispatched on.
// This must run before react-dom's own module evaluation (which happens as
// soon as anything imports '@testing-library/react'), so it's a standalone,
// import-free setup file listed ahead of vitest.setup.ts in
// vitest.config.ts's `setupFiles`.
class AnimationEventPolyfill extends Event {
  animationName: string;
  elapsedTime: number;
  pseudoElement: string;
  constructor(type: string, init: AnimationEventInit = {}) {
    super(type, init);
    this.animationName = init.animationName ?? '';
    this.elapsedTime = init.elapsedTime ?? 0;
    this.pseudoElement = init.pseudoElement ?? '';
  }
}

if (typeof window !== 'undefined' && typeof (window as any).AnimationEvent === 'undefined') {
  (window as any).AnimationEvent = AnimationEventPolyfill;
}
