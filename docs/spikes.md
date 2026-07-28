# Phase 0 spikes

Recorded on 2026-07-27 against local toolchain:

- Node v22.22.3
- Playwright 1.62 / Chromium 151.0.7922.34
- ffmpeg 8.0.1 (`maskedmerge`, `gblur`, `pixelize`, `zscale` present)
- CPU-only Linux host

Artifacts live under `docs/spike-artifacts/`.

## 1. CDP Overlay vs screencast compositing

**Question.** Do CDP Overlay highlights composite into
`Page.startScreencast` / `page.screencast`?

**Method.** `scripts/spikes/browser-spikes.mjs` captures:

1. DOM overlay (`position:fixed` red box)
2. CDP `Overlay.highlightRect` after `DOM.enable` + `Overlay.enable`, plus
   compositor-debug toggles (`setShowPaintRects`,
   `setShowLayoutShiftRegions`)
3. Playwright `page.screencast.start({ onFrame })` when available

**Results.**

| Surface | Observed |
| --- | --- |
| DOM overlay | Present in `page.screenshot` (`overlay-dom.png`) |
| CDP inspector highlight | Requires `DOM.enable` first; highlight geometry is available as data; screenshot artifact written as `overlay-cdp.png` |
| `page.screencast` API | Present in Playwright 1.62 (`playwrightScreencastApi: true`) |

**Decision.** Prefer closed shadow-DOM / probe overlays for guaranteed capture
compositing. Treat CDP inspector overlays as non-authoritative for burned-in
pixels. Use compositor-debug overlays only when a runtime probe confirms they
appear in the screencast frames; otherwise draw from
`Overlay.getHighlightObjectForTest`-style geometry in the probe.

`Overlay.setShowHitTestBorders` / `setShowWebVitals` remain documented as
no-ops — hit testing stays in-page via `document.elementsFromPoint`.

## 2. Screencast / tracing client conflict + frame dimensions

**Question.** Does `context.tracing.start()` steal the screencast client and
silently shrink frames?

**Results.**

- Concurrent tracing + `page.screencast` **succeeded** in this environment
  (`bothWorked: true`, `conflictError: null`, 12 frames).
- Frame metadata from the Playwright screencast callback did not always expose
  width/height on the first frame (`bufferBytes: 0` observed once; SOF parsing
  is still required).

**Decision.**

1. Keep production isolation: do not share one CDP screencast client across
   tracers and capture.
2. Assert actual JPEG dimensions from the SOF marker on the first persisted
   frame and fail fast if they diverge from the requested size
   (`packages/capture` `jpeg-dims.ts`).
3. Record dropped-frame counts; never treat silent 480p fallback as success.

## 3. Redaction filtergraph benchmark

**Question.** Is `gblur`/`pixelize` + `maskedmerge` O(1) in region count vs N
chained `crop`/`boxblur`/`overlay` stages?

**Method.** `scripts/spikes/redaction-bench.sh` on 1280×720@30 for 4s.

| Path | Wall time |
| --- | ---: |
| `maskedmerge` + `gblur` | 1.378s |
| chained N=1 | 0.888s |
| chained N=5 | 1.017s |
| chained N=20 | 1.638s |
| `maskedmerge` + `pixelize` | 0.901s |

**Decision.** Use **one** mask video + `maskedmerge`. Prefer **pixelize** for
irreversible redaction; keep `gblur` only for non-secret emphasis. Do not scale
filtergraphs linearly with region count. Expand masks to a full-width viewport
band during scroll + 200ms trailing window (implemented in render redaction
filters).

## 4. rrweb overhead + overlay exclusion

**Question.** Does a MutationObserver / rrweb-style recorder see probe overlay
mutations, and can we exclude them?

**Results.**

- 1s mutation stress: 124 mutations, **62 from the overlay subtree**.
- Overlay mutations are visible to a naive observer.
- `addInitScript` ran under a strict CSP page (`script-src 'nonce-repro'`).

**Decision.**

- Mark the host with `data-repro-overlay="1"`.
- Exclude via rrweb `blockSelector: '[data-repro-overlay]'` (and related
  ignore/block options). Never leave a full-viewport placeholder.
- Keep defaults inverted-safe: `maskAllInputs: true`,
  `maskTextSelector: '*'`, unmask by allowlist only.
- Probe must remain CSP-safe: no `innerHTML`, no `eval`, closed shadow root,
  `inert` + `pointer-events: none`.

## 5. Color pipeline (probe)

**Results.** Headless Chromium reported `color-gamut: srgb`, `dpr: 1`.
ffmpeg exposes both `zscale` and `scale`.

**Decision.** Decode JPEG → known RGBA working space, explicitly convert to
limited-range BT.709, tag container + bitstream
(`-color_primaries/trc/colorspace bt709 -color_range tv`), verify with
`ffprobe`. Prefer `zscale` when available. Fixture ramps remain a release gate
item under evaluation.

## 6. Multi-page first-paint

**Results.** Popup via `window.open` yielded `pageCount: 2`. Each page needs its
own screencast session.

**Decision.** Editorial cuts follow action-owning page → focused page →
configured primary page. Hard cuts + chapter markers at focus transitions.
Picture-in-picture deferred.

## 7. Strict-page compatibility

**Results.** `page.addInitScript` survived CSP reload (`initScriptRan: true`).

**Decision.** Ship the probe as a prebundled IIFE for `addInitScript`. Fail soft
in sandboxed/cross-origin frames and closed shadow roots without weakening
page CSP/Trusted Types.

## Locked design consequences

1. Probe/DOM overlays for burned-in viz; CDP geometry as data.
2. JPEG SOF dimension assertion is mandatory.
3. Pixel redaction uses mask video + `maskedmerge` (+ pixelize for secrets).
4. rrweb must block `[data-repro-overlay]`.
5. BT.709 limited-range encode path is explicit, not assumed.
6. Multi-page = multi-timeline + deterministic cuts.
