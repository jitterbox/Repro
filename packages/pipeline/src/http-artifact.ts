import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';

/** A single range is sufficient for browser seeking; multipart ranges are rejected. */
export function byteRange(
  header: string,
  size: number,
): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || size === 0) return null;
  const start = match[1]
    ? Number(match[1])
    : Math.max(0, size - Number(match[2]));
  const end =
    match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= size ||
    end < start
  )
    return null;
  return { start, end };
}

export async function serveArtifact(
  req: IncomingMessage,
  res: ServerResponse,
  file: string,
): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end();
    return;
  }
  const { size } = await stat(file);
  res.setHeader('Accept-Ranges', 'bytes');
  const range = req.headers.range
    ? byteRange(req.headers.range, size)
    : undefined;
  if (range === null) {
    res.writeHead(416, { 'Content-Range': `bytes */${size}` });
    res.end();
    return;
  }
  if (range) {
    res.statusCode = 206;
    res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
  }
  res.setHeader('Content-Length', range ? range.end - range.start + 1 : size);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  await pipeline(createReadStream(file, range), res);
}
