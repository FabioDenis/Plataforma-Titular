import test from 'node:test';
import assert from 'node:assert/strict';
import { primaryFontFamily, selectFontFaces, extractFontUrls } from './fontEmbed';

const GOOGLE_CSS = `
/* cyrillic */
@font-face {
  font-family: 'Montserrat';
  font-style: normal;
  font-weight: 400 900;
  src: url(https://fonts.gstatic.com/s/montserrat/cyr.woff2) format('woff2');
  unicode-range: U+0301, U+0400-045F;
}
/* latin-ext */
@font-face {
  font-family: 'Montserrat';
  font-style: normal;
  font-weight: 400 900;
  src: url(https://fonts.gstatic.com/s/montserrat/latin-ext.woff2) format('woff2');
  unicode-range: U+0100-02BA, U+1E00-1E9F;
}
/* latin */
@font-face {
  font-family: 'Montserrat';
  font-style: normal;
  font-weight: 400 900;
  src: url(https://fonts.gstatic.com/s/montserrat/latin.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+2000-206F;
}
/* latin */
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 700;
  src: url(https://fonts.gstatic.com/s/inter/latin.woff2) format('woff2');
  unicode-range: U+0000-00FF;
}
`;

test('reads the first family of a font-family list without quotes', () => {
  assert.equal(primaryFontFamily("'Montserrat', sans-serif"), 'montserrat');
  assert.equal(primaryFontFamily('"Playfair Display", serif'), 'playfair display');
  assert.equal(primaryFontFamily(''), '');
});

test('keeps only the latin faces of the families used by the card', () => {
  const faces = selectFontFaces(GOOGLE_CSS, new Set(['montserrat']));
  assert.equal(faces.length, 2);
  assert.ok(faces[0].includes('latin-ext.woff2'));
  assert.ok(faces[1].includes('montserrat/latin.woff2'));
  assert.ok(faces.every((face) => !face.includes('cyr.woff2') && !face.includes('inter')));
});

test('returns no faces when the card uses no web font', () => {
  assert.deepEqual(selectFontFaces(GOOGLE_CSS, new Set(['arial'])), []);
});

test('extracts every font file url of a face', () => {
  const [face] = selectFontFaces(GOOGLE_CSS, new Set(['inter']));
  assert.deepEqual(extractFontUrls(face), ['https://fonts.gstatic.com/s/inter/latin.woff2']);
});
