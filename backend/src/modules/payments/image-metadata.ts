import { inflateSync } from 'zlib';

/**
 * What a receipt image says about itself, for the lender to weigh next to the
 * AI score. Dates are as the device wrote them ("YYYY-MM-DD HH:MM:SS", with
 * the UTC offset when the file has one). Anything can be missing: WhatsApp,
 * most screenshots and many apps strip metadata, and it can be forged — it's
 * a hint, never proof.
 */
export interface ReceiptMetadata {
  /** When the photo or screenshot was taken (EXIF DateTimeOriginal, XMP create date...). */
  createdAt: string | null;
  /** When an app last saved the image (EXIF DateTime, XMP ModifyDate). */
  modifiedAt: string | null;
  /** The app that wrote the file — an editor here is worth a closer look. */
  software: string | null;
  /** Camera / phone make and model. */
  device: string | null;
  /** The file's "last modified" time on the debtor's device, as the browser reported it (ISO). */
  fileModifiedAt: string | null;
}

interface Collected {
  dateOriginal?: string;
  dateDigitized?: string;
  dateTime?: string;
  offsetOriginal?: string;
  offset?: string;
  software?: string;
  make?: string;
  model?: string;
  xmpCreate?: string;
  xmpModify?: string;
  xmpTool?: string;
  pngCreation?: string;
  pngSoftware?: string;
}

const clean = (value: string | undefined) => {
  const text = value?.replace(/\0+$/, '').trim();
  return text ? text.slice(0, 120) : undefined;
};

/** "2024:05:01 13:22:10" or "2024-05-01T13:22:10-05:00" → "2024-05-01 13:22:10[-05:00]". */
function normalizeDate(value: string | undefined, offset?: string): string | null {
  const m = value?.trim().match(/^(\d{4})[:-](\d{2})[:-](\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?/);
  if (!m || m[1] === '0000') return null;
  const [, y, mo, d, h, mi, s, zone] = m;
  const time = h ? ` ${h}:${mi}:${s ?? '00'}` : '';
  const tz = zone ?? (h ? offset?.trim().match(/^[+-]\d{2}:\d{2}$/)?.[0] : undefined);
  return `${y}-${mo}-${d}${time}${tz ? (tz === 'Z' ? 'Z' : tz.replace(/^([+-]\d{2})(\d{2})$/, '$1:$2')) : ''}`;
}

/** Reads the handful of TIFF/EXIF tags that matter here. Every offset is bounds-checked. */
function readTiff(buf: Buffer, out: Collected): void {
  if (buf.length < 8) return;
  const order = buf.toString('ascii', 0, 2);
  if (order !== 'II' && order !== 'MM') return;
  const le = order === 'II';
  const u16 = (o: number) => (o + 2 <= buf.length ? (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o)) : 0);
  const u32 = (o: number) => (o + 4 <= buf.length ? (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o)) : 0);

  const ascii = (entry: number) => {
    const count = u32(entry + 4);
    const at = count <= 4 ? entry + 8 : u32(entry + 8);
    if (count === 0 || at + count > buf.length) return undefined;
    return clean(buf.toString('latin1', at, at + count));
  };

  const readIfd = (offset: number, onTag: (tag: number, entry: number) => void) => {
    const count = u16(offset);
    if (offset === 0 || count > 500) return;
    for (let i = 0; i < count; i++) {
      const entry = offset + 2 + i * 12;
      if (entry + 12 > buf.length) return;
      onTag(u16(entry), entry);
    }
  };

  let exifIfd = 0;
  readIfd(u32(4), (tag, entry) => {
    if (tag === 0x010f) out.make ??= ascii(entry);
    else if (tag === 0x0110) out.model ??= ascii(entry);
    else if (tag === 0x0131) out.software ??= ascii(entry);
    else if (tag === 0x0132) out.dateTime ??= ascii(entry);
    else if (tag === 0x8769) exifIfd = u32(entry + 8);
  });
  readIfd(exifIfd, (tag, entry) => {
    if (tag === 0x9003) out.dateOriginal ??= ascii(entry);
    else if (tag === 0x9004) out.dateDigitized ??= ascii(entry);
    else if (tag === 0x9010) out.offset ??= ascii(entry);
    else if (tag === 0x9011) out.offsetOriginal ??= ascii(entry);
  });
}

function readXmp(xml: string, out: Collected): void {
  const pick = (name: string) => {
    const escaped = name.replace(':', '\\:');
    const m =
      xml.match(new RegExp(`${escaped}="([^"]*)"`)) ?? xml.match(new RegExp(`<${escaped}>([^<]*)</${escaped}>`));
    return clean(m?.[1]);
  };
  out.xmpCreate ??= pick('exif:DateTimeOriginal') ?? pick('photoshop:DateCreated') ?? pick('xmp:CreateDate');
  out.xmpModify ??= pick('xmp:ModifyDate') ?? pick('xmp:MetadataDate');
  out.xmpTool ??= pick('xmp:CreatorTool');
}

