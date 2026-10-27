import { open, stat } from 'node:fs/promises';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import * as exifr from 'exifr';
import type { GenerationMetadata } from '../shared/generation-metadata';
import { parseGenerationMetadata } from './generation-metadata-parser';

const LIMIT = 4 * 1024 * 1024;
const cache = new Map<string, { revision: string; metadata: GenerationMetadata | null }>();
export async function readPngTextMetadata(filePath: string): Promise<Record<string, unknown>> {
  const file = await open(filePath, 'r');
  const result: Record<string, unknown> = Object.create(null);
  try {
    const signature = Buffer.alloc(8); await file.read(signature, 0, 8, 0);
    if (!signature.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return result;
    const info = await file.stat(); let position = 8; let total = 0; let decoded = 0;
    for (let count = 0; count < 4096 && position + 12 <= info.size; count++) {
      const header = Buffer.alloc(8); const read = await file.read(header, 0, 8, position);
      if (read.bytesRead !== 8) break;
      const size = header.readUInt32BE(0); const kind = header.toString('ascii', 4, 8);
      if (position + size + 12 > info.size || kind === 'IEND') break;
      if (['tEXt', 'iTXt', 'zTXt'].includes(kind) && size <= LIMIT && total + size <= 2 * LIMIT) {
        const payload = Buffer.alloc(size); await file.read(payload, 0, size, position + 8); total += size;
        const nul = payload.indexOf(0);
        if (nul > 0 && nul <= 79) {
          const name = payload.toString('latin1', 0, nul); let content: Buffer | null = null;
          try {
            if (kind === 'tEXt') content = payload.subarray(nul + 1);
            if (kind === 'zTXt' && payload[nul + 1] === 0) content = inflateSync(payload.subarray(nul + 2), { maxOutputLength: Math.max(1, Math.min(LIMIT, 2 * LIMIT - decoded)) });
            if (kind === 'iTXt') {
              const languageEnd = payload.indexOf(0, nul + 3); const translatedEnd = payload.indexOf(0, languageEnd + 1);
              if (languageEnd >= nul + 3 && translatedEnd >= languageEnd + 1 && payload[nul + 2] === 0) {
                content = payload[nul + 1] === 1 ? inflateSync(payload.subarray(translatedEnd + 1), { maxOutputLength: Math.max(1, Math.min(LIMIT, 2 * LIMIT - decoded)) }) : payload.subarray(translatedEnd + 1);
              }
            }
            if (content && decoded + content.length <= 2 * LIMIT) {
              decoded += content.length;
              result[name] = content.toString(kind === 'tEXt' || kind === 'zTXt' ? 'latin1' : 'utf8');
            }
          } catch { /* Invalid/oversized compressed metadata is ignored; pixels are never decoded here. */ }
        }
      }
      position += size + 12;
    }
    return result;
  } finally { await file.close(); }
}

export async function readGenerationMetadata(filePath: string): Promise<GenerationMetadata | null> {
  if (!['.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff'].includes(path.extname(filePath).toLowerCase())) return null;
  try {
    const info = await stat(filePath); const revision = `${info.mtimeMs}:${info.size}`;
    const previous = cache.get(filePath); if (previous?.revision === revision) return previous.metadata;
    const png = path.extname(filePath).toLowerCase() === '.png' ? await readPngTextMetadata(filePath) : {};
    let metadata = parseGenerationMetadata(png);
    if (!metadata) {
      try {
        const embedded = await exifr.parse(filePath, { xmp: true, tiff: true, exif: true, iptc: true, translateValues: false });
        metadata = parseGenerationMetadata({ ...embedded, ...png });
      } catch { /* Missing EXIF is normal for generated images. */ }
    }
    if (cache.size >= 128) cache.delete(cache.keys().next().value!);
    cache.set(filePath, { revision, metadata }); return metadata;
  } catch { return null; }
}
