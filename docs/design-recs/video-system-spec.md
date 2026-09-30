# Repro — Evidence Video System spec (Rev A)

> Historical design proposal. Its hybrid ASS/static-card architecture was retired. Current rendering, typography, layout, and limitations are documented in [Scene renderer](../scene-renderer.md) and [Configuration](../configuration.md).


Companion to [`design-brief.md`](design-brief.md). The brief says what the product
should feel like; this document says what to build, in what order, and against
which contracts. Where the two disagree, this document is newer.

Visual reference: `Repro Video System.dc.html` (design canvas).

| Artifact | Path |
| --- | --- |
| Token source | [`../../packages/contracts/tokens/overlay-theme.tokens.json`](../../packages/contracts/tokens/overlay-theme.tokens.json) |
| Theme schema | [`../../packages/contracts/schemas/overlay-theme.schema.json`](../../packages/contracts/schemas/overlay-theme.schema.json) |
| Annotation v2 | [`../../packages/contracts/schemas/annotation.v2.schema.json`](../../packages/contracts/schemas/annotation.v2.schema.json) |
| Timeline | [`../../packages/contracts/schemas/timeline.schema.json`](../../packages/contracts/schemas/timeline.schema.json) |
| Compare composition | [`../../packages/contracts/schemas/compare-composition.schema.json`](../../packages/contracts/schemas/compare-composition.schema.json) |
| Slate | [`../../packages/contracts/schemas/slate.schema.json`](../../packages/contracts/schemas/slate.schema.json) |

Canonical copies live under `packages/contracts/`. The files in this directory
are retained as design-review snapshots only.

---

## 1. Baseline — what ships today

Frames extracted from `.repro/fixture-videos/*/render/annotated.mp4`:

- **No opening slate.** `specCardAnnotations()` emits a 40px label plate at
  (24,24) carrying only `metadata.specTitle`. No bug ID, browser, OS, viewport,
  profile or mode.
- **Every callout is the same anonymous plate.** `baseAnnotation()` hard-codes
  `severity: 'info'`, `height: 40`, `kind: 'info'`, `timeRange` 1800ms.
  `ass.ts` declares three styles and ignores `severity`, `shape`, `lineStyle`
  and `icon`.
- **Callouts are unanchored.** Unanchored boxes are seeded at the largest
  low-variance rect, which is the middle of the page, so the plate floats over
  content while the target sits unmarked.
- **`repro-console-multi` contains no console overlay.** `consoleAnnotations()`
  matches on `event.kind.includes('console')` only; CDP `exception` events —
  a legal `ReproEvent.type` — are dropped.
- **Timing is applied after compositing.** In `buildFilterGraph()` the chain is
  `redact → ass → overlay → setpts/tpad`. The ASS file is authored in capture
  time, then the timebase moves underneath it.
- **`pauses` uses `tpad`,** which clones frames onto the *end* of the clip
  rather than holding at the beat. No `PAUSED` badge, no speed chip.
- **Compare never encodes.** `compareRepros()` returns six ffmpeg filter
  *strings*. No composite MP4, no BEFORE/AFTER labels, no Δ captions, no
  alignment applied. `blinkLayout` alternates on `mod(N,2)` — 15 Hz at 30 fps,
  a seizure hazard.
- **Videos run 1.9–4.9s.**

### Root causes

| # | Cause | Location |
| --- | --- | --- |
| R1 | Time surgery after burn-in | `render/src/filtergraph.ts` |
| R2 | No output-time model (`durationMs = max(t_mono)`) | `plan/src/planner.ts`, `features.ts` |
| R3 | One plate for every finding | `plan/src/features.ts`, `render/src/ass.ts` |
| R4 | Compare stops at filter strings | `compare/src/compare.ts`, `layouts.ts` |

---

## 2. Design decisions

**Two visual languages, deliberately.** Docs and the packaged viewer take the
Broadsheet system (serif, paper, whitespace). **Burned-in video chrome does
not.** It sits over an unknown application at unknown contrast, must survive
H.264 at 1×, and must render identically in libass on CI. It stays neutral
instrumentation: DejaVu Sans on dark plates, colour only ever semantic.

