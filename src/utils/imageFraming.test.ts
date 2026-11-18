import test from 'node:test';
import assert from 'node:assert/strict';
import { clampPan, computeImageFrame, panDeltaFromPixels } from './imageFraming';

// A 4:5 card (400x500) showing a landscape 1600x900 photo.
const card = { containerWidth: 400, containerHeight: 500 };
const landscape = { naturalWidth: 1600, naturalHeight: 900 };

const coversCard = (frame: { left: number; top: number; width: number; height: number }) =>
  frame.left <= 1e-9 &&
  frame.top <= 1e-9 &&
  frame.left + frame.width >= card.containerWidth - 1e-9 &&
  frame.top + frame.height >= card.containerHeight - 1e-9;

test('centers the photo with cover sizing at zoom 100 and no pan', () => {
  const frame = computeImageFrame({ ...card, ...landscape, zoom: 100, panX: 0, panY: 0 });
  // Cover scale = max(400/1600, 500/900) = 500/900 -> 888.9 x 500
  assert.ok(Math.abs(frame.height - 500) < 1e-6);
  assert.ok(Math.abs(frame.width - 1600 * (500 / 900)) < 1e-6);
  assert.ok(Math.abs(frame.left - -(frame.width - 400) / 2) < 1e-6);
  assert.equal(frame.top, 0);
});

test('lets you reach the side of the photo that cover crops, without zoom', () => {
  const left = computeImageFrame({ ...card, ...landscape, zoom: 100, panX: 100, panY: 0 });
  const right = computeImageFrame({ ...card, ...landscape, zoom: 100, panX: -100, panY: 0 });
  assert.equal(left.left, 0); // photo's left edge on the card's left edge
  assert.ok(Math.abs(right.left + right.width - 400) < 1e-6); // right edge on the card's right edge
});

test('never leaves an empty gap, at any zoom or pan, even out of range', () => {
  for (const zoom of [100, 150, 300]) {
    for (const pan of [-500, -100, -37, 0, 64, 100, 500]) {
      const frame = computeImageFrame({ ...card, ...landscape, zoom, panX: pan, panY: pan });
      assert.ok(coversCard(frame), `gap at zoom ${zoom}, pan ${pan}`);
    }
  }
});

test('does not move along an axis with nothing left to show', () => {
  const frame = computeImageFrame({ ...card, ...landscape, zoom: 100, panX: 0, panY: 100 });
  assert.equal(frame.top, 0);
});

test('zoom enlarges the photo around the current framing', () => {
  const frame = computeImageFrame({ ...card, ...landscape, zoom: 200, panX: 0, panY: 0 });
  assert.ok(Math.abs(frame.height - 1000) < 1e-6);
  assert.ok(Math.abs(frame.top - -250) < 1e-6);
});

test('clamps pan to -100..100', () => {
  assert.equal(clampPan(140), 100);
  assert.equal(clampPan(-140), -100);
  assert.equal(clampPan(42), 42);
  assert.equal(clampPan(Number.NaN), 0);
});

test('converts a drag in pixels into pan units for the available overflow', () => {
  // 200 px of overflow -> 100 px on each side equals 100 pan units.
  assert.equal(panDeltaFromPixels(50, 200), 50);
  assert.equal(panDeltaFromPixels(-100, 200), -100);
  assert.equal(panDeltaFromPixels(30, 0), 0);
});
