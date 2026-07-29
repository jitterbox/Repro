import { createHash } from 'node:crypto';
import { access, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

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

let sharedBrowser: Browser | undefined;
let sharedPage: Page | undefined;

export function cardCacheKey(card: CardSpec): string {
  const payload = JSON.stringify({ kind: card.kind, props: card.props });
  return createHash('sha256').update(payload).digest('hex');
}

export async function closeCompositor(): Promise<void> {
  await sharedPage?.close();
  await sharedBrowser?.close();
  sharedBrowser = undefined;
  sharedPage = undefined;
}

async function getSharedPage(): Promise<Page> {
  if (!sharedBrowser) {
    sharedBrowser = await chromium.launch();
  }
  if (!sharedPage) {
    sharedPage = await sharedBrowser.newPage({
      viewport: { width: W, height: H },
      deviceScaleFactor: DSF,
    });
  }
  return sharedPage;
}

function buildPageHtml(markup: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
${themeCss}
html,body{margin:0;padding:0;width:${W}px;height:${H}px;overflow:hidden;
background:transparent;}
#root{width:${W}px;height:${H}px;position:relative;}
</style></head>
<body><div id="root">${markup}</div></body></html>`;
}

async function cacheHit(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function renderCardPng(
  page: Page,
  card: CardSpec,
  cachePath: string,
): Promise<void> {
  const markup = renderToStaticMarkup(
    React.createElement(CardView, { card }),
  );
  await page.setContent(buildPageHtml(markup), { waitUntil: 'load' });
  await page.screenshot({
    path: cachePath,
    omitBackground: true,
    type: 'png',
  });
}

async function renderOneCard(
  page: Page,
  card: CardSpec,
  outDir: string,
): Promise<RenderResult> {
  const key = cardCacheKey(card);
  const cacheDir = join(outDir, '.cache');
  const cachePath = join(cacheDir, `${key}.png`);

  if (!(await cacheHit(cachePath))) {
    await mkdir(cacheDir, { recursive: true });
    await renderCardPng(page, card, cachePath);
  }

  return { id: card.id, path: cachePath, width: W, height: H };
}

export async function renderCards(input: {
  cards: CardSpec[];
  outDir: string;
}): Promise<RenderResult[]> {
  const page = await getSharedPage();
  const results: RenderResult[] = [];
  for (const card of input.cards) {
    results.push(await renderOneCard(page, card, input.outDir));
  }
  return results;
}