**Burn-in face is DejaVu Sans.** Present in every Debian/Alpine render image,
metric-stable across libass versions, carries tabular figures. libass resolves
through fontconfig; a missing family silently falls back and reflows every
plate. Do not substitute a webfont.

**Target video length:** 15–30s for a filed repro. Warn below 8s, warn above 45s.

### Minimum hold budget

| Beat | Min | Typical | Rule |
| --- | --- | --- | --- |
| Opening slate | 2.0s | 2.2s | +0.15s per meta row beyond six |
| Chapter / step title | 1.6s | 2.0s | ≥ 220ms per word |
| Callout label | 1.4s | 2.0s | ≥ 45ms per character |
| Console toast | 2.2s | 2.6s | Extends to cover the trigger ring |
| Pause hold | 1.0s | 1.4s | Frame clone at the beat, not the tail |
| Slow-mo segment | 1.2s | 1.6s | Stretch until ≥ min; factor derived |
| Outcome card | 2.5s | 2.5s | Always the last beat of `repro` |
| Compare beat | 3.0s | 4.0s | Per aligned step, both panes running |

### Safe zones (1280×720 @1×)

- 24px inset for HUD, badges and chips.
- Bottom 96px reserved for chapter / voiceover / console — **one occupant at a
  time**. If a toast and a chapter collide, the toast wins and the chapter is
  deferred to the next beat. Enforced in the planner.

---

## 3. Overlay kit

Fifteen named components. Each maps to exactly one feature flag from
`config.schema.json` and is named in `annotation.component`.

| Component | Flag | Renderer | Notes |
| --- | --- | --- | --- |
| `target-ring` | any highlight | ass | 3px severity stroke, radius 6, 1px `ring-halo` both sides, bounds = anchor bbox + 6px |
| `leader` | any displaced label | ass | 2px stroke, 8px head; only when the plate cannot seat within 24px of the anchor |
| `plate` | any callout | ass | `label-bg` fill, 4px severity bar, kicker + label + optional measurement, max 42 chars |
| `step-badge` | `steps` | ass | Top-left 24px inset, tabular counter, persists for the step |
| `progress-rail` | `steps` | ass | 4px bottom edge |
| `console-toast` | `consoleOverlay` | compositor | Bottom band, level chip + mono message + timestamp; paired with a 2px tint ring on the trigger |
| `pause-badge` | `pauses` | ass | Neutral plate, never red; states the hold duration |
| `speed-chip` | `slowmo` | ass | Persists for the whole slowed segment |
| `click-ripple` | `clickViz` | ass | Left cyan solid, right magenta dashed; 350ms; ≤3/s |
| `keystroke-pill` | `keystrokes` | ass | One cap per key; printable-in-field replaced with `•••` |
| `layout-shift-pair` | `layoutShiftViz` | ass | Dashed = was, solid = is, arrow = travel, caption carries score and Δ |
| `hit-target-guide` | `hitTargets` | ass | Actual in `remove`, required 24×24 dashed in `change` |
| `hidden-ghost` | `hiddenElements` | ass | Hatched fill + dashed edge in `before` slate blue |
| `stacking-labels` | `stackingContexts` | ass | Z-order stamped per layer; the losing layer gets the caption |
| `roi-magnifier` | `zoom` | compositor | PiP inset, dashed source rect left in place, factor stamped |
| `freeze-banner` | `freezeDetect` | ass | Filled `warn`; visually unlike `pause-badge`; states measured block ms |
| `vitals-hud` | `vitalsHud` | compositor | Corner chip, CLS/LCP/INP tabular |
| `redaction` | `redaction` | pre-overlay filter | Pixelize at source res, before any overlay; caption asserts the gate, never the value |
| `outcome-pair` | end of `repro` | compositor | Expected in `add`, actual in `remove`; the only permitted stacked plates |
| `slate` | `specCard` | compositor | Full-frame card, see §6 |

