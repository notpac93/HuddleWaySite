import '@testing-library/jest-dom/vitest';

if (!Element.prototype.animate) {
  Element.prototype.animate = (() => ({
    cancel() {},
    currentTime: 0,
    finished: Promise.resolve(),
    pause() {},
    play() {},
  })) as unknown as typeof Element.prototype.animate;
}
