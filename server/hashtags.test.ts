import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHashtags, MAX_HASHTAG_LENGTH } from './hashtags';

test('keeps well-formed hashtags and adds the missing #', () => {
  assert.deepEqual(normalizeHashtags(['#Encarnación', 'CACISE', '#Economía']), ['#Encarnación', '#CACISE', '#Economía']);
});

test('splits several hashtags packed into one item', () => {
  assert.deepEqual(normalizeHashtags(['#Encarnación #CACISE, #UenoBank#Paraguay']), [
    '#Encarnación',
    '#CACISE',
    '#UenoBank',
    '#Paraguay',
  ]);
});

test('drops run-on hashtags longer than the limit', () => {
  const runOn = '#EncarnaciónBusinessesConComercioCACISEuenoBankEconomiaParaguayPosadasMercadoFinanciero';
  assert.deepEqual(normalizeHashtags([runOn, '#Posadas']), ['#Posadas']);
  assert.equal(normalizeHashtags(['#' + 'a'.repeat(MAX_HASHTAG_LENGTH)]).length, 1);
  assert.equal(normalizeHashtags(['#' + 'a'.repeat(MAX_HASHTAG_LENGTH + 1)]).length, 0);
});

test('removes punctuation, duplicates and caps the list at six', () => {
  assert.deepEqual(normalizeHashtags(['#Ventas.', '#ventas', '#A', '#B', '#C', '#D', '#E', '#F']), [
    '#Ventas',
    '#A',
    '#B',
    '#C',
    '#D',
    '#E',
  ]);
});

test('returns an empty list for missing or invalid input', () => {
  assert.deepEqual(normalizeHashtags(undefined), []);
  assert.deepEqual(normalizeHashtags('#Encarnación'), []);
  assert.deepEqual(normalizeHashtags([null, 42, '#', '  ']), []);
});
