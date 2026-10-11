/**
 * Identifies an image by its magic bytes, never by the client-supplied
 * Content-Type or file name — both are trivially forged, so an HTML or SVG
 * file renamed to .png would otherwise be stored and later served back.
 * Anything not recognized here is refused.
 */
export type ImageMime = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';

export function sniffImage(header: Buffer): ImageMime | null {
  if (header.length < 12) return null;
  if (header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return 'image/jpeg';
  if (header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  const gif = header.toString('ascii', 0, 6);
  if (gif === 'GIF87a' || gif === 'GIF89a') return 'image/gif';
  return null;
}

/**
 * Headers for serving a stored upload: the real type, no MIME sniffing by the
 * browser, and a CSP that forbids running anything even if opened directly.
 */
export function uploadResponseHeaders(mime: string): Record<string, string> {
  return {
    'Content-Type': mime,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    'Content-Disposition': 'inline',
  };
}
