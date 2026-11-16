/** Longest hashtag kept, without the leading #. Longer tags are run-on phrases the model glued together. */
export const MAX_HASHTAG_LENGTH = 30;
export const MAX_HASHTAGS = 6;

/**
 * Cleans the hashtags returned by the model: splits items that pack several tags, strips
 * punctuation, drops run-on tags, removes case-insensitive duplicates and caps the list.
 */
export function normalizeHashtags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    for (const part of item.split(/[\s,#]+/)) {
      const tag = part.replace(/[^\p{L}\p{N}_]/gu, '');
      if (!tag || tag.length > MAX_HASHTAG_LENGTH) continue;
      const key = tag.toLocaleLowerCase('es');
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(`#${tag}`);
      if (result.length === MAX_HASHTAGS) return result;
    }
  }
  return result;
}
