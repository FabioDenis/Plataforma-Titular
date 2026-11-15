// Content type for images relayed by the image proxy. Many CDNs serve photos without a type or
// as a generic binary type, so those are identified by their first bytes. Anything that is not
// declared as an image and does not look like one is refused, so the proxy never relays pages or data.

const GENERIC_BINARY_TYPES = new Set(['application/octet-stream', 'binary/octet-stream', 'application/binary']);

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  bytes.length >= offset + signature.length && signature.every((value, i) => bytes[offset + i] === value);

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

export function sniffImageType(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, ...ascii('PNG'), 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, ascii('GIF87a')) || startsWith(bytes, ascii('GIF89a'))) return 'image/gif';
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) return 'image/webp';
  if (startsWith(bytes, ascii('ftyp'), 4) && (startsWith(bytes, ascii('avif'), 8) || startsWith(bytes, ascii('avis'), 8))) return 'image/avif';
  return null;
}

/** Returns the type to serve the remote body with, or null when it must not be relayed. */
export function resolveImageContentType(declared: string, bytes: Uint8Array): string | null {
  const mediaType = declared.split(';')[0].trim().toLowerCase();
  if (mediaType.startsWith('image/')) return declared;
  if (!mediaType || GENERIC_BINARY_TYPES.has(mediaType)) return sniffImageType(bytes);
  return null;
}