### Rules

**Do**
- Ring the defect, label beside it, leader only if displaced.
- State severity in words *and* colour *and* line style.
- One occupant of the bottom band; one primary callout per beat.
- Put every measurement in the plate — px, ms, score.

**Don't**
- Centre a plate over the page.
- Cover the target you are describing.
- Emit one overlay per `mousemove` — aggregate into a path.
- Use blink as the only encoding of a difference.

---

## 4. Timing model

Compile a **beat timeline** *before* anything is drawn. It owns trimming,
holds, slow-motion and inserted cards, and publishes a monotone `timeMap`.
Every annotation time is pushed through `mapTime()`; nothing else converts.

### Corrected filter graph

```text
# 1 · redact at source resolution, then normalise VFR → CFR
[0:v] maskedmerge/pixelize, fps=30            → [red]

# 2 · TIME SURGERY — split, retime, concat
[red] split=5                                 → [s0..s4]
[s0]  trim=2.4:5.0, setpts=PTS-STARTPTS       → [b1]
[s1]  trim=5.0:5.4, setpts=4.0*(PTS-STARTPTS) → [b2]   # 0.25x
[s2]  trim=5.4:5.4083,
      loop=loop=42:size=1, setpts=N/FR/TB     → [b3]   # 1.4s hold
[s3]  trim=5.4:7.0, setpts=PTS-STARTPTS       → [b4]
[s4]  trim=7.0:7.0083, loop=loop=72:size=1    → [b5]   # outcome bed
[b1][b2][b3][b4][b5] concat=n=5:v=1:a=0       → [body]

# 3 · prepend slate (compositor PNG, 2.2s)
[1:v] loop=loop=66:size=1, format=yuva420p    → [slate]
[slate][body] xfade=transition=fade:duration=0.32:offset=1.88 → [tl]

# 4 · overlays, authored in OUTPUT time
[tl]  ass='plan.ass'                          → [sub]
[sub][2:v] overlay=shortest=1                 → [ovl]  # RGBA layer

# 5 · furniture
[ovl] drawbox=progress-rail                   → [out]
```

`tpad` is removed entirely. A hold is a `loop` on a single trimmed frame
spliced in at the beat. `buildFilterGraph()` keeps its signature but takes a
`Timeline` instead of a bare `segments[]`.

**VFR warning:** the screencast is variable frame rate and `concat` on VFR
input drifts. Normalise with `fps=30` immediately after redaction, before any
trim.

---

## 5. Compare

The composite frame *is* the product. One `repro compare` run emits one or two
labelled composite MP4s — never six filter strings, never two unlabelled files.

### Layout selection (automatic, stated on the slate)

| Delta class | Layout |
| --- | --- |
| Geometry / reposition | `onion` |
| Colour, contrast, typography | `wipe` |
| Content or flow change | `side-by-side` |
| Sub-8px | `cropped-roi` |

### Layouts

- **side-by-side** — default. Two panes scaled to 612×345 at y=124, pane
  headers with a 4px `before`/`after` rule, bug ID and step counter across the
  top, Δ caption centred below the panes, shared playhead rail with 7 step
  ticks plus per-run raw duration bars underneath (the honest part: it shows
  where the warp absorbed the difference).
- **onion** — before composited under after at 45%; both positions ringed in
  pane colours; travel arrow between them; legend chip `ONION · BEFORE 45%`.
  Requires identical viewport and DSF (validator already enforces).
- **wipe** — divider travels left→right across the beat and rests at 50% for
  the final second so the still a reviewer pastes into the ticket is legible.
- **cropped-roi** — **new.** Shared crop around the union of geometry deltas,
  2.5× magnifier, both panes.
- **difference** — keep; needs `format=gbrp` before `blend` and a legend chip.
  Today's bare `eq=contrast=2` crushes sub-pixel deltas to black.
- **edge** — keep for type work; add the chip and a colour key (cyan A,
  magenta B).
- **blink** — **demoted.** Never default, opt-in flag only, clamp to 2 Hz, emit
  an a11y warning in the manifest whenever used.

