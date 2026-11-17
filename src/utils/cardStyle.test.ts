import test from 'node:test';
import assert from 'node:assert/strict';
import { getPanelBackground, getLogoBox } from './cardStyle';

test('solid panel applies the opacity to the secondary color', () => {
  assert.equal(getPanelBackground('solid', '#102030', 50), 'rgba(16, 32, 48, 0.5)');
  assert.equal(getPanelBackground('solid', '#102030', 100), 'rgba(16, 32, 48, 1)');
});

test('gradient panel fades from the color at the given opacity to transparent', () => {
  assert.equal(
    getPanelBackground('gradient', '#102030', 40),
    'linear-gradient(to top, rgba(16, 32, 48, 0.4), rgba(16, 32, 48, 0))'
  );
});

test('translucent panel keeps applying the opacity', () => {
  assert.equal(getPanelBackground('translucent', '#102030', 90), 'rgba(16, 32, 48, 0.9)');
});

test('panel falls back to the default color and opacity', () => {
  assert.equal(getPanelBackground(undefined, undefined, undefined), 'rgba(9, 13, 22, 0.9)');
  assert.equal(getPanelBackground('solid', 'not-a-color', 30), 'rgba(9, 13, 22, 0.3)');
  assert.equal(getPanelBackground('none', '#102030', 80), 'transparent');
});

test('each logo size is larger than the previous one in both height and width', () => {
  const sizes = (['small', 'medium', 'large', 'xlarge'] as const).map((s) => getLogoBox(s));
  for (let i = 1; i < sizes.length; i += 1) {
    assert.ok(sizes[i].height > sizes[i - 1].height);
    assert.ok(sizes[i].maxWidth > sizes[i - 1].maxWidth);
  }
});

test('footer logos keep the same order at a reduced scale', () => {
  assert.deepEqual(getLogoBox('medium'), { height: 52, maxWidth: 156 });
  assert.ok(getLogoBox('xlarge', 0.6).maxWidth > getLogoBox('large', 0.6).maxWidth);
  assert.equal(getLogoBox('small', 0.6).height, 24);
});