const EXIF_HEADER = Buffer.from('Exif\0\0', 'latin1');
const XMP_HEADER = Buffer.from('http://ns.adobe.com/xap/1.0/\0', 'latin1');

function readJpeg(buf: Buffer, out: Collected): void {
  let o = 2;
  while (o + 4 <= buf.length && buf[o] === 0xff) {
    const marker = buf[o + 1]!;
    // Start of scan: the image data follows, no more metadata segments.
    if (marker === 0xda || marker === 0xd9) return;
    const length = buf.readUInt16BE(o + 2);
    const body = buf.subarray(o + 4, Math.min(buf.length, o + 2 + length));
    if (marker === 0xe1) {
      if (body.subarray(0, 6).equals(EXIF_HEADER)) readTiff(body.subarray(6), out);
      else if (body.subarray(0, XMP_HEADER.length).equals(XMP_HEADER)) {
        readXmp(body.subarray(XMP_HEADER.length).toString('utf8'), out);
      }
    }
    o += 2 + length;
  }
}

function readPng(buf: Buffer, out: Collected): void {
  let o = 8;
  while (o + 12 <= buf.length) {
    const length = buf.readUInt32BE(o);
    const type = buf.toString('ascii', o + 4, o + 8);
    const data = buf.subarray(o + 8, Math.min(buf.length, o + 8 + length));
    // Metadata chunks may also come after the image data, so only IEND stops the scan.
    if (type === 'IEND') return;
    if (type === 'eXIf') {
      readTiff(data, out);
    } else if (type === 'tEXt' || type === 'zTXt' || type === 'iTXt') {
      const nul = data.indexOf(0);
      if (nul > 0) {
        const keyword = data.toString('latin1', 0, nul);
        let text: string | undefined;
        try {
          if (type === 'tEXt') text = data.toString('latin1', nul + 1);
          else if (type === 'zTXt') text = inflateSync(data.subarray(nul + 2)).toString('latin1');
          else {
            const compressed = data[nul + 1] === 1;
            // Skip the language tag and translated keyword (two more NUL-terminated strings).
            const langEnd = data.indexOf(0, nul + 3);
            const transEnd = langEnd === -1 ? -1 : data.indexOf(0, langEnd + 1);
            if (transEnd !== -1) {
              const raw = data.subarray(transEnd + 1);
              text = (compressed ? inflateSync(raw) : raw).toString('utf8');
            }
          }
        } catch {
          text = undefined;
        }
        if (text !== undefined) {
          if (keyword === 'XML:com.adobe.xmp') readXmp(text, out);
          else if (keyword === 'Creation Time') out.pngCreation ??= clean(text);
          else if (keyword === 'Software') out.pngSoftware ??= clean(text);
        }
      }
    }
    o += 12 + length;
  }
}

function readWebp(buf: Buffer, out: Collected): void {
  let o = 12;
  while (o + 8 <= buf.length) {
    const type = buf.toString('ascii', o, o + 4);
    const length = buf.readUInt32LE(o + 4);
    const data = buf.subarray(o + 8, Math.min(buf.length, o + 8 + length));
    if (type === 'EXIF') readTiff(data.subarray(0, 6).equals(EXIF_HEADER) ? data.subarray(6) : data, out);
    else if (type === 'XMP ') readXmp(data.toString('utf8'), out);
    // Chunks are padded to an even size.
    o += 8 + length + (length % 2);
  }
}

/** Never throws: a malformed or metadata-free image just yields nulls. */
export function readImageMetadata(buffer: Buffer, mime: string, fileModifiedMs?: number | null): ReceiptMetadata {
  const out: Collected = {};
  try {
    if (mime === 'image/jpeg') readJpeg(buffer, out);
    else if (mime === 'image/png') readPng(buffer, out);
    else if (mime === 'image/webp') readWebp(buffer, out);
  } catch {
    // Whatever was read before the damage is still useful.
  }
  // Many phones repeat the make in the model ("Apple" + "iPhone 13" vs "samsung" + "samsung SM-A515F").
  const device =
    out.make && out.model && !out.model.toLowerCase().startsWith(out.make.toLowerCase())
      ? `${out.make} ${out.model}`
      : (out.model ?? out.make);
  return {
    createdAt:
      normalizeDate(out.dateOriginal, out.offsetOriginal) ??
      normalizeDate(out.dateDigitized, out.offsetOriginal) ??
      normalizeDate(out.xmpCreate) ??
      normalizeDate(out.pngCreation),
    modifiedAt: normalizeDate(out.dateTime, out.offset) ?? normalizeDate(out.xmpModify),
    software: out.software ?? out.xmpTool ?? out.pngSoftware ?? null,
    device: device ?? null,
    fileModifiedAt:
      typeof fileModifiedMs === 'number' && Number.isFinite(fileModifiedMs) && fileModifiedMs > 0
        ? new Date(fileModifiedMs).toISOString()
        : null,
  };
}
