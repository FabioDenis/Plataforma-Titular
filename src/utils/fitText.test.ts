import test from 'node:test';
import assert from 'node:assert/strict';
import { findFittingScale } from './fitText';

// Simulates a text block that overflows while its scale is above `fitsAt`.
const overflowAbove = (fitsAt: number) => (scale: number) => scale > fitsAt + 1e-9;

test('keeps the full size when the text already fits', () => {
  assert.equal(findFittingScale(overflowAbove(1)), 1);
});

test('shrinks to the largest step that fits', () => {
  assert.equal(findFittingScale(overflowAbove(0.85), { min: 0.6, step: 0.05 }), 0.85);
  assert.equal(findFittingScale(overflowAbove(0.83), { min: 0.6, step: 0.05 }), 0.8);
});

test('stops at the minimum scale when nothing fits', () => {
  assert.equal(findFittingScale(() => true, { min: 0.6, step: 0.05 }), 0.6);
});

test('rejects a step that would never reach the minimum', () => {
  assert.throws(() => findFittingScale(() => true, { step: 0 }), RangeError);
});

test('never measures below the minimum scale', () => {
  const measured: number[] = [];
  findFittingScale(
    (scale) => {
      measured.push(scale);
      return true;
    },
    { min: 0.7, step: 0.1 }
  );
  assert.deepEqual(measured, [1, 0.9, 0.8, 0.7]);
});
