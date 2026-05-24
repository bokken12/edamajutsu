import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { Debouncer } from '../jj/debouncer';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

test('fires once after a single trigger and quiet period', () => {
  const fired = vi.fn();
  const d = new Debouncer(250, fired);
  d.trigger();
  vi.advanceTimersByTime(249);
  expect(fired).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(fired).toHaveBeenCalledTimes(1);
});

test('coalesces a burst into one fire', () => {
  const fired = vi.fn();
  const d = new Debouncer(250, fired);
  d.trigger();
  vi.advanceTimersByTime(100);
  d.trigger();
  vi.advanceTimersByTime(100);
  d.trigger();
  vi.advanceTimersByTime(249);
  expect(fired).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(fired).toHaveBeenCalledTimes(1);
});

test('successive bursts both fire', () => {
  const fired = vi.fn();
  const d = new Debouncer(250, fired);
  d.trigger();
  vi.advanceTimersByTime(250);
  expect(fired).toHaveBeenCalledTimes(1);
  d.trigger();
  vi.advanceTimersByTime(250);
  expect(fired).toHaveBeenCalledTimes(2);
});

test('suppressNext swallows exactly the next coalesced fire', () => {
  const fired = vi.fn();
  const d = new Debouncer(250, fired);
  d.suppressNext();
  d.trigger();
  vi.advanceTimersByTime(250);
  expect(fired).not.toHaveBeenCalled();
  // The burst that follows isn't suppressed.
  d.trigger();
  vi.advanceTimersByTime(250);
  expect(fired).toHaveBeenCalledTimes(1);
});

test('suppressNext applies across a coalesced burst (still one suppression)', () => {
  const fired = vi.fn();
  const d = new Debouncer(250, fired);
  d.suppressNext();
  d.trigger();
  vi.advanceTimersByTime(100);
  d.trigger();
  vi.advanceTimersByTime(100);
  d.trigger();
  vi.advanceTimersByTime(250);
  expect(fired).not.toHaveBeenCalled();
});

test('disarm cancels a pending suppression', () => {
  const fired = vi.fn();
  const d = new Debouncer(250, fired);
  d.suppressNext();
  d.disarm();
  d.trigger();
  vi.advanceTimersByTime(250);
  expect(fired).toHaveBeenCalledTimes(1);
});

test('dispose cancels a pending timer', () => {
  const fired = vi.fn();
  const d = new Debouncer(250, fired);
  d.trigger();
  d.dispose();
  vi.advanceTimersByTime(1000);
  expect(fired).not.toHaveBeenCalled();
});
