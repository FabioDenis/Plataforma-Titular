import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveImageContentType, sniffImageType } from './image-type';

const bytes = (...values: Array<number | string>) =>
  new Uint8Array(values.flatMap((v) => (typeof v === 'string' ? [...Buffer.from(v, 'latin1')] : [v])));

const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10);
const PNG = bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a, 0, 0);
const GIF = bytes('GIF89a', 1, 0);
const WEBP = bytes('RIFF', 0x24, 0, 0, 0, 'WEBPVP8 ');
const AVIF = bytes(0, 0, 0, 0x20, 'ftypavif', 0, 0, 0, 0);
const HTML = bytes('<!doctype html><html>');

test('sniffImageType recognizes JPEG, PNG, GIF, WebP and AVIF by their first bytes', () => {
  assert.equal(sniffImageType(JPEG), 'image/jpeg');
  assert.equal(sniffImageType(PNG), 'image/png');
  assert.equal(sniffImageType(GIF), 'image/gif');
  assert.equal(sniffImageType(WEBP), 'image/webp');
  assert.equal(sniffImageType(AVIF), 'image/avif');
  assert.equal(sniffImageType(HTML), null);
  assert.equal(sniffImageType(bytes('RIFF', 0, 0, 0, 0, 'WAVE')), null);
  assert.equal(sniffImageType(new Uint8Array(0)), null);
});

test('a declared image type is kept as is', () => {
  assert.equal(resolveImageContentType('image/png', HTML), 'image/png');
  assert.equal(resolveImageContentType('IMAGE/JPEG; charset=binary', JPEG), 'IMAGE/JPEG; charset=binary');
});

test('a missing or generic type is resolved from the bytes, and anything else is refused', () => {
  assert.equal(resolveImageContentType('', JPEG), 'image/jpeg');
  assert.equal(resolveImageContentType('application/octet-stream', PNG), 'image/png');
  assert.equal(resolveImageContentType('Binary/Octet-Stream', WEBP), 'image/webp');
  assert.equal(resolveImageContentType('application/octet-stream', HTML), null);
  assert.equal(resolveImageContentType('text/html', JPEG), null);
  assert.equal(resolveImageContentType('application/json', PNG), null);
});
