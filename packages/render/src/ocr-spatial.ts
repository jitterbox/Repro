import { findRedactionHits } from '@jitterbox/repro-core/redactor';
import type { OcrHit } from './redaction.js';

interface Word {
  text: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
  paragraph: string;
  line: number;
}

/** Preserve OCR reading order and geometry. Whitespace between table cells is not text. */
export function spatialOcrHits(tsv: string, patterns: readonly string[] = []) {
  const pages = new Map<number, Word[]>();
  const rows = tsv.trimEnd().split(/\r?\n/);
  if (!rows[0]?.startsWith('level\tpage_num\t'))
    throw new Error('Invalid OCR TSV');
  for (const row of rows.slice(1)) {
    const columns = row.split('\t');
    const [
      level,
      page,
      block,
      paragraph,
      line,
      ,
      x,
      y,
      width,
      height,
      confidence,
    ] = columns.slice(0, 11).map(Number);
    if (level === 1 && page && width && height) pages.set(page, []);
    if (level !== 5) continue;
    const text = columns.slice(11).join('\t').trim();
    if (!text) continue;
    if (
      !page ||
      !pages.has(page) ||
      [x, y, width, height, confidence, line].some((v) => !Number.isFinite(v))
    )
      throw new Error('Invalid OCR word geometry');
    required(pages.get(page)).push({
      text,
      x: required(x),
      y: required(y),
      width: required(width),
      height: required(height),
      confidence: required(confidence) / 100,
      paragraph: `${block}/${paragraph}`,
      line: required(line),
    });
  }
  return new Map(
    [...pages].map(([page, words]) => {
      const lines: Word[][] = [];
      for (const word of words) {
        const previous = lines.at(-1)?.[0];
        if (
          previous?.paragraph !== word.paragraph ||
          previous.line !== word.line
        )
          lines.push([]);
        required(lines.at(-1)).push(word);
      }
      const groups: { words: Word[]; split: boolean }[] = [];
      for (const line of lines) {
        const parts: Word[][] = [[]];
        for (const word of line) {
          const last = required(parts.at(-1)).at(-1);
          if (
            last &&
            word.x - last.x - last.width >
              2 * Math.max(last.height, word.height)
          )
            parts.push([]);
          required(parts.at(-1)).push(word);
        }
        const previous = groups.at(-1),
          first = line[0],
          last = previous?.words.at(-1);
        if (!first) continue;
        // Wrapped text can continue within one paragraph. Split table rows cannot.
        if (
          parts.length === 1 &&
          previous?.split === false &&
          last?.paragraph === first.paragraph &&
          first.line === last.line + 1 &&
          first.y >= last.y &&
          first.y - last.y - last.height <=
            1.5 * Math.max(first.height, last.height) &&
          Math.abs(first.x - required(previous.words[0]).x) <=
            Math.max(first.height, last.height)
        ) {
          previous.words.push(...line);
        } else
          for (const part of parts)
            groups.push({ words: part, split: parts.length > 1 });
      }
      const hits: OcrHit[] = [];
      for (const group of groups) {
        let text = '';
        const spans = group.words.map((word) => {
          if (text) text += ' ';
          const start = text.length;
          text += word.text;
          return { word, start, end: text.length };
        });
        for (const hit of findRedactionHits(text)) {
          const selected = spans
            .filter((s) => s.start < hit.end && s.end > hit.start)
            .map((s) => s.word);
          const x = Math.min(...selected.map((w) => w.x)),
            y = Math.min(...selected.map((w) => w.y));
          hits.push({
            text: hit.text,
            detector: hit.entity,
            confidence: Math.max(
              0,
              Math.min(...selected.map((w) => w.confidence)),
            ),
            rect: {
              x,
              y,
              width: Math.max(...selected.map((w) => w.x + w.width)) - x,
              height: Math.max(...selected.map((w) => w.y + w.height)) - y,
            },
          });
        }
      }
      // Explicit secret patterns and canaries remain conservative across geometry boundaries.
      const text = words.map((w) => w.text).join(' ');
      for (const pattern of patterns)
        if (text.includes(pattern))
          hits.push({
            text: pattern,
            confidence: 1,
            detector: 'explicit-pattern',
          });
      for (const match of text.matchAll(
        /\brepro-canary-secret-[a-z0-9-]+\b/giu,
      ))
        hits.push({ text: match[0], confidence: 1, detector: 'canary' });
      return [page, hits];
    }),
  );
}

function required<T>(value: T | null | undefined): T {
  if (value === undefined || value === null)
    throw new Error('Incomplete OCR data');
  return value;
}
