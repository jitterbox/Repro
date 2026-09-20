# Evidence coverage and review

Run `pnpm build`, `pnpm test:strategy-matrix`, `pnpm test:overlay-matrix`, and
`pnpm test:voiceover-matrix`, then `node scripts/e2e/verify-review-matrix.mjs` (or use `pnpm test:review-matrix` for the complete sequence). Chromium, FFmpeg, fonts and Tesseract must be
available (`repro doctor`). Then run `pnpm review:matrix` and open
http://127.0.0.1:37472. Override `REPRO_MATRIX_OUT` for isolated result sets.

The table has stable IDs, actual PNG/MP4/plan links and per-test feedback.
Feedback stays in browser local storage; use **Download feedback JSON** to
share it. The server binds to loopback and serves only listed artifacts.
Never publish the capture directory: raw traces and captures are not a shareable package.

## Coverage contract

`testdata/evaluation/review-matrix.json` maps every feature flag and discovery
strategy to test IDs. A blocking test compares that catalog with the runtime
schemas so new features cannot disappear from the review requirements.

- **STR-01–11:** natural actions, designated failure before and success after,
  required observations, rendered outcome text and masked fixture data. Includes
  transparent interception, measured displacement, disappearing content, transient
  frames, console failure, blocking work, accessibility, keyboard, popup, privacy
  and invalid network response. Geometry uses a controlled profile; timing uses
  faithful execution. **STR-12** verifies native UI is rejected as page evidence.
- **TXT-01:** real long application text, with overflowing broken behavior and
  clipped/ellipsized fixed behavior, captured using the same public fixture.
- **MIX-01–08:** four balanced combinations, each with light/short and dark/long
  text. These deliberately synthetic diagnostic events test the renderer over
  actual browser recordings. Their coordinates and metric values do **not**
  establish a real application diagnosis. Tests check simultaneous plate bounds,
  actual active-frame text, decoding, and outcome visibility at the end.
- **MIX-PIXEL** in the compositor suite: decoded RGBA pixels stay inside planner
  bounds at 1× and 2× scale, including long console messages and vital summaries.
- **VO-01:** public CLI caption generation and audio-stream inspection.
  **VO-02** records audible narration as unsupported: the CLI currently does not
  synthesize/mux it. The legacy silence mock is not speech verification.

The legacy design-language ledger still counts **planned annotations and output
files**. A separate blocking `legacy-review-index.mjs` pass now decodes every
listed MP4, retains a decoded review frame and content hash, and checks actual
Before/After role text for all seven encoded comparison layouts. These checks
do not promote synthetic fixture geometry into measured bug proof.
The existing public timing, high-DPI, privacy, synchronization, diagnostics, recipe,
export and viewer suites remain required in CI. Their negative controls complement
the new matrix; a plan-only test cannot satisfy a pixel or timing obligation.

## Balanced coverage rather than all combinations

All 18 feature flags have an explicit obligation. Available visual features get
at least two stress cases. Repeat combinations where they share a screen region,
can obscure a target, carry dynamic text, or alter presentation timing. Do not
turn every flag on in every bug: that would change timing and obscure the claim.
Each combination records why its features belong together. Discovery assessments
still require narrative source references and committed proof assertions.

Light/dark here describes the **application background**, not independent Repro
palettes: Repro's overlays share one high-contrast token set. Viewport/scale,
font identity, planner placement and compositor identity participate in caching.
Oversized required callouts fail explicitly when no collision-free seat exists;
callers should split diagnostic beats rather than hide evidence or overlap text.

## Review and acceptance

A green strategy row means the bug/fix condition and its declared checks passed;
it does not imply every frame has been aesthetically approved. Review the named
frame and full video, then report `test ID`, `before/after`, `timestamp`, and the
change needed. Failed and unavailable rows remain visible. Do not call the matrix
complete if a required case is absent, failed, or only has stale artifacts.

The current expanded matrix has 22 required passing cases (13 browser/negative
strategy cases including long text, eight paired render stress cases, and one
caption case), plus the explicit unsupported speech row. The review page can
also include five public regression gate reports and 19 original fixture output
rows. These counts are case counts, not claims of exhaustive Cartesian coverage.
Run `node scripts/e2e/review-matrix-gates.mjs` to refresh the extra public gates.
After a successful fixture run, execute `node scripts/e2e/legacy-review-index.mjs`.
An optional fixture log argument also checks that its 27 tests passed. CI runs the
pixel index immediately after the fixture suite. `LEG-02` and `LEG-03` cover all
seven comparison layouts; every legacy row links its decoded review frames.
Role OCR normalizes the specific T/I/L glyph ambiguity in AFTER and requires
Before and After in their respective caption regions; absent roles still fail.

## Output-quality regression checks

Required checkpoint labels are measured with the same installed-font function in
planning and rendering. Their complete wording is checked by OCR in the actual
label region of both checkpoint PNGs and decoded video holds. Full-frame privacy
OCR remains separate and mandatory. Kicker and measurement text fit their plates;
long optional text uses Unicode-safe ellipsis. Hit-target captions report actual
CSS dimensions, label missing bounds explicitly, and only flag dimensions below
24×24 when measured values support that statement.
