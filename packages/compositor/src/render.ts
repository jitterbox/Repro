import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import {
  enumerateFonts,
  implementationDigest,
  withFileLock,
} from '@repro/core';
import { overlayTheme } from '@repro/contracts';
import { chromium, type Browser, type Page } from 'playwright';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CardView } from './card-view.js';
import { themeCss } from './theme.css.js';
import type { CardSpec, RenderResult } from './types.js';

const W = overlayTheme.viewport.width;
const H = overlayTheme.viewport.height;
const DSF = overlayTheme.viewport.deviceScaleFactor;
const require = createRequire(import.meta.url);
let sharedBrowser: Browser | undefined;
let sharedPage: Page | undefined;
// One reusable page is a bounded worker. A second caller must not replace its DOM.
let pending: Promise<void> = Promise.resolve();
function serialized<T>(work: () => Promise<T>): Promise<T> {
  const result = pending.then(work);
  pending = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
export function cardCacheKey(
  card: CardSpec,
  environment: unknown = null,
): string {
  return digest(
    Buffer.from(
      JSON.stringify({
        kind: card.kind,
        props: card.props,
        viewport: { width: W, height: H, scale: DSF },
        theme: overlayTheme,
        css: themeCss,
        renderer: implementationDigest(import.meta.url),
        node: process.version,
        environment,
      }),
    ),
  );
}
export async function closeCompositor(): Promise<void> {
  await serialized(async () => {
    try {
      await sharedPage?.close();
    } finally {
      await sharedBrowser?.close();
      sharedBrowser = undefined;
      sharedPage = undefined;
    }
  });
}
async function getSharedPage(): Promise<Page> {
  if (!sharedBrowser?.isConnected()) {
    sharedBrowser = await chromium.launch();
    sharedPage = undefined;
  }
  if (!sharedPage || sharedPage.isClosed())
    sharedPage = await sharedBrowser.newPage({
      viewport: { width: W, height: H },
      deviceScaleFactor: DSF,
    });
  return sharedPage;
}
function buildPageHtml(markup: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${themeCss}
html,body{margin:0;padding:0;width:${W}px;height:${H}px;overflow:hidden;background:transparent;}
#root{width:${W}px;height:${H}px;position:relative;}</style></head><body><div id="root">${markup}</div></body></html>`;
}
function digest(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}
async function cacheHit(path: string): Promise<boolean> {
  try {
    const [bytes, receipt] = await Promise.all([
      readFile(path),
      readFile(`${path}.json`, 'utf8'),
    ]);
    const parsed = JSON.parse(receipt) as { sha256?: string };
    return (
      parsed.sha256 === digest(bytes) &&
      bytes.subarray(1, 4).toString() === 'PNG' &&
      bytes.readUInt32BE(16) === W * DSF &&
      bytes.readUInt32BE(20) === H * DSF
    );
  } catch {
    return false;
  }
}
async function renderOneCard(
  card: CardSpec,
  outDir: string,
  environment: unknown,
): Promise<RenderResult> {
  const key = cardCacheKey(card, environment),
    cacheDir = join(outDir, '.cache'),
    cachePath = join(cacheDir, `${key}.png`);
  if (!(await cacheHit(cachePath))) {
    await mkdir(cacheDir, { recursive: true });
    await withFileLock(`${cachePath}.lock`, async () => {
      if (await cacheHit(cachePath)) return;
      const page = await getSharedPage();
      await page.setContent(
        buildPageHtml(
          renderToStaticMarkup(React.createElement(CardView, { card })),
        ),
        { waitUntil: 'load' },
      );
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const bytes = await page.screenshot({
        omitBackground: true,
        type: 'png',
      });
      const temporary = `${cachePath}.${randomUUID()}`;
      try {
        await writeFile(temporary, bytes, { flag: 'wx' });
        await writeFile(
          `${temporary}.json`,
          JSON.stringify({ sha256: digest(bytes) }),
          { flag: 'wx' },
        );
        await rename(temporary, cachePath);
        await rename(`${temporary}.json`, `${cachePath}.json`);
      } finally {
        await rm(temporary, { force: true });
        await rm(`${temporary}.json`, { force: true });
      }
    });
  }
  return { id: card.id, path: cachePath, width: W, height: H };
}
export async function renderCards(input: {
  cards: CardSpec[];
  outDir: string;
}): Promise<RenderResult[]> {
  return serialized(async () => {
    const fonts = await enumerateFonts();
    const environment = {
      fonts,
      playwright: (require('playwright/package.json') as { version: string })
        .version,
      unknownFonts: fonts.length ? null : randomUUID(),
    };
    const results: RenderResult[] = [];
    for (const card of input.cards)
      results.push(await renderOneCard(card, input.outDir, environment));
    return results;
  });
}