### Synchronisation — anchored DTW

| Strategy | Behaviour | Verdict |
| --- | --- | --- |
| Step anchors only | Monotone and trustworthy, but panes slip inside a step | Correct, too coarse |
| DTW only | Matches on appearance — and appearance is what differs | Actively misleading |
| **Anchored DTW** | Anchors pin `stepStart` / `navigation` / `action`. Between anchors, DTW on a downscaled 32×18 luma signature, Sakoe–Chiba band ±250ms, path forced monotone, no segment stretched beyond 2.5× | **Ship this** |

Publish the warp as a `syncMap`: `[aMs, bMs, outMs, confidence]` knots, consumed
by the encoder, the viewer's dual player and the quality gate alike. Where
confidence < 0.6, print a `DRIFT` tick on the rail rather than pretending.

---

## 6. Opening slate

Full-frame card on `slate-bg`, held 2.2s, 320ms dissolve into frame 0.
Bug ID is the only accent-coloured element — it is the only thing that must
match the filename and the ticket.

Required for all modes: `bugId`, `title`, `browser`, `os`, `viewport`,
`profile`, `appLabel`. Also carried: locale/timezone, build SHA, capture
timestamp, step count, duration.

Variants:
- `repro` — accent `info`, mode chip + profile chip.
- `demo` — accent `add`, outcome stated up front (`EXPECTED PASS`), narration
  duration printed.
- `compare` — both run IDs and both builds, each under a 4px `before`/`after`
  rule using the pane colours the rest of the clip uses.

Build fails if bug ID, browser or viewport are missing. `repro quality` asserts
that the slate bug ID equals the filename bug ID.

---

## 7. Render engine — hybrid

| Approach | Buys | Costs | Verdict |
| --- | --- | --- | --- |
| ASS / libass only | No new deps, deterministic, fast, seekable; ~80% of the kit is reachable (text, rects, ellipses, `\p1` paths, `\fad`, `\move`, per-event colour) | No blur, no true rounded corners without hand-built Béziers, no image compositing, no text measurement; slate and compare chrome become vector spaghetti | Necessary, not sufficient |
| Frame compositor only | Everything exactly as designed, same CSS as the viewer, real text metrics, testable in a browser | Second renderer; ~30MB/s of RGBA at 720p if fully materialised; +4–10s per video; Chromium in the render image; determinism needs pinned fonts and fixed DSF | Right for the hard 20% |
| **Hybrid** | ASS for time-dense per-frame components; compositor for frame-sparse rich cards. Both read `overlay-theme`, so they cannot drift | Two code paths and one routing decision — carried as data in `annotation.renderer` | **Build this** |

**Routing rule:** if the component must move or change on most frames of its
span → ASS. If it is a still card that appears, holds and leaves → compositor.

Already present and unused: `render/src/skia-layer.ts` and the `skiaOverlays`
input to `buildFilterGraph()` already model an RGBA overlay stream.
`plan/src/collision.ts` and `variance-grid.ts` already implement placement
search. `compare/src/dtw.ts`, `align.ts` and `geometry-diff.ts` already produce
the alignment and the Δ numbers. This is wiring, not a rewrite.

---

## 8. Plan

