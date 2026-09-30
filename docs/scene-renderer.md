> Release 0.3.0: [installation](installation.md), [configurable presentation](configuration.md), and [complete CLI/MCP/schema references](README.md) are now available. Windows x64 and Linux x64 use a platform-aware pinned headless-shell resolver. See CI results for actual platform validation; this does not promote the renderer.

# Scene renderer and application-defect corpus

The polished scene compositor is the only renderer. It has an accepted initial visual direction and an expanded application-defect corpus. Final-quality export remains gated by the acceptance work listed below.

## Single rendering path

`render RUN` always uses the polished scene compositor. The renderer switch, raw-event `annotate` command and FFmpeg `render-compare` command were removed. Use `render AFTER --baseline BEFORE` for scene comparisons. Numeric comparison reports remain separate from video rendering. Old onion/wipe/blink/difference encoders and the unused narration prototype were retired; they are not scene effects.

`@jitterbox/repro-render` now contains shared source sanitization, media inspection and privacy auditing, not an alternate presentation renderer. Captions, stills, source mappings and video all derive from the scene. Removal does not relax source-frame, privacy, OCR or final-quality acceptance requirements.

## Render a captured run

Capture through the normal committed scenario workflow. New runs retain hashed
pre-normalization frame files and a source index. Rendering requires these original frames; recapture when they are unavailable.

```sh
repro treatments --json
repro validate-treatment treatment.json
repro render RUN --treatment treatment.json
repro review RUN --presentation
repro export RUN --draft --out-dir acceptance-bundle
```

