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

| Surface                 | Observed                                                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| DOM overlay             | Present in `page.screenshot` (`overlay-dom.png`)                                                                       |
| CDP inspector highlight | Requires `DOM.enable` first; highlight geometry is available as data; screenshot artifact written as `overlay-cdp.png` |
| `page.screencast` API   | Present in Playwright 1.62 (`playwrightScreencastApi: true`)                                                           |

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

| Path                       | Wall time |
| -------------------------- | --------: |
| `maskedmerge` + `gblur`    |    1.378s |
| chained N=1                |    0.888s |
| chained N=5                |    1.017s |
| chained N=20               |    1.638s |
| `maskedmerge` + `pixelize` |    0.901s |

**Superseded decision.** The benchmark originally selected one mask video plus
`maskedmerge` and pixelation. The moving-field canary corpus later demonstrated
readable residual text in that output despite an OCR pass; pixelation cannot be
treated as irreversible redaction. Production now uses opaque `drawbox` fills
with outward rounding and input-resolution scaling. Actual pixel tests cover
untouched, moved, scrolled and popup fields, with an unmasked export rejection.
The benchmark remains historical performance evidence, not privacy acceptance.
Optimizing large numbers of opaque regions remains work to do without weakening
full pixel replacement.

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
3. Privacy redaction replaces measured regions with opaque pixels; OCR is an additional gate, not proof that pixelated text is unreadable.
4. rrweb must block `[data-repro-overlay]`.
5. BT.709 limited-range encode path is explicit, not assumed.
6. Multi-page = multi-timeline + deterministic cuts.

## Native screencast acceptance (Playwright 1.62.0)

Decision: retain CDP as the production default. `repro experiment-native --out-dir <dir>` uses identical pages and real popups with each capture owner independently. It separately exercises no tracing, DOM snapshot tracing, and screenshot-enabled tracing; registrations are awaited before fixture actions. The experiment is deliberately not a promotion switch.

The latest implementation-host run passed all three CDP cases. Native passed snapshot tracing but rejected a 960×720 popup frame in the plain case and an 800×450 main-page frame with screenshot tracing, against the required 1280×720 viewport. Earlier runs also observed intermittent CDP popup rejections. All attempts remain diagnostic evidence; a subsequent pass does not erase an earlier failure. Rejected frame reports now retain page identity, source-relative time, actual dimensions and drop counts.

Screenshot-enabled tracing shares Playwright's screencast and can override requested dimensions; see [Playwright Screencast.start](https://playwright.dev/docs/api/class-screencast#screencast-start). Repro-owned traces now request DOM snapshots without screenshots so the evidence recorder owns pixel capture. Actual applied settings are recorded in `environment.reproTracing`. External Playwright tracing/video configuration can still introduce another capture owner and must be considered separately.

A public CLI scenario with snapshot tracing preserved stationary intervals, a brief color change and the recording end; transition errors were 30–42 ms, within two frames at 30 FPS. Damaged copies of its decoded frame sequence (compressed holds, missing brief interval, truncated ending) were rejected. This does not establish native clean-pixel parity or an overhead advantage; promotion remains deferred. Frame tables, traces and experiment reports remain local diagnostic artifacts.