| # | Phase | Effort | Files | Exit criterion |
| --- | --- | --- | --- | --- |
| P0 | Output time becomes an artifact | 1 sprint | `contracts/schemas/timeline.schema.json` *(new)*, `plan/src/timeline.ts` *(new)*, `plan/src/planner.ts`, `render/src/filtergraph.ts`, `render/src/encode-pipeline.ts`, `render/src/ass.ts` | A pause visibly holds at its beat; a 0.25× segment keeps its badge and label aligned; all twelve fixture videos land 15–30s; golden `timeline.json` byte-stable across two runs |
| P1 | The overlay kit | 2 sprints | `docs/overlay-theme.tokens.json` *(new)*, `render/src/theme.ts` *(new)*, `render/src/ass.ts` *(rewrite)*, `contracts/schemas/annotation.schema.json`, `plan/src/features.ts`, `plan/src/collision.ts`, `plan/src/text.ts` | No annotation centre-placed unless `chapter`/`slate`/`outcome`; every kit component appears in ≥1 fixture video; severity colours match tokens under pixel test |
| P2 | Slate & compositor | 1 sprint | `render/src/compositor/` *(new)*, `contracts/schemas/slate.schema.json` *(new)*, `probe/src/probe-source.ts`, `capture/src/environment.ts`, `alm/src/naming.ts` | Every mode's slate renders from real data; quality gate fails a video whose frame 30 is not a slate; slate ID and filename agree |
| P3 | Compare becomes a product | 2 sprints | `compare/src/sync.ts` *(new)*, `compare/src/composition.ts` *(new)*, `compare/src/layouts.ts` *(rewrite)*, `render/src/compare-encode.ts` *(new)*, `cli/src/bin.ts` (`render-compare`) | One `repro compare` run produces a labelled composite MP4; panes within ±2 frames at every anchor; Δ caption matches `geometry-diff` exactly |
| P4 | Evidence viewer | 1.5 sprints | `viewer/public/index.html`, `viewer/public/styles.css`, `viewer/src/viewer.ts`, `viewer/tokens/tokens.json` | Active annotation row tracks the playhead within 100ms; keyboard-complete; axe clean at all three themes; compare toggle stays synced while scrubbing |
| P5 | Gates that can see | 0.5 sprint, starts in P0 | `evaluation/src/index.ts`, `scripts/evaluation/run-golden.mjs`, `e2e-fixture/tests/feature-coverage.e2e.test.ts` | A video with zero visible overlays fails `repro quality` — which it currently passes |

**If you only fund one thing:** P0 + P1. Three sprints, no changes to capture,
ALM, redaction or the viewer, and every existing fixture video becomes usable
evidence.

### Risks

- **Determinism.** A Chromium compositor introduces font and rasterisation
  variance. Pin the image, pin the font set, render at DSF 1, hash the slate
  PNG in CI.
- **Concat on VFR input drifts.** Normalise to CFR right after redaction.
- **Anchor staleness.** A `sticky` anchor needs per-frame geometry. Where the
  capture only sampled at event time, degrade to `static` and mark
  `confidence < 1` rather than drawing a ring on empty pixels.
- **Scope creep into capture.** None of this requires changing Playwright
  capture. Resist it.

---

## 9. Acceptance criteria (machine-checkable)

1. Frame at `t=1.0s` is a slate containing bug ID, browser string and viewport;
   the bug ID equals the one in the filename.
2. Total duration 8–45s; a filed `repro` is 15–30s.
3. Every annotation is on screen for at least its component's minimum hold,
   measured in output frames.
4. No annotation whose `component` is not `chapter`, `slate` or `outcome` has
   its plate centre within 120px of frame centre.
5. No plate overlaps the bounding box of its own anchor by more than 10%.
6. Plate text contrast ≥ 4.5:1, sampled from the encoded frame.
7. At most one occupant of the bottom 96px band in any frame.
8. Compare output is a single file with both pane labels visible in every frame
   and at least one Δ caption.
9. At every sync anchor the two panes are within ±2 frames.
10. No luminance flash exceeds 2 Hz anywhere in the file.
11. Redaction masks present in every frame their span covers; no overlay drawn
    inside a mask rect.
12. Two consecutive runs of the same `controlled` capture produce byte-identical
    `timeline.json` and perceptually identical frames (pHash distance ≤ 2).

---

## 10. Doc change control

| Doc | Change |
| --- | --- |
| `docs/design-brief.md` | §6.2 gains the five new tokens; §15 rewritten per phase as it lands; §5.3 gains `component` names |
| `docs/ai-usage.md` | `compare.layout` gains `cropped-roi`; `blink` becomes opt-in; beat/duration guidance added to §5 |
| `README.md` | Add `repro render-compare` to the CLI section |
| `skills/repro-compare/SKILL.md` | Point at the composition document rather than the filter strings |
