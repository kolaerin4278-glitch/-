import { bytesToBase64Url, base64UrlToBytes } from '../core/security';
import type { Status } from '../constants';

const STATUS_CODE: Record<Status, string> = {
  full: 'F',
  plan_b: 'B',
  skip: 'S',
  counter: 'C'
};

const CODE_STATUS: Record<string, Status> = {
  F: 'full',
  B: 'plan_b',
  S: 'skip',
  C: 'counter'
};

/**
 * RLE-сжатие последовательности дневных статусов привычки (например, FFFFFBBBS -> 5F3B1S)
 */
export function encodeStatusRLE(statuses: readonly (Status | null)[]): string {
  if (statuses.length === 0) return '';
  const parts: string[] = [];
  let prevChar = statuses[0] ? (STATUS_CODE[statuses[0]] ?? '_') : '_';
  let count = 1;

  for (let i = 1; i < statuses.length; i++) {
    const s = statuses[i];
    const ch = s ? (STATUS_CODE[s] ?? '_') : '_';
    if (ch === prevChar) {
      count++;
    } else {
      parts.push(`${count}${prevChar}`);
      prevChar = ch;
      count = 1;
    }
  }
  parts.push(`${count}${prevChar}`);
  return parts.join('');
}

export function decodeStatusRLE(encoded: string): (Status | null)[] {
  if (!encoded) return [];
  const result: (Status | null)[] = [];
  const re = /(\d+)([FBSC_])/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(encoded)) !== null) {
    const count = Math.min(3650, Number(match[1] ?? 0));
    const code = match[2] ?? '_';
    const status = code === '_' ? null : (CODE_STATUS[code] ?? null);
    for (let i = 0; i < count; i++) {
      result.push(status);
    }
  }
  return result;
}

export async function compressGzipBase64Url(text: string): Promise<{ compressed: boolean; payload: string }> {
  if (typeof CompressionStream !== 'undefined') {
    try {
      const inputBytes = new TextEncoder().encode(text);
      const cs = new CompressionStream('gzip');
      const writer = cs.writable.getWriter();
      await writer.write(inputBytes as BufferSource);
      await writer.close();
      const response = new Response(cs.readable);
      const buffer = await response.arrayBuffer();
      return {
        compressed: true,
        payload: bytesToBase64Url(new Uint8Array(buffer))
      };
    } catch {
      // fallback ниже
    }
  }
  return {
    compressed: false,
    payload: bytesToBase64Url(new TextEncoder().encode(text))
  };
}

export async function decompressGzipBase64Url(payload: string, compressed: boolean): Promise<string> {
  const bytes = base64UrlToBytes(payload);
  if (compressed && typeof DecompressionStream !== 'undefined') {
    const ds = new DecompressionStream('gzip');
    const writer = ds.writable.getWriter();
    await writer.write(bytes as BufferSource);
    await writer.close();
    const response = new Response(ds.readable);
    const buffer = await response.arrayBuffer();
    return new TextDecoder().decode(buffer);
  }
  return new TextDecoder().decode(bytes);
}
