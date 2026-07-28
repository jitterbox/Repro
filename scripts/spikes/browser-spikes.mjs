#!/usr/bin/env node
/**
 * Phase 0 browser spikes:
 * 1) CDP Overlay vs page.screencast compositing
 * 2) screencast + tracing client conflict + frame dimension assertion
 * 3) rrweb overhead + overlay exclusion probe
 * 4) color management / multi-page / CSP notes via runtime probes
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../../docs/spike-artifacts/browser');
await mkdir(OUT, { recursive: true });

const results = {
  overlayCompositing: {},
  screencastTracing: {},
  rrweb: {},
  colorAndCsp: {},
  multiPage: {},
};

function htmlDoc(body) {
  return `<!doctype html><html><head><meta charset="utf-8">
<style>
body{font-family:system-ui;margin:40px;background:#f4f4f5;color:#111}
#card{width:420px;padding:24px;background:#fff;border:1px solid #ddd;border-radius:8px}
input{width:100%;padding:8px;margin:8px 0}
.overlay-box{position:fixed;left:80px;top:80px;width:200px;height:60px;
  background:rgba(255,0,0,.45);border:3px solid red;z-index:9999;
  display:flex;align-items:center;justify-content:center;font-weight:700}
</style></head><body>${body}</body></html>`;
}

async function spikeOverlayCompositing(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  await page.setContent(
    htmlDoc(`<div id="card"><h1>Overlay spike</h1>
      <input id="email" value="secret@example.com"/>
      <div class="overlay-box" id="dom-overlay">DOM OVERLAY</div></div>`),
  );

  const frames = { dom: [], cdp: [], both: [] };
  async function capture(label, setup) {
    await setup(page);
    const session = await page.context().newCDPSession(page);
    await session.send('Page.enable');
    const bucket = [];
    session.on('Page.screencastFrame', async (ev) => {
      bucket.push({
        sessionId: ev.sessionId,
        w: ev.metadata?.deviceWidth,
        h: ev.metadata?.deviceHeight,
        ts: ev.metadata?.timestamp,
        bytes: Buffer.from(ev.data, 'base64').length,
      });
      await session.send('Page.screencastFrameAck', { sessionId: ev.sessionId });
    });
    await session.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 80,
      maxWidth: 1280,
      maxHeight: 720,
      everyNthFrame: 1,
    });
    await page.waitForTimeout(400);
    await session.send('Page.stopScreencast');
    frames[label] = bucket;
    // Save one sample frame for visual inspection
    if (bucket.length) {
      // Re-run a single CDP capture via screenshot for artifact
      const png = await page.screenshot({ type: 'png' });
      await writeFile(path.join(OUT, `overlay-${label}.png`), png);
    }
    await session.detach().catch(() => {});
  }

  await capture('dom', async () => {
    /* DOM overlay already present */
  });

  await capture('cdp', async (p) => {
    await p.evaluate(() => {
      document.getElementById('dom-overlay')?.remove();
    });
    const session = await p.context().newCDPSession(p);
    await session.send('DOM.enable');
    await session.send('Overlay.enable');
    // Compositor-debug family (paint/layout-shift rects)
    await session.send('Overlay.setShowPaintRects', { result: true }).catch(
      () => {},
    );
    await session
      .send('Overlay.setShowLayoutShiftRegions', { result: true })
      .catch(() => {});
    // Inspector-overlay family
    await session.send('Overlay.highlightRect', {
      x: 80,
      y: 80,
      width: 200,
      height: 60,
      color: { r: 0, g: 128, b: 255, a: 0.45 },
      outlineColor: { r: 0, g: 0, b: 255, a: 1 },
    });
    await writeFile(
      path.join(OUT, 'overlay-cdp.png'),
      await p.screenshot({ type: 'png' }),
    );
    await p.waitForTimeout(200);
    await session.send('Overlay.hideHighlight').catch(() => {});
    await session
      .send('Overlay.setShowPaintRects', { result: false })
      .catch(() => {});
    await session.detach().catch(() => {});
  });

  // Playwright page.screencast API if available
  let playwrightScreencastApi = false;
  if (typeof page.screencast?.start === 'function') {
    playwrightScreencastApi = true;
    const dims = [];
    await page.screencast.start({
      onFrame: async (frame) => {
        dims.push({
          width: frame.width,
          height: frame.height,
          timestamp: frame.timestamp,
          bufferBytes: frame.buffer?.byteLength ?? 0,
        });
      },
    });
    await page.waitForTimeout(500);
    await page.screencast.stop();
    results.overlayCompositing.playwrightScreencastFrames = dims.slice(0, 5);
    results.overlayCompositing.frameDimensionStable =
      dims.length > 1 &&
      dims.every((d) => d.width === dims[0].width && d.height === dims[0].height);
  }

  results.overlayCompositing = {
    ...results.overlayCompositing,
    playwrightScreencastApi,
    domFrameCount: frames.dom.length,
    cdpFrameCount: frames.cdp.length,
    finding:
      'DOM overlays appear in page.screenshot and CDP screencast. ' +
      'CDP Overlay.highlightRect is compositor-level and may not appear in ' +
      'screencast/screenshot the same way; prefer DOM/shadow overlays for ' +
      'guaranteed capture compositing.',
    artifacts: ['overlay-dom.png', 'overlay-cdp.png'],
  };

  await context.close();
}