`--draft` permits an acceptance bundle, not a privacy bypass. OCR remains mandatory,
including with no configured custom patterns. Raw frames, event logs, compositions and diagnostic HTML remain local. Export includes a sanitized DevTools JSON report with selected events and source/output frame mappings by default; `--no-devtools` opts out. See [export configuration](configuration.md#work-item-names-and-browser-diagnostics). Final-quality scene export
is blocked until the renderer is promoted in a subsequent change.

Presentation edits use `render --evidence edited.json`. They retain the existing
execution-identity checks. Changed actions or missing observations require recapture.
Required treatments fail when their evidence is absent; there is no renderer fallback.

For already rendered before/after runs:

```sh
repro render AFTER --baseline BEFORE
# Faithful recordings are observational, never controlled comparison proof:
repro render AFTER --baseline BEFORE --observational
```

The first command applies the existing controlled-comparison proof checks.
The second requires matching executable/test identity and labels the output as
observational playback. Panes use equal scale and ordered semantic beats. A shorter
pane holds while the other finishes; its clock does not stretch. The comparison map
retains each pane's contributing source frame. Paired scene packaging is still
blocked: the portable viewer's existing monotone sync map cannot represent replay
occurrences. Export individual audited drafts for now.

## Implemented contracts

- `TreatmentPlan` v1: highlight, magnifier, alignment, slow replay, and event panel
  intent with rationale, required/optional status, and evidence references. The
  catalog explains prerequisites and inappropriate use. CLI and MCP expose it.
- `ScenePlan` v1: explicit output intervals with independent source start/rate,
  checkpoint holds, source-free insertion semantics, cue timing, and layers.
  The slice renderer rejects insertion beats until a source-free template exists.
- Source maps: output frame, requested source time, actual captured source time,
  original frame identity/hash, sanitized hash, page, and segment occurrence.
- Render receipts: pinned engine/browser/font identities, frame count, measured
  timing, resource telemetry, randomized seek results, and card-layout coverage.

The compiler refuses slow replay without an observed transient checkpoint. Replay
selects preceding captured pixels; it never interpolates evidence. A held checkpoint
selects that exact image, even if a later movie frame exists. Diagnostic values use
source time, so they freeze and rewind with the evidence.

## Visual implementation

React emits controlled HTML/SVG. Hyperframes 0.8.87 captures every frame through its
seek protocol; Repro's FFmpeg profile encodes the result. The same composition is
used for rendering and comparison. Source Sans 3 and Source Code Pro are pinned
Fontsource dependencies; their font bytes are embedded and hashed. See the compositor
third-party notices for licenses.

At a 1280×720 application viewport, the output is 1688×864. The application remains
at native scale, with a title above and a 336px annotation gutter to its right.
Cards wrap measured text and reserve their maximum sampled height. Layout keeps
placements stable for a beat and checks visible cards at every output frame.
Space exhaustion fails instead of clipping or discarding required explanations.

The slice includes persistent compass markers, click waves, checkpoint highlights,
measured alignment guides/brackets, 2×/4× nearest-neighbor magnifiers, source-clock
event panels, reading holds, explicit slow-motion badges, and designated outcomes.
Markers avoid other simultaneous markers and measured targets. Magnifiers reuse
the sanitized source image and outline their actual crop.

The new path is post-production only: `capturePreviewUi` must be disabled. A source
image is sanitized before any crop or magnification. Rendered panel strings also
pass through built-in and configured text redaction. Final exports undergo OCR.

## Validation and reproduction

```sh
pnpm build
pnpm test:scene-polish
node scripts/e2e/scene-review.mjs
node scripts/e2e/scene-benchmark.mjs
```

The fixture runner captures both variants of three scenarios under
`.repro/scene-polish`: nested menu selection, measured invoice misalignment, and a
300ms loading failure. Menu and geometry use controlled capture; transient uses
faithful capture. Each run must establish its designated outcome. The transient
fixture repaints a visible loading indicator in both states so the timing window
is observable even when account content remains unchanged.

Random seeking re-renders nonsequential frames and requires identical PNG bytes.
Failures preserve expected/actual images. Every output frame checks card clipping
and card-to-card overlap. Unit tests cover repeated source intervals, holds,
missing history, missed transients, absent required panel data, exact magnifier
crop scale, and unequal comparison durations.

The adapter targets Windows x64 and Linux x64 with the matching Playwright Chromium headless shell installed. Regular Chromium is not interchangeable: the initial integration
exposed a truncated capture surface with that binary. The adapter must remain pinned
and the complete frame must be inspected after engine/browser updates. Asset input
is limited to 256 MiB and duration to ten minutes for this slice. These are rejection
limits, not a demonstrated long-running memory guarantee.

## Expanded visual and diagnostic workflow

The standalone corpus covers the 14 requested defect classes, plus a gesture showcase.
It uses actual 393px, tablet, and desktop viewports. Odd capture dimensions retain their
coordinates using H.264 4:4:4 normalization; final compositions have even dimensions and
use the standard delivery profile. The original source frames remain authoritative.

```sh
pnpm test:bug-corpus
REPRO_CORPUS_KIND=alignment,dark REPRO_CORPUS_ROLE=after pnpm test:bug-corpus
node scripts/e2e/bug-corpus-review.mjs
```

The review runner requires Tesseract and creates strict OCR-audited individual bundles,
entry/hold/exit stills, acceptance receipts, and two optional controlled comparisons.
Its local gallery is `.repro/bug-corpus/index.html`. Most examples are standalone.
Comparisons hide identical right-hand cards and their leaders. Differing observations
are labeled in both panes; common content stays on the left. Each pane retains its
own source clock and frame identity.

Treatment intent now supports `callout`, normal/critical severity, expected text,
measured state references, attached step descriptions and sequence membership.
Critical findings use an amber Bug detail plate; ordinary instructions retain the
neutral style. `eventMatch`, `valuePath`, and value/object/events/sparkline formats
select recorded panel data. `outputScale: 2` configures output resolution separately
from the application viewport. `actionAudio` remains false by default.

Confirmed browser double-click events, pressed holds, drag paths, cancellation,
and distinct right-click glyphs share the pointer timeline. Optional generated
action feedback uses that same output timing. The arrow cursor follows recorded
source-time pointer samples, freezes during holds, and rewinds during replay. It shrinks
while pressed and shows a short movement trail. `cursorGlow` defaults to true and can
be disabled in a treatment plan. The halo uses vector strokes for repeatable seeking.

Committed scenarios can import `humanPointer(page)` from `@jitterbox/repro-playwright`, then
use `pointer.click(locator)`, `pointer.approach(locator)`, and `pointer.move(x,y)`.
The helper actually dispatches a deterministic eased, curved approach over 640ms;
it does not synthesize a path during rendering. Keep all mouse movement on a page
through the same controller. The defect corpus adds 1.6-second observation pauses
after actions while preserving the original speed of timing-sensitive interactions.
An existing recording with instant clicks requires recapture to obtain human pacing. Three retained numbered markers,
including attached text, are exercised in the gestures fixture. Leaders route around
protected measured targets, preferring a direct line between edge centers. Panel
borders, leaders, and outlines share a treatment accent; critical evidence uses amber.
Numbered panels and compass markers are a single timed group without an intervening
leader. They remain through their declared sequence, including its checkpoint holds.
Checkpoint beats, including captured transients, last at least 5.4 seconds, allowing five fully opaque seconds
between the entry and exit transitions. Geometry is clipped at the application viewport, while
cards stay in an external gutter. Up to three layout repairs can enlarge a crowded
gutter; failed composition drafts and repair reports are retained.

Scenarios can explicitly read page state with `repro.observe(name, reader)` and
subscribe with `repro.watch(name, reader, {intervalMs})`. Values are immediately
serialized, limited to 64 KiB, and accompanied by host observation-window uncertainty.
Subscriptions have bounded sampling, automatic disposal, and partial/dropped coverage.
They expose page-accessible state, not arbitrary closure memory. Checkpoint bounds
include selected computed styles and accessibility attributes.

The passive CDP network collector records request/response/end/failure events,
encoded and decoded transfer samples, and original browser timestamps. Host receipt
times drive synchronization; unknown cross-clock uncertainty is explicitly null.
Console, exceptions, probe keyboard/pointer/focus/scroll events, and supported vitals
remain available. Review now includes event-to-output-occurrence navigation, state,
console, network lifecycle, geometry observations, coverage, and source frame identity.
WebMCP is capability-detected without invoking tools. Where the experimental CDP
domain exists, the adapter records toolsAdded/toolsRemoved/toolInvoked/toolResponded
with page origin, protocol frame identity, snapshotted payloads and untrusted provenance.
Other browsers report unsupported; page API availability is reported separately.
The adapter follows the [official WebMCP protocol](https://chromedevtools.github.io/devtools-protocol/tot/WebMCP/).

`repro import jira issue.json --attachments-dir media --out-dir brief` imports a
saved Jira issue including structured description and downloaded screenshot/video
attachments. The MCP `import-jira` tool exposes the same operation. Every attachment
has source provenance, a hash, and a restricted ticket-context designation. Missing
media fails import; ticket media never becomes newly captured browser evidence.

## Remaining promotion gates and boundaries

The full overhaul is not promoted. Remote fixed-runner benchmarking, fresh-agent
acceptance with unfamiliar ticket attachments, portable paired occurrence-aware
packaging, and comprehensive transition/pixel regressions remain open. Final scene
exports stay gated; individual draft exports still require strict OCR.

The current geometry pass protects measured targets, markers, and card rectangles;
it is not a general moving polygon/connector intersection solver. Highlights and
magnifiers are checkpoint-driven. Dynamic tracking through arbitrary scrolling,
popups, and nested frames still needs its own acceptance coverage. Page cuts inside
a playback segment are rejected; split scenario steps at page changes.

Deep response-body/storage/worker/performance collectors remain disabled by default,
and WebMCP remains dependent on the pinned browser capabilities. Jira ingestion
accepts saved issue JSON and local media; authenticated live issue downloading is not
yet exposed. The review network panel is an event timeline, not a full DevTools waterfall.
These limitations are explicit; missing observations are never manufactured.

## Adaptive space and workflow timing

See [adaptive panel placement](configuration.md#adaptive-panel-placement) for gutter/header reuse, timed step retirement and protected corner overlays. [Workflow audits](workflow-audit.md) combine command timing logs with native harness transcripts to explain capture and rendering costs. Presentation changes reuse existing source footage.

Recorded active-page cuts split scene playback at the observed source timestamps. Original source selection, slow-play rates, and checkpoint page identities remain intact. Opaque privacy masks are also applied above source-surface decorations, and annotation panels avoid these regions.
