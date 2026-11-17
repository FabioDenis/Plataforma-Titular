/**
 * Builds the @font-face CSS that html-to-image embeds in the exported PNG. Without it the export
 * renders with a fallback font, so text wraps differently than in the live preview.
 */

const FONT_FACE_PATTERN = /@font-face\s*{[^}]*}/g;
const FAMILY_PATTERN = /font-family:\s*['"]?([^;'"]+)['"]?/i;
const UNICODE_RANGE_PATTERN = /unicode-range:\s*([^;]+)/i;
const URL_PATTERN = /url\((['"]?)([^'")]+)\1\)/g;
/** Spanish text only needs the latin subsets; the cyrillic, greek and vietnamese files are skipped. */
const LATIN_RANGE_PATTERN = /U\+0000-00FF|U\+0100-02/i;

/** First family of a CSS font-family list, lower-cased and without quotes. */
export function primaryFontFamily(fontFamily: string): string {
  return (fontFamily.split(',')[0] || '').trim().replace(/^['"]|['"]$/g, '').toLowerCase();
}

/** @font-face blocks of `css` that belong to `families` and cover latin text. */
export function selectFontFaces(css: string, families: Set<string>): string[] {
  const faces: string[] = css.match(FONT_FACE_PATTERN) ?? [];
  return faces.filter((face) => {
    const family = face.match(FAMILY_PATTERN)?.[1].trim().toLowerCase();
    if (!family || !families.has(family)) return false;
    const range = face.match(UNICODE_RANGE_PATTERN)?.[1];
    return !range || LATIN_RANGE_PATTERN.test(range);
  });
}

export function extractFontUrls(face: string): string[] {
  return Array.from(face.matchAll(URL_PATTERN), (match) => match[2]);
}

const fontDataUrlCache = new Map<string, Promise<string>>();
const stylesheetCache = new Map<string, Promise<string>>();

function fetchAsDataUrl(url: string): Promise<string> {
  let cached = fontDataUrlCache.get(url);
  if (!cached) {
    cached = fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`Font request failed: ${res.status}`);
        return res.blob();
      })
      .then(
        (blob) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          })
      );
    cached.catch(() => fontDataUrlCache.delete(url));
    fontDataUrlCache.set(url, cached);
  }
  return cached;
}

function fetchStylesheet(href: string): Promise<string> {
  let cached = stylesheetCache.get(href);
  if (!cached) {
    cached = fetch(href).then((res) => {
      if (!res.ok) throw new Error(`Font stylesheet request failed: ${res.status}`);
      return res.text();
    });
    cached.catch(() => stylesheetCache.delete(href));
    stylesheetCache.set(href, cached);
  }
  return cached;
}

/** Families actually rendered inside `root`, read from the computed styles. */
function collectFamilies(root: HTMLElement): Set<string> {
  const families = new Set<string>();
  [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))].forEach((el) => {
    const family = primaryFontFamily(getComputedStyle(el).fontFamily);
    if (family) families.add(family);
  });
  return families;
}

/**
 * @font-face CSS with the font files inlined as data URLs, for every web font the card uses.
 * Returns an empty string when the fonts cannot be loaded; the export then falls back to system fonts.
 */
export async function buildFontEmbedCss(root: HTMLElement): Promise<string> {
  const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href*="fonts.googleapis.com"]'));
  if (links.length === 0) return '';
  const families = collectFamilies(root);
  try {
    const sheets = await Promise.all(links.map((link) => fetchStylesheet(link.href)));
    const faces = sheets.flatMap((css) => selectFontFaces(css, families));
    const inlined = await Promise.all(
      faces.map(async (face) => {
        let result = face;
        for (const url of extractFontUrls(face)) {
          result = result.split(url).join(await fetchAsDataUrl(url));
        }
        return result;
      })
    );
    return inlined.join('\n');
  } catch (err) {
    console.warn('[fontEmbed] Could not embed web fonts in the export:', err);
    return '';
  }
}