async function spikeScreencastTracing(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  await page.setContent(htmlDoc(`<h1>Tracing conflict</h1><div id="t">0</div>
<script>
setInterval(()=>{const el=document.getElementById('t'); el.textContent=String(+el.textContent+1)},50);
</script>`));

  let conflictError = null;
  let bothWorked = false;
  const dims = [];
  try {
    await context.tracing.start({ screenshots: true, snapshots: true });
    if (typeof page.screencast?.start === 'function') {
      await page.screencast.start({
        onFrame: async (frame) => {
          dims.push({ w: frame.width, h: frame.height });
        },
      });
      await page.waitForTimeout(600);
      await page.screencast.stop();
      bothWorked = dims.length > 0;
    } else {
      // Fall back: concurrent CDP screencast while tracing
      const session = await context.newCDPSession(page);
      await session.send('Page.enable');
      session.on('Page.screencastFrame', async (ev) => {
        dims.push({
          w: ev.metadata?.deviceWidth,
          h: ev.metadata?.deviceHeight,
        });
        await session.send('Page.screencastFrameAck', { sessionId: ev.sessionId });
      });
      await session.send('Page.startScreencast', {
        format: 'jpeg',
        quality: 70,
        maxWidth: 1280,
        maxHeight: 720,
        everyNthFrame: 1,
      });
      await page.waitForTimeout(600);
      await session.send('Page.stopScreencast');
      bothWorked = dims.length > 0;
      await session.detach().catch(() => {});
    }
    await context.tracing.stop({ path: path.join(OUT, 'trace.zip') });
  } catch (err) {
    conflictError = String(err?.message ?? err);
  }

  const uniqueDims = [...new Set(dims.map((d) => `${d.w}x${d.h}`))];
  results.screencastTracing = {
    bothWorked,
    conflictError,
    frameCount: dims.length,
    uniqueDimensions: uniqueDims,
    dimensionStable: uniqueDims.length <= 1,
    recommendation:
      bothWorked && !conflictError
        ? 'Concurrent tracing + screencast succeeded in this environment; still isolate clients in production to avoid CDP session races.'
        : 'Conflict or failure observed; run screencast and tracing on separate contexts/pages or serialize stages.',
  };
  await context.close();
}

async function spikeRrweb(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  // Minimal rrweb-like MutationObserver cost probe + overlay exclusion
  await page.setContent(
    htmlDoc(`<div id="app"><h1>rrweb spike</h1>
      <input id="ssn" value="123-45-6789"/>
      <div id="list"></div></div>
      <div id="repro-overlay" data-repro-overlay="1"
        style="position:fixed;inset:0;pointer-events:none;z-index:2147483647">
        <div style="position:absolute;left:20px;top:20px;background:#000c;color:#fff;padding:8px">
          OVERLAY EXCLUDE ME
        </div>
      </div>
<script>
window.__repro = { mutations: 0, excluded: 0 };
const overlay = document.getElementById('repro-overlay');
const obs = new MutationObserver((recs) => {
  for (const r of recs) {
    window.__repro.mutations++;
    const t = r.target;
    if (overlay.contains(t) || t === overlay) window.__repro.excluded++;
  }
});
obs.observe(document.documentElement, {
  subtree: true, childList: true, attributes: true, characterData: true
});
// Simulate app mutations
const list = document.getElementById('list');
let i = 0;
window.__timer = setInterval(() => {
  const d = document.createElement('div');
  d.textContent = 'row ' + (i++);
  list.appendChild(d);
  // Mutate overlay too
  overlay.firstElementChild.textContent = 'OVERLAY ' + i;
}, 16);
</script>`),
  );

  const t0 = performance.now();
  await page.waitForTimeout(1000);
  const wallMs = performance.now() - t0;
  const stats = await page.evaluate(() => {
    clearInterval(window.__timer);
    return window.__repro;
  });

  // Measure long-task impact with performance.now loops
  const overhead = await page.evaluate(async () => {
    const work = () => {
      let x = 0;
      for (let i = 0; i < 2e6; i++) x += i;
      return x;
    };
    const a = performance.now();
    work();
    const baseline = performance.now() - a;
    // Attach heavier observer mimicking rrweb
    let count = 0;
    const obs = new MutationObserver(() => {
      count++;
    });
    obs.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    const b = performance.now();
    work();
    const withObs = performance.now() - b;
    obs.disconnect();
    return { baseline, withObs, delta: withObs - baseline, mutationCallbacks: count };
  });

  results.rrweb = {
    wallMs: Math.round(wallMs),
    mutations: stats.mutations,
    overlayMutationsSeen: stats.excluded,
    exclusionStrategy:
      'Mark overlay host with data-repro-overlay and exclude via rrweb ' +
      'record options (slimDOM / mask / sampling) plus blockClass / ignoreSelector.',
    overhead,
    finding:
      'Overlay mutations are visible to a naive MutationObserver; production ' +
      'must exclude [data-repro-overlay] from rrweb record options.',
  };
  await context.close();
}

async function spikeColorCspMultiPage(browser) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    colorScheme: 'light',
  });
  const page = await context.newPage();

  // CSP without unsafe-inline / blob — probe injection constraints
  await page.route('**/csp.html', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      headers: {
        'Content-Security-Policy':
          "default-src 'none'; script-src 'nonce-repro'; style-src 'unsafe-inline'; img-src 'self' data:",
      },
      body: `<!doctype html><html><head>
<meta charset="utf-8">
<title>CSP</title>
</head><body>
<h1 id="ok">CSP page</h1>
<script nonce="repro">window.__cspOk=true;</script>
</body></html>`,
    });
  });

  await page.goto('https://example.local/csp.html');
  let initScriptRan = false;
  try {
    await page.addInitScript(() => {
      window.__reproInit = true;
    });
    await page.reload();
    initScriptRan = await page.evaluate(() => window.__reproInit === true);
  } catch (err) {
    results.colorAndCsp.initScriptError = String(err?.message ?? err);
  }

  // Color management probe
  const color = await page.evaluate(() => ({
    colorGamut: matchMedia('(color-gamut: p3)').matches
      ? 'p3'
      : matchMedia('(color-gamut: srgb)').matches
        ? 'srgb'
        : 'unknown',
    dpr: devicePixelRatio,
  }));

  // Multi-page: popup
  const page2Promise = context.waitForEvent('page');
  await page.evaluate(() => {
    window.open('about:blank', '_blank');
  });
  const page2 = await page2Promise;
  await page2.setContent('<h1>Popup</h1>');
  const pages = context.pages().map((p) => p.url());

  results.colorAndCsp = {
    ...results.colorAndCsp,
    initScriptRan,
    color,
    cspFinding:
      'addInitScript runs as an extension-like world in Playwright and is ' +
      'generally CSP-tolerant compared to injected <script> tags; still avoid ' +
      'innerHTML and eval in the probe IIFE.',
  };
  results.multiPage = {
    pageCount: context.pages().length,
    urls: pages,
    finding:
      'Each Page needs its own screencast session; stitch with hard cuts and ' +
      'chapter markers at page-focus transitions.',
  };

  await context.close();
}

const browser = await chromium.launch({ headless: true });
try {
  await spikeOverlayCompositing(browser);
  await spikeScreencastTracing(browser);
  await spikeRrweb(browser);
  await spikeColorCspMultiPage(browser);
} finally {
  await browser.close();
}

await writeFile(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
