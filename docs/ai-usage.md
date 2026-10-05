> For Repro 0.3.1 installation, portable skills, editable visual/timing/encoding defaults, and the exhaustive generated CLI/MCP/schema reference, start at the [documentation index](README.md). Runtime interfaces there take precedence over historical examples.

# Repro — AI agent usage guide

This document is the authoritative playbook for agents (and humans driving
agents) that need to reproduce bugs, produce annotated evidence videos, compare
before/after runs, and file artifacts into Azure DevOps or Jira.

**Hard rules for agents**

1. Prefer CLI verbs (`repro …`) over inventing Playwright/ffmpeg scripts.
2. Never put ALM tokens, cookies, or vault keys in prompts or chat.
3. Follow **claim → recipe → capture → inspect → verify → export**. Discover with
   `capabilities` / `describe` / `recipes`, commit a scenario with `init`, then use
   `run` → `frame` / `review` → `compare` → `render` → `export`. CI reruns the
   committed specs without an LLM. `capture` and `package` are low-level interfaces; presentation uses `render RUN`.
4. Always `repro validate-config` before capture when features/mode change.
5. Pipeline completion ≠ success — run `repro quality` / OCR gates as required.
6. Do not silently fall back from `surfaceCapture: "page"` to OS capture.

Start with `repro doctor` and `repro capabilities --json`. For the public scenario
workflow and fixture API, see [committed scenarios](#committed-evidence-and-public-playwright-integration).
`repro run` returns compact outcomes and paths to complete manifests; use
`--verbose` only when the full provenance is needed. Browser execution and the
application's local server require permission to launch processes and bind a
loopback port in sandboxed environments.
Each invocation owns a directory under `--out-dir`, containing its individual
attempts. Use the run paths returned by the CLI; do not infer run ownership from
new directory names when concurrent captures share an output root. Incomplete
attempts remain local and are reported only to their owning invocation.
Install `@jitterbox/repro-playwright` in the scenario's project. Repro resolves its runner
from that fixture's Playwright installation, including when a CLI outside the
project launches the scenario. Mixing separate runner and fixture module
instances can cause Playwright's "test() called here" error even at equal versions.

For presentation captures, import `humanPointer` from `@jitterbox/repro-playwright` and use
one `humanPointer(page)` controller for mouse approaches and clicks. Its eased
curves are real captured input. Leave approximately 1.5–2 seconds to observe each
completed action. Preserve timing-sensitive trigger sequences; put observation
pauses outside them. The scene renderer holds checkpoints for at least 5.4 seconds,
including captured transient failures, and displays a source-timed arrow cursor.
Do not add invented movement to old recordings with instantaneous clicks; recapture.
See [scene presentation](scene-renderer.md) for `cursorGlow` and treatment intent.

Related skills (thin CLI wrappers): `repro-capture`, `repro-annotate`,
`repro-compare`, `repro-file` under `skills/`.

Visual language, overlay theming, viewer UI, and Claude Design prompts:
[`design-brief.md`](design-brief.md).

---

## Efficient execution and audit coverage

Reuse a successful capture for presentation-only repairs. Before every recapture, identify the missing observation or execution/privacy failure and the changed scenario input; retain the attempt and its outcome. Discover tooling once per environment, inspect source evidence before rendering, and use at most three automatic presentation repair attempts. Prefer adaptive gutter/header/corner placement over increasing output height. Declare units for custom data streams.

When asked to audit speed or tool usage, follow [workflow audit](workflow-audit.md): preserve the native harness transcript, enable private CLI timings, and distinguish measured command time from unknown agent time. A prose diary alone is not a complete tool transcript.

## Source-referenced bug discovery

Start with `repro discovery-guide --json` to review 12 editorial strategies, the
complete capability registry and every supported configuration feature. Then run
`repro discover bug.json`. Input can be a normalized brief (`title`, `description`,
`expected`, `actual`, `steps`, `tags`, optional `id`) or an ADO-shaped ticket.
ADO selector hints, annotation coordinates and configuration are not executed or
used as measured proof. Only explicit tags propose candidates; untagged prose
requires agent interpretation rather than a hidden keyword classifier.

The report exposes `sourceFacts`, each with a reference such as `actual` or
`steps.2`. An agent reads these facts and the relevant strategy cards, explores
the real application and commits an assessment:

```json
{
  "claim": "The intended Checkout click fails to open Checkout",
  "expected": "The Checkout heading appears after the click",
  "concerns": [{
    "kind": "interaction",
    "rationale": "The natural click does not reach the expected state",
    "sourceRefs": ["actual", "steps.2"]
  }],
  "triggerStep": 2,
  "targets": [{"id": "target", "description": "Intended Checkout control", "role": "affected"}],
  "uncertainties": ["The suspected overlay needs measured confirmation"]
}
```

Run `repro discover bug.json --assessment assessment.json`. It rejects unknown
source references and invalid trigger/target identities, explains selected tool
choices and non-selection, separates timing/geometry passes, and returns an
`evidenceDraft`. It does not verify the semantics of the agent's interpretation.
A draft requires real locator bindings, ordinary setup checks, designated outcome
assertions, privacy selectors and actual pixel inspection. Add relevant diagnostic
and context checkpoints before treating it as complete. Do not export a discovery
report as audited proof.

For `transient` concerns, no draft is emitted until the assessment includes
`transientFrame` with an observed event `kind`, optional `match`, `offsetMs` and
optional `maxOffsetMs`. This generates an event-linked checkpoint and a segment
on the trigger step; wrap the real interval with `repro.segment`. A native-surface
assessment produces an unsupported result with no page-proof draft.

MCP exposes the same `discover` service and resources `repro://discovery-guide`,
`repro://bug-brief-schema`, and `repro://discovery-assessment-schema`. Build output
also publishes these documents under `@jitterbox/repro-contracts/dist/discovery`. No hosted
model is required: reasoning belongs to the discovery agent; validation and
committed execution remain deterministic.

The reviewed example under `packages/playwright/examples/discovery-*` and
`discovery.spec.ts` is exercised by `pnpm test:discovery`: public CLI discovery →
validation → real before/after capture → frame inspection → rendered outcome OCR →
comparison. All 16 existing tickets additionally exercise normalization and
candidate coverage; this is not a claim that 16 new executable scenarios were
automatically generated.

## Turn a bug into an understandable reproduction

The agent makes editorial decisions during discovery; the committed scenario
and renderer execute them without an LLM. `repro init` currently creates a
Checkout example, not a general bug-to-test converter. Adapt it to the actual
application using `repro recipes --json` and `repro describe render --json`.

1. Read the reported steps and acceptance criteria. Write one falsifiable claim.
   Separate what the reporter saw, the expected behavior, and any suspected
   cause. Ticket annotation hints and coordinates are suggestions, not evidence.
2. Explore the actual application and bind durable locators. Confirm setup and
   authentication with ordinary assertions. Do not swallow unrelated failures
   or force-click through an obstruction.
3. Give the scenario a descriptive title. Keep its identity across Before and
   After. Create meaningful numbered steps: establish context, perform the
   trigger, inspect the decisive state, and verify the intended result. Avoid
   turning every browser API call into a visible step.
   Write titles without numeric prefixes: Repro adds the step numbers. Keep the
   decisive expected condition and any numeric tolerance concise enough to read
   in the resulting outcome caption.
4. Choose the evidence moment. For a stable result, assert the specific state
   and capture a checkpoint. For a flash, race or animation bug, start a segment
   before the trigger and select an event-linked frame afterward. Do not wait
   for stability when instability is the evidence.
5. Select the few controls a reviewer needs to see: the intended action, affected
   content, and a reference control if their relationship matters. Capture their
   measured bounds with the context screenshot; derive crops from those pixels.
   A hidden-hitbox claim needs `repro.hitTest`, its sampled stack/recipient and an
   outcome check. A rectangle alone does not prove interception.
6. Add checkpoint `highlights` with short descriptive labels. These create an
   outline and an adjacent callout from the same measured observation in both
   PNGs and video holds. Example within a checkpoint:

   ```json
   "targets": ["checkout"],
   "observations": ["screenshot", "bounds", "assertion", "hit-test"],
   "highlights": [{ "target": "checkout", "label": "Intended Checkout control" }]
   ```

   Choose at most three highlights per checkpoint. Omit `highlights` for automatic
   outlines, or use `[]` to leave the image unadorned. Labels identify what to look
   at; they do not independently verify a diagnosis or a numeric delta. Missing,
   moving or ambiguous geometry cannot produce an invented outline. Rendering
   rejects requested callouts when aligned evidence or unobstructed space is
   unavailable; shorten the label, reduce highlights or capture a better frame.
   For focus and small-displacement bugs, keep the application's actual focus
   ring or edge visible. Use `highlights: []` when an outline would hide or mimic
   that evidence. A default first-target crop can omit a related result; use full
   context or explicit shared bounds including all necessary controls.
7. Run `repro validate-evidence evidence.json`, then the committed scenario.
   Inspect the actual context image, focused crop and critical video interval
   using `frame` / `review`. Check that labels are readable, do not cover the
   defect, and appear at the right moment. Verify designated failure Before and
   success After before using proof language. Keep unsuccessful attempts.
8. Iterate with `repro render <run> --evidence edited.json`: titles and checkpoint
   highlights can change without recapture. Changes to execution, claims,
   targets, required observations or privacy require a new run. Export only
   after inspection and the mandatory media audit.

The initial interaction, geometry and transient recipes are executable examples
against the fixture corpus. Their titles, claims and selectors must be adapted;
a recipe choice is not itself proof that a reported issue was reproduced.

## 1. Choose a mode (exactly one)

| Mode      | When to use                                          | Profile                  | Output intent                        |
| --------- | ---------------------------------------------------- | ------------------------ | ------------------------------------ |
| `repro`   | Reproduce a failure for a single issue               | Usually `faithful`       | Annotated MP4 + evidence             |
| `compare` | Before/after or baseline vs candidate                | **Must** be `controlled` | Synced A/B layouts + geometry deltas |
| `demo`    | Fix verification / walkthrough (no failure expected) | Often `controlled`       | Narration-forward polished video     |

Layouts (`side-by-side`, `onion`, `wipe`, `blink`, `difference`, `cropped-roi`,
edge overlay) are **render/compare parameters**, not modes. One compare capture
pair can emit multiple layouts. Prefer `cropped-roi` for sub-8px geometry deltas;
use `blink` only when explicitly opted in (never default — vestibular risk).

---

## 2. Capture profiles

| Profile      | Semantics                                                                | Use when                                                           |
| ------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `faithful`   | Preserve real timing, randomness, live network, service workers          | Race bugs, flaky timing, “only in prod-like” repros                |
| `controlled` | Fixed Date with progressing timers, seeded RNG, reduced motion, optional HAR replay, blocked SW | `compare` mode, visual/regression diffs, demos that must be stable |

Compare mode **requires** `controlled`. Skipping determinism shifts all cost into
alignment noise.

---

## 3. Surface capture

| Value            | Captures                                             | Does **not** capture                                                |
| ---------------- | ---------------------------------------------------- | ------------------------------------------------------------------- |
| `page` (default) | Page content via screencast                          | Browser chrome, permission prompts, native file pickers, OS dialogs |
| `os`             | Unsupported in this release; requests fail explicitly | No OS capture backend is available; no page substitution             |

Never silently upgrade `page` → `os`.

---

## 4. Feature flag catalog

Turn features on only when they help the bug class. More overlays ≠ better
evidence.

| Flag               | What it captures / shows                                   | Typical bug classes              |
| ------------------ | ---------------------------------------------------------- | -------------------------------- |
| `cursor`           | Pointer path                                               | Click/miss, hover menus          |
| `clickViz`         | Click/tap ripples                                          | Wrong target, double-submit      |
| `keystrokes`       | Key badges (printable suppressed in form fields by policy) | Shortcuts, IME, keyboard traps   |
| `consoleOverlay`   | Console/errors with trigger highlight                      | JS exceptions, failed assertions |
| `specCard`         | Env/spec intro slate                                       | Any filed ticket                 |
| `steps`            | Chapters, step counter, progress bar                       | Multi-step repros                |
| `pauses`           | Freeze frames + PAUSED badge                               | “Wait for …” moments             |
| `slowmo`           | `setpts` slow-mo + speed badge                             | Fast UI that reviewers miss      |
| `zoom`             | ROI zoom callouts                                          | Sub-pixel / small-control bugs   |
| `redaction`        | PII masking pipeline                                       | Auth, PII, payments              |
| `vitalsHud`        | CLS/LCP/INP HUD                                            | Perf / jank                      |
| `voiceover`        | VTT narration plan; audible CLI narration unavailable       | Demos, stakeholder reviews       |
| `freezeDetect`     | LoAF / rAF freeze badges                                   | Main-thread hangs                |
| `a11yOverlay`      | A11y issue overlays                                        | Axe/ARIA failures                |
| `hiddenElements`   | Hidden / `aria-hidden` callouts                            | Invisible interactive controls   |
| `hitTargets`       | Hit-test / touch-target viz                                | Mis-clicks, tiny targets         |
| `stackingContexts` | Stacking/z-index viz                                       | Click-through, overlay traps     |
| `layoutShiftViz`   | Layout-shift regions                                       | CLS, jumping UI                  |

Additional knobs on config (not feature flags):

| Field                                  | Meaning                                                     |
| -------------------------------------- | ----------------------------------------------------------- |
| `showActions`                          | Playwright native action callouts (~500ms block per action) |
| `timingSensitive`                      | Race/timing bug — **forbids** `showActions`                 |
| `preserveRealTiming`                   | Keep wall timing — **conflicts** with `voiceover`           |
| `redaction.strict`                     | OCR audit gate blocks ALM upload on any hit                 |
| `compare.strategy` / `compare.streams` | A/B layout and stream types                                 |

---

Presentation uses `repro render` and validated treatments. Feature flags below still govern capture and diagnostic planning; they do not select a second renderer. The retired narration flag does not synthesize speech. Consult `repro treatments --json` for the supported visual effects.

## 5. Bug / issue class → recommended config

Use this matrix when classifying a ticket. Start from the row, then add
`specCard` + `steps` for anything you will file.

**Beat / duration guidance:** Filed `repro` videos target **15–30s** total output
time; compare beats run **3–4s** per aligned step. Use timeline beats (hold,
slowmo, outcome) rather than stretching capture tail — pauses hold at the beat,
not after the action fades.

| Bug / task class                      | Mode      | Profile                     | Features (on)                                          | Also set                                 | Avoid                                        |
| ------------------------------------- | --------- | --------------------------- | ------------------------------------------------------ | ---------------------------------------- | -------------------------------------------- |
| Functional failure (happy-path break) | `repro`   | `faithful`                  | `steps`, `clickViz`, `consoleOverlay`, `specCard`      | —                                        | Heavy `slowmo` unless needed                 |
| Race / timing flake                   | `repro`   | `faithful`                  | `steps`, `freezeDetect`, `vitalsHud`, `pauses`         | `timingSensitive: true`                  | `showActions`, `controlled`                  |
| Console / uncaught exception          | `repro`   | `faithful`                  | `consoleOverlay`, `steps`, `clickViz`                  | —                                        | —                                            |
| CLS / layout shift                    | `repro`   | `faithful` or `controlled`* | `layoutShiftViz`, `vitalsHud`, `zoom`, `slowmo`        | Slow at shift                            | `showActions` if measuring pixels            |
| Freeze / hang / long task             | `repro`   | `faithful`                  | `freezeDetect`, `vitalsHud`, `pauses`, `steps`         | —                                        | `voiceover` pacing that hides duration       |
| Visual / CSS / spacing                | `compare` | `controlled`                | `steps`, `zoom`, optional `cursor`                     | DOM geometry primary; pixel confirmation | Different viewport/DSF                       |
| Regression after fix                  | `compare` | `controlled`                | `steps`, `specCard`                                    | Identical env manifests                  | Env drift without override                   |
| Click / hit-target miss               | `repro`   | `faithful`                  | `hitTargets`, `clickViz`, `cursor`, `zoom`             | —                                        | —                                            |
| Keyboard / a11y trap                  | `repro`   | `faithful`                  | `keystrokes`, `a11yOverlay`, `hiddenElements`, `steps` | —                                        | Overlay without `inert` (probe handles this) |
| Stacking / modal click-through        | `repro`   | `faithful`                  | `stackingContexts`, `clickViz`, `cursor`               | —                                        | —                                            |
| Form / PII / auth flow                | `repro`   | `faithful`                  | `redaction`, `steps`, `keystrokes`†                    | `redaction.strict: true`                 | Filing without OCR gate                      |
| Network / API error UX                | `repro`   | `faithful`                  | `steps`, `consoleOverlay`, `specCard`                  | Keep sanitized HAR                       | Raw HAR bodies                               |
| Perf / INP / LCP                      | `repro`   | `faithful`                  | `vitalsHud`, `steps`, `slowmo`                         | —                                        | Artificial `controlled` that hides jank      |
| Multi-page / popup flow               | `repro`   | `faithful`                  | `steps`, `specCard`, `clickViz`                        | Expect editorial cuts                    | Single-page assumptions                      |
| Demo / stakeholder walkthrough        | `demo`    | `controlled`                | `steps`, `specCard`, `cursor`             | Drop `preserveRealTiming`                | `timingSensitive`                            |
| Fix verification (pass expected)      | `demo`    | `controlled`                | `steps`, `specCard`              | Assert no failure                        | Filing as “bug” without outcome slate        |

\* Use `controlled` for CLS only when comparing two builds; use `faithful` to
prove a real-user shift.

† Prefer suppressing printable keys in fields; keep modifiers/non-printables.

### Minimal presets (copy into `features`)

```json
{
  "functional": {
    "steps": true,
    "clickViz": true,
    "consoleOverlay": true,
    "specCard": true
  },
  "cls": {
    "layoutShiftViz": true,
    "vitalsHud": true,
    "zoom": true,
    "slowmo": true,
    "steps": true,
    "specCard": true
  },
  "freeze": {
    "freezeDetect": true,
    "vitalsHud": true,
    "pauses": true,
    "steps": true,
    "specCard": true
  },
  "a11y": {
    "a11yOverlay": true,
    "hiddenElements": true,
    "keystrokes": true,
    "hitTargets": true,
    "steps": true,
    "specCard": true
  },
  "pii": {
    "redaction": true,
    "steps": true,
    "specCard": true
  },
  "visualCompare": {
    "steps": true,
    "zoom": true,
    "specCard": true
  },
  "demo": {
    "steps": true,
    "cursor": true,
    "clickViz": true,
    "specCard": true
  }
}
```

---

## 6. Conflict rules (validator-enforced)

Run `repro validate-config -c repro.config.json` after every config edit.

| Rule                                                    | Effect                             |
| ------------------------------------------------------- | ---------------------------------- |
| `compare` ⇒ `profile: "controlled"`                     | Error otherwise                    |
| `showActions` + `timingSensitive`                       | Error                              |
| `showActions` + `compare.streams` includes `pixel-diff` | Error                              |
| `onion` / `difference` ⇒ identical viewport + DSF       | Error if mismatched                |
| `voiceover` + `preserveRealTiming`                      | Error                              |
| `redaction.strict` without `features.redaction`         | Error                              |
| Material env drift on compare                           | Fail unless `--override-env-drift` |

Warnings: redaction enabled without `strict` on protected captures.

---

## 7. End-to-end task playbooks

### A. Single-issue repro → annotated MP4 → package

1. Classify bug → pick mode/features from §5.
2. Write `repro.config.json`; `repro validate-config -c …`.
3. Use `repro init`; commit the editable Playwright spec and evidence specification.
4. `repro run issue.spec.ts --evidence evidence.json --config repro.config.json --url "$URL" --out-dir .repro/runs`
5. Inspect the returned run directory with `repro frame <run> --checkpoint <id>` and `repro review <run>`.
6. Check designated outcomes and required observations in its manifest.
7. `repro render <run>`; inspect the actual images/video, titles, steps and highlights.
8. `repro export <run> --out-dir .repro/package`; required evidence and OCR audit failures block export.

### B. Race / timing-sensitive bug

1. `mode: "repro"`, `profile: "faithful"`, `timingSensitive: true`.
2. Features: `freezeDetect`, `vitalsHud`, `pauses`, `steps` — **no** `showActions`.
3. Capture live network; do not HAR-stub unless the race is independent of net.
4. Prefer PNG anchors at failure; cite anchors in the ticket, not JPEG alone.

### C. Before/after visual or geometry compare

1. Two controlled captures with **identical** viewport, DSF, locale, fonts, browser.
2. Run the same committed scenario against both builds; preserve explicit Before/After roles and build identity.
3. `repro compare <before-run> <after-run>` uses captured checkpoints and geometry. Inspect with `repro review <after-run> --baseline <before-run>`.
4. Prefer DOM geometry deltas for sub-5px claims; use difference/edge layouts as
   confirmation.
5. Caption timing gaps (“before 412ms / after 1180ms”) — often the bug itself.

### D. PII / auth evidence for ALM

1. `features.redaction: true`, `redaction.strict: true`.
2. Run → inspect → verify → render → export. Strict export audits the actual output pixels.
3. `repro file --system jira|ado --evidence … --title … -c repro.config.json`
4. Strict OCR with no audit inputs **fails closed** (does not silently pass).
5. Credentials only via env/vault — never in agent context.

### E. Demo / release walkthrough

The current CLI writes narration captions only; it does not synthesize or mux audible speech. Do not use silence-mock as evidence of narration.

1. `mode: "demo"`, `profile: "controlled"`. Captions come from the rendered scene; no voiceover flag is required.
2. Do **not** set `preserveRealTiming`.
3. Narration document drives VTT + transcript; video pads to audio.

### F. Compatibility: resume a low-level stage

```bash
repro capture -c repro.config.json --url "$URL" -o .repro/run --resume .repro/run
repro render RUN --treatment treatment.json
```

Stages are content-addressed; matching cache keys skip completed work.
These low-level adapters remain for existing integrations. New scenarios use
`run`; ordinary reruns observe the application again. Presentation-only edits
use `render <run> --evidence <revision.json>` without recapture.

---

## 8. Example configs

### Functional repro

```json
{
  "mode": "repro",
  "profile": "faithful",
  "surfaceCapture": "page",
  "viewport": { "width": 1280, "height": 720, "deviceScaleFactor": 1 },
  "features": {
    "steps": true,
    "clickViz": true,
    "consoleOverlay": true,
    "specCard": true
  },
  "metadata": { "specTitle": "BUG-1234 cart total NaN" }
}
```

### Timing-sensitive race

```json
{
  "mode": "repro",
  "profile": "faithful",
  "timingSensitive": true,
  "surfaceCapture": "page",
  "viewport": { "width": 1280, "height": 720, "deviceScaleFactor": 1 },
  "features": {
    "steps": true,
    "freezeDetect": true,
    "vitalsHud": true,
    "pauses": true,
    "specCard": true
  }
}
```

### Visual compare

```json
{
  "mode": "compare",
  "profile": "controlled",
  "surfaceCapture": "page",
  "viewport": { "width": 1280, "height": 720, "deviceScaleFactor": 1 },
  "features": { "steps": true, "zoom": true, "specCard": true },
  "compare": {
    "strategy": "difference",
    "streams": ["dom", "video"]
  }
}
```

### Strict redaction + file

```json
{
  "mode": "repro",
  "profile": "faithful",
  "surfaceCapture": "page",
  "viewport": { "width": 1280, "height": 720, "deviceScaleFactor": 1 },
  "features": {
    "redaction": true,
    "steps": true,
    "specCard": true
  },
  "redaction": { "strict": true, "masks": [] }
}
```

---

## 9. CLI command map

| Task                   | Command                                           |
| ---------------------- | ------------------------------------------------- |
| Validate features/mode | `repro validate-config -c repro.config.json`      |
| Discover / initialize  | `repro capabilities --json` / `repro init`         |
| Execute scenario       | `repro run issue.spec.ts --evidence evidence.json` |
| Inspect checkpoint     | `repro frame <run> --checkpoint <id>`              |
| Review / compare       | `repro review <after> --baseline <before>` / `repro compare <before> <after>` |
| Render presentation    | `repro render <run>`                              |
| Export audited pair    | `repro export <after> --baseline <before> --out-dir <bundle>` |
| Quality gate           | `repro quality --input … -o report.json`          |
| File to ADO/Jira       | `repro file --system jira --evidence … --title …` |
| Smoke E2E              | `node scripts/e2e/smoke.mjs`                      |
| Golden eval            | `node scripts/evaluation/run-golden.mjs`          |

Build first: `pnpm build` (or `pnpm --filter @jitterbox/repro-cli build`).
Compatibility interfaces: `capture`, `package`, and JSON-file inputs
to `compare` support existing low-level workflows. Prefer the run-directory
interfaces above for committed scenarios and measured evidence.

---

## 10. Evidence & naming

Keep app defaults separate from run metadata. `naming.useWorkItemId` defaults to true; provide each ID/description through `evidence.workItem` or CLI metadata. With no ID or a false naming policy, use a brief description with a stable scenario suffix. Known target-app version/build values appear throughout the video by default; use `--app-version`/`--build-id`, or configured runtime metadata discovery. Never substitute the Repro package version or evidence repository SHA. See [configuration](configuration.md).

ALM attachment basename:

`{work-item}_{variant}_repro.mp4` with matching `{work-item}_{variant}_devtools.json` by default; ALM delivery uses content-identity upload names.

Example: `BUG-1234__cart-total-nan__staging__a1b2c3d__20260727T211500Z.mp4`

Artifacts typically include: MP4, VTT, `evidence.json` / signed manifest,
`environment.json`, sanitized HAR, optional `trace.zip`, viewer package with
**external** media (never base64-embed).

---

## 11. Decision tree (quick)

```
Is this before/after or visual regression?
  YES → mode=compare, profile=controlled, identical viewport/DSF
  NO  → Is failure expected?
          NO  → mode=demo (captions from committed steps)
          YES → mode=repro
                 Is it a race/timing bug?
                   YES → faithful + timingSensitive; no showActions
                   NO  → pick features from §5 matrix
                          Involves PII/auth?
                            YES → redaction + redaction.strict
                            Filing to ALM?
                              YES → package → quality/OCR → file via CLI
```

---

## 12. What agents must not do

- Do not use Playwright `recordVideo` as the delivery codec.
- Do not use Remotion for automation renders.
- Do not invent selectors/timestamps not present in the event store.
- Do not treat JPEG screencast frames as forensic pixel truth — use PNG anchors.
- Do not upload when `redaction.strict` OCR gate fails.
- Do not put credentials, cookies, or raw HAR secrets in tickets or chat.
- Do not “fix the test” to make a real product bug disappear — report with repro.

---

## 13. Skill routing

| Agent goal                  | Skill            |
| --------------------------- | ---------------- |
| Record a session            | `repro-capture`  |
| Burn annotations into video | `repro-annotate` |
| Sync before/after           | `repro-compare`  |
| Attach to ADO/Jira          | `repro-file`     |

Skills are wrappers: they must call the CLI, not reimplement capture/render.

---

## 14. Fixture corpus (ShopLite)

Evaluation app and bug work items live in-repo (not in ALM):

| Path                                                | Role                                             |
| --------------------------------------------------- | ------------------------------------------------ |
| [`apps/shoplite/`](../apps/shoplite/)               | Broken/fixed demo SPA (`?fixture=broken\|fixed`) |
| [`testdata/bugs/`](../testdata/bugs/)               | ADO-shaped `BUG-10xx.json` work items            |
| [`testdata/specs/`](../testdata/specs/)             | Fake ACs + mockup tokens                         |
| [`packages/e2e-fixture/`](../packages/e2e-fixture/) | Vitest harness + feature-coverage scenarios      |

### Toggle broken ↔ fixed

```bash
pnpm shoplite:dev
# http://localhost:5177/?fixture=broken
# http://localhost:5177/?fixture=fixed
```

The document element gets `data-repro-fixture="broken|fixed"`. Switching is
global by default and does not require a rebuild. Add `&bug=BUG-1003` to isolate
one defect in broken mode; fixed mode disables defects. The selected bug is
recorded in `data-repro-defect`.

### Generate coverage videos

```bash
pnpm build
pnpm test:e2e-fixture
```

Artifacts write to `.repro/fixture-videos/<scenario>/` (gitignored). Each
scenario exercises a slice of modes/features/layouts so the suite covers the
feature checklist without a full Cartesian matrix. Each bug JSON includes
`Custom.ReproConfig` — use that as the source of truth for recommended flags.

## Committed evidence and public Playwright integration

Use `repro capabilities --json` and `repro describe <id> --json` as the authoritative CLI discovery surface, then check runtime availability with `repro doctor`. The stdio MCP adapter exposes the same pipeline services and JSON resources. Generated reference documents live in `packages/contracts/dist/discovery` after `node scripts/generate-capabilities.mjs`.

Start with `repro init`, edit the durable Playwright locators and outcome check, and commit the generated inputs. Use the installed `@jitterbox/repro-playwright` fixture, not fixture-corpus helper imports. The fixture supports named targets, semantic steps, checkpoints, designated outcome assertions, sampled hit tests and checkpoint-scoped Axe scans. The `run` command accepts existing Playwright configuration/projects and repeated attempts. A supplied URL is available as `process.env.REPRO_URL`; the test explicitly navigates to it.

`repro frame <run> --checkpoint <id>` returns a context image and optional derived crop with the actual screenshot interval. `--time-ms` selects the nearest normalized recording frame and reports the offset. Target bounds are measured on both sides of screenshot acquisition. If they change, Repro reports unavailable alignment and refuses a requested crop; inspect the context or event-linked recording instead. A screenshot's acquisition interval is not interchangeable with a screencast presentation timestamp. Do not claim tighter alignment than the reported uncertainty.

Keep scenario titles separate from variant labels, use numbered meaningful steps, identify the trigger, and state the expected and observed result. Use Before/After by default. Outcome badges require designated checks. Diagnostic outlines describe measured or sampled data and retain observation references; never invent missing geometry.

`repro compare <before-run-directory> <after-run-directory>` compares measured semantic checkpoints. Environments and roles must agree. Missing checkpoints, unknown provenance, and corrupt artifacts prevent successful proof. Local inspection and comparison do not require OCR; missing OCR blocks strict export. Raw local captures are not shareable exports. Portable paired viewers default to side-by-side and offer Before/After focus, synchronized transport, captions and keyboard controls.

Compare rendered runs with `repro render AFTER --baseline BEFORE`. The source-mapped scene compositor aligns semantic checkpoints. Faithful recordings require `--observational`; paired output stays local until occurrence-aware packaging is accepted. Export each reviewed run separately with `--draft`.

The authoritative comparison contract lives in `@jitterbox/repro-contracts`; its generated JSON Schema is available at `@jitterbox/repro-contracts/schemas/compare-composition.schema.json` and MCP resource `repro://compare-composition-schema`. Cross-field validation additionally requires Before/After pane roles, strictly increasing source/output knot times, measured ROI bounds and explicit blink opt-in. Legacy compositions with fewer than two knots play in original timing, reported as `timing: "original"`; they do not establish synchronized proof. Public run comparisons require measured matching checkpoints. Normal builds check the published schema without modifying tracked sources; after editing its Zod source, explicitly run `pnpm --filter @jitterbox/repro-contracts generate:schemas` and review the change.

Use `repro review after-run --baseline before-run` to inspect local comparisons. The review page lists unmatched checkpoints and uncertain alignment intervals, shows actual media durations, and keeps screenshot acquisition uncertainty separate from recording playback. Uncertain comparisons start in original timing; you can explicitly select synchronized inspection, with uncertainty still visible. Warnings conservatively include frames touching an uncertain interval. Native pause on the leading synchronized video pauses both panes; original timing restores independent controls and normal playback rates. Inspection does not override failed comparison or export gates.

Probe event times use sampled host/page clock calibration, including when a
controlled Date makes the page's performance time origin synthetic. Event
payloads retain `captureClock.method` and uncertainty. Events lacking calibration
use explicitly labeled receipt times with unknown uncertainty; they cannot
support precise event/frame alignment. Older controlled captures with event
times clamped to zero require recapture for event-linked timing claims.
Each document has its own opaque ID and calibration, including child frames and
new navigation documents. A new document cannot borrow the previous document's
offset. Child pointer events explicitly use `frame-viewport-css` coordinates;
main-page samples never acquire recipients from another document or coordinate
space.

### Public fixture API and presentation decisions

The fixture is imported from `@jitterbox/repro-playwright`. Bind only locators declared by
ID in the evidence specification: `repro.target('target', page.getByRole(...))`.
Wrap meaningful actions in `await repro.step('trigger', async () => { ... })`.
A step is always recorded, even if its badge is disabled. Titles describe what
changes or is being proven; scenario identity and variant identity are separate.
Use `Before` and `After` as labels unless designated checks justify stronger words.

Use `await repro.outcome('result', () => expect(locator).toHaveText('Checkout'))`
for the designated assertion. A before mismatch is reproduction evidence only
when this assertion executed; unrelated setup, browser, locator and code errors
remain failures. After the assertion, `await repro.checkpoint('result')` captures
context pixels. It does not insert a stability or network-idle wait. For transient
bugs, capture must already be active before the trigger; inspect event-linked
frames with `repro frame run --time-ms 1234` and retain the reported uncertainty.

Use `await repro.hitTest('result', 'target')` before a natural pointer action to
sample the intended target's center. An explicit `{x,y}` uses viewport CSS pixels.
The sample reports measured bounds and the hit-test stack; it does not establish
a complete invisible hitbox boundary. Sample within the trigger step before the
natural interaction. The final run attaches `data.eventCorrelation` containing
calibrated pointer-down events after that sample in the same page and step, with
actual coordinates, composed dispatch paths and source event IDs. Compare these
coordinates with the sample; the stack alone does not prove an event recipient.
Ambiguous step membership or missing calibrated events remains unavailable.
Never change application CSS or force a
click to manufacture success. Iframe samples currently cannot verify interception
by ancestor frames and are reported as unsupported. For a popup, call
`await repro.ready(popup)` before actions, then `repro.checkpoint('id', popup)`.
`await repro.accessibility('result')` records a checkpoint-scoped Axe scan.

Inspect both context and crop. Crops use 24 CSS pixels of padding by default;
include related controls as named targets when needed. A missing/ambiguous target
must remain missing/ambiguous. Use explicit baseline runs:
`repro compare before-run-directory after-run-directory` and
`repro review after-run-directory --baseline before-run-directory`.

`frame` reports `requestedCrop` in CSS pixels, the actual integer
`pixelTransform`, its `pixelScale`, and the resulting `cropTransform` in CSS
coordinates. Fractional edges round outward within the viewport; use the actual
transform when overlaying the cropped image. Full-resolution checkpoint PNGs
are retained at high DPI; video reading holds scale them to the recording size.

Presentation revisions may change titles, step/checkpoint labels, crop padding
and reading holds: `repro render run --evidence revised-evidence.json`. Execution,
claim, observation requirements and privacy changes require a new capture.
Inspect the rendered artifacts, then use `repro export after-run-directory
--baseline before-run-directory --out-dir bundle` for a paired package. Both runs
must have rendered presentations. Strict export audits actual media pixels,
including stills; captions or sidecars cannot substitute for frame OCR.


Controlled public Playwright runs validate the actual viewport, pixel scale,
locale, and timezone before recording. Set the project's `use` options to match
Repro's configuration; existing service workers are rejected when blocking is
required. Reduced motion is applied explicitly only for controlled capture.
Comparison rejects unknown font hashes or an unmeasured viewport. Older runs
without those measurements must be recaptured rather than relabeled.

MCP exposes the same project, configuration, build, repeat, presentation revision,
and paired-export options as the corresponding pipeline services. Use its
`recipes` tool and on-demand configuration, evidence, run, capability, and
share-report schemas. Discovery descriptions are generated from the registry.

Scenario identity includes statically resolved local imports (including helper
TypeScript and JSON), resolved using the [esbuild metadata API](https://esbuild.github.io/api/#metafile)
without executing or emitting a bundle. Evidence/configuration files and the
automatically discovered Playwright configuration (including its imports) are
also hashed. Runtime file reads and externally deployed build contents still
require explicit provenance; do not treat this import graph as a complete build
attestation.

`repro watch` cancels the previous process tree before starting its replacement,
coalesces edits received during shutdown, and reports input errors so a later
edit can recover. It does not yet reuse a development server across attempts.
For popup proof, pass the popup to both `repro.outcome(checkpoint, assertion,
popup)` and `repro.checkpoint(checkpoint, popup)` so the assertion and image
record the same page identity.

Repro-owned optional traces use DOM snapshots without a screenshot filmstrip,
because screenshot-enabled tracing can compete with the evidence screencast.
The applied choice is recorded as `environment.reproTracing`; review the captured
MP4 and checkpoint PNGs for visual evidence. Keep external Playwright screenshot
tracing/video capture disabled when Repro owns capture. Dimension mismatches fail
explicitly and retain page/time/dimension diagnostics in `frame-errors.json`.

Stable checkpoints requiring an assertion must capture their screenshot after
that assertion on the same page. Use `await repro.check('ready', 'Cart is loaded',
() => expect(page.getByRole('heading')).toHaveText('Cart'))` for an ordinary
prerequisite or state check, followed by `repro.checkpoint('ready')`. Declare that
checkpoint in the evidence specification. A failed `check` is rethrown and blocks
successful evidence even when caller code catches it. It never counts as a
designated bug failure; reserve `outcome` for the claim being reproduced or
verified. A passing ordinary check does not add “Bug reproduced” or “Fix verified”
to its screenshot. Pass a fourth Page argument to `check` for popup conditions.
Transient checkpoints may record before a
trigger; a later assertion does not retroactively put a verified-outcome label on
an earlier screenshot. Reading holds for measured checkpoints use their exact,
redacted checkpoint image and compiled cues. `checkpoint-holds.json` records the
source observation and presentation interval. Multiple checkpoints in one step
remain separate stills; the last checkpoint supplies that step's reading hold.
Use distinct meaningful steps when each state needs its own video hold.

Selector redaction is measured without interacting with private fields and follows
movement, scrolling and separate popup pages. Public presentation consumes the
captured `probe.redaction.mask` events. One selector can match several controls.
Each control is masked on its own, and only while it is observed, so a later
screen does not keep an earlier control's box. Continuous motion of one control
still uses one envelope so positions between samples stay covered.
Password inputs and other controls that already hide their value are not
blurred unless `redaction.maskConcealedInputs` is true (default false).
Each mask is cropped and blurred by its shorter side, the smallest strength
that removed readable glyphs. Pixelation is not a privacy option: a retained
negative case left text readable despite a passing OCR audit. Export OCR stays
a plaintext leak check and is not a second unreadability certificate. Older
selector-protected presentations must be rerendered before export. Raw captures
and checkpoint images remain private.
`pnpm test:moving-privacy` verifies changed text pixels in all four states and
requires strict OCR to reject an intentionally unmasked capture.

To open a portable export, serve its bundle directory using a local HTTP server
and open `/viewer/public/index.html` on that server. Serve the whole bundle so
the viewer can resolve `../../evidence-manifest.json` and its relative assets.
Copy the complete directory when relocating it. File-system URLs may block
manifest fetches; HTTP/hash checks alone do not establish successful playback.
The portable scrubber and keyboard-operable chapter markers follow the selected
Before/After variant. New reports retain each variant's actual presentation
chapter times, while older reports use the published synchronization map.
Displayed original durations are measured from the recording, excluding setup
before its first frame.


## Committed transient proof and browser diagnostics

Start with the claim, choose a recipe, commit the scenario and evidence specification, capture, inspect pixels, verify outcomes, then export. For a brief loading state, start a named interval before the trigger:

```ts
await repro.step('trigger', async () => {
  await repro.segment('loading', async () => {
    await page.getByRole('button', { name: 'Load' }).click();
    await expect(page.getByRole('heading')).toHaveText('Loaded');
  });
});
```

Declare `segments: [{id:"loading", title:"Load through completion", step:"trigger", required:true}]`. A transient checkpoint can select recorded pixels afterward:

```json
{"id":"during","step":"trigger","title":"Content 100 ms after Load","observations":["screenshot"],"timing":"transient","frame":{"segment":"loading","event":{"kind":"probe.pointer:path","match":{"phase":"pointerdown"},"occurrence":0},"offsetMs":100,"maxOffsetMs":66.66666666666667}}
```

Do not call `repro.checkpoint('during')` for an event-selected checkpoint. The pipeline selects an existing frame using the committed event occurrence, same-page calibrated time, offset and segment boundaries. Missing events, unknown calibration and frames outside the tolerance fail required evidence. `repro frame <run> --checkpoint during` returns actual/requested times, selection offset, uncertainty, event reference and context PNG. It cannot invent historical target bounds; use context unless aligned geometry was measured. Capture the final stable outcome separately with an assertion and checkpoint. Never wait for stability when instability is the subject.

Public Playwright console, page exceptions, HTTP error responses and failed connections are recorded passively. HTTP 4xx/5xx and transport failures remain separate. Review lists event/page/request references and seeks the original recording. These events use host receipt times with unknown delivery latency; step associations describe temporal containment, not causality. URL credentials, query strings and fragments are discarded; event text passes the configured redactor. Raw diagnostics remain local. Export includes a sanitized DevTools JSON report by default, named alongside the video using the configured naming policy (per-run work-item ID or descriptive name) and variant. `--no-devtools` or `export.devtools: false` disables that export without disabling local capture. See [naming and diagnostic export](configuration.md#work-item-names-and-browser-diagnostics). Controlled clock implementations may report timer exceptions as console errors; Repro preserves the observed event category.

Comparison matches semantic checkpoint IDs first. Its decoded-image fallback only proposes unique reciprocal matches that preserve semantic-anchor order. Changed-pixel ratios are measurements; image correspondence remains a heuristic with uncertain spans, original-timing default and no successful proof claim. Commit consistent checkpoint IDs to establish before/after meaning.

### Diagnostic images, comparison identities and compiled contracts

`repro.hitTest` now captures a separate pre-action sample PNG and repeats its geometry/style measurement around that acquisition. Review and rendering draw its diagnostic outline only when those measurements agree. The outline is measured element geometry at one sampled point, not a complete hit region. Open **Hit-test sample images** in review to inspect the sample and its observation reference. A later checkpoint never inherits this outline. Acquisition adds measured time before the attempted interaction; use an event-linked frame recipe when that delay would change the behavior being investigated.

Before/after comparison requires the same measured executable scenario/configuration source identity and Playwright test case, plus the same committed claim and proof requirements. Presentation titles and variant labels may differ. Imported local source is hashed without execution; dynamic runtime file reads and arbitrary deployed application inputs are not inferred. Supply explicit build identity for deployed builds. Older runs without measured executable identity remain inspectable but do not establish verified paired proof: recapture both variants rather than filling in identity fields by hand.

Comparison video displays scenario steps separately from checkpoint numbers. Each pane advances its own numbered step and trigger label at measured synchronization times. Expected results remain visible; observed result and “Bug reproduced”/“Fix verified” labels start only after the recorded designated assertions. Portable review adds onion, wipe, difference and edge modes. **Independent presentation timing** includes reading holds; use local review’s **Original timing** for unedited capture timing.

Executable plans, timelines and quality results are defined in `@jitterbox/repro-contracts` using Zod. The existing `plan.schema.json` remains the legacy document format; new executable plans use `executable-plan.schema.json`. Normal builds verify generated schemas without modifying tracked sources. Schema regeneration is explicit: `pnpm --filter @jitterbox/repro-contracts generate:schemas`. `parsePlan` and `parseTimeline` apply semantic timing checks in addition to generated structural constraints. MCP exposes `repro://plan-schema`, `repro://timeline-schema` and `repro://quality-result-schema` on demand.

To materialize current defaults in an older committed run without changing it, use `repro migrate-run older-run --out-dir migrated-run`. The command requires a new directory, verifies every referenced artifact, preserves the original manifest, and publishes the new manifest last. It preserves existing outcomes; unknown identities and missing observations remain unknown. Legacy delivery-only `manifest.json` documents remain supported by their compatibility commands; they cannot acquire committed-scenario proof without recapture.

## Phase 4–5 iteration and observation APIs

`REPRO_OCR_WORKERS=2` is the default (valid range 1–8). Every unique output
frame still runs both automatic and sparse Tesseract layouts; identical frame
bytes share the result. A failed worker blocks strict export and active workers
finish before temporary files are removed. Quality gates share identical frame
extractions/luminance measurements within one evaluation, with two decoder jobs
and a bounded result cache. Their result includes analysis cache-hit metrics.

An unchanged `repro export` can now return `cacheHit: true`. Reuse checks input
bytes, captions/titles/roles, report and synchronization data, privacy patterns,
viewer files, implementation digests, tool versions and OCR model contents.
Every output file and audit receipt is verified again. Missing/corrupt/extra
files invalidate reuse; missing OCR still blocks strict export. A custom
`REPRO_OCR_COMMAND` disables export reuse. The bundle-local cache record contains
hashes only and moves with the evidence package.

Publication uses SQLite transaction locks for renders, compositor assets, stages,
exports and delivery. The OS releases these locks after a writer dies; Repro does
not guess a lock is stale from elapsed time. Retain adjacent `.lock.sqlite` files
while writers may be active. Older `.lock` sentinel files require inspection
before removal. These guarantees require a local filesystem with working SQLite
locks; do not share a writable capture/cache directory over an unreliable network
filesystem. See [SQLite locking](https://www.sqlite.org/lockingv3.html).

To keep a build server alive through watch reruns, write `server.json`:

```json
{
  "command": "node",
  "args": ["dev-server.mjs"],
  "url": "http://127.0.0.1:3000",
  "startupTimeoutMs": 30000
}
```

Then run `repro run scenario.spec.ts --evidence evidence.json --url
http://127.0.0.1:3000 --watch --watch-server server.json`. Arguments are passed
directly, without a shell; optional `cwd` selects the command's working directory.
The URL must be loopback and must not already be serving another process. If the
Playwright config also declares that web server, set its `reuseExistingServer` to
`true`. Keep matching controlled timezone/locale/viewport settings in that config.
Edits cancel the previous browser run while retaining the build server. SIGINT or
SIGTERM closes the watch session and its owned process tree. An unexpected server
exit stops watch execution and reports an error. Its schema is also an MCP resource
at `repro://watch-server-schema`.

`await repro.visibility('checkpoint', 'target')` samples a bound target without a
wait or interaction. Declare that target in the checkpoint and add `visibility`
to its required observations. It records absence, attached/hidden state and
Playwright visibility, with counts and measurement timestamps. Consecutive valid
samples reference each other and identify appearance/disappearance. Ambiguous
samples are unsupported. Visibility does not establish opacity, lack of occlusion,
or continuous stability between samples; use the hit-test recipe for obstruction.
An absent target is a valid visibility measurement, never invented geometry.

`await repro.network('checkpoint', response)` records an actual Playwright
Response. Register `page.waitForResponse(...)` before the trigger, then pass its
result to this method. The observation includes sanitized URL, method, HTTP status
and service-worker provenance. It excludes query strings, credentials, headers and
bodies. Its timestamp is the observation time, not an invented arrival timestamp.
HTTP 503 is valid evidence of a response; a separate assertion determines whether
that response and the resulting UI satisfy the claim. Transport failures remain
in passive browser diagnostics. `repro describe visibility --json` and
`repro describe network --json` expose the same guidance to agents.

Issue delivery snapshots MP4/PNG bytes into a private `.repro/outbox` audit
workspace, audits that immutable copy and verifies its receipt before sending
those exact bytes. Remote filenames use content identity rather than local source
names. Outbox state stays outside portable evidence bundles. Retrying reconciles
actual issue attachments and verifies downloaded bytes before declaring delivery;
a local receipt alone cannot establish that a remote attachment still exists.

Build a portable toolchain with `pnpm build` followed by
`pnpm release:pack .repro/release`. The destination must be new. It contains all
required Repro tarballs, a package manifest with relative dependency overrides,
checksums and installation instructions. Move the whole directory, then run
`pnpm install` inside it. This distribution does not require ownership of the
`@jitterbox` npm scope and does not publish any package. `pnpm test:clean-install`
uses this same packer and executes installed CLI/Playwright scenarios after moving
the bundle into an unrelated consumer directory and checking its tarball hashes.

Use the managed server command's own normal rebuild/watch mode. Editing
`server.json` requires restarting the watch session to change that process's
launch configuration.

Measure annotation iteration with `pnpm test:annotation-benchmark <run-directory>`
after building and installing Tesseract. Without a run argument it uses the public
workflow's after-run. The benchmark copies the capture, performs one warmup and
seven different title edits through `repro render`, verifies the captured bytes
remain unchanged, and OCR-checks each resulting checkpoint title. Timings cover
the complete CLI render call; copying, OCR verification and export are excluded.
Reports retain all samples, the median, input hashes, implementation digests,
font hashes and machine/tool identity under `.repro/annotation-benchmark`.
`REPRO_BENCHMARK_CLI` can select an independently built comparison version and
`REPRO_BENCHMARK_OUT` selects the report directory. Run both versions on the same
machine and capture to compare annotation work. A current measurement does not
reconstruct the missing historical Phase 1 median; the report explicitly leaves
the 50% improvement gate unassessed without an approved comparable baseline.

## Scene renderer

For Hyperframes treatments, replayed source intervals, scene review, or scene before/after output, read [scene-renderer.md](scene-renderer.md) before selecting commands. It documents the sole rendering path and its export gate.

### Privacy audit diagnosis and efficient retries

After an export failure, open the returned private audit report before taking any new action. `repro audit RUN --json` performs the same frame OCR without packaging; `repro frame RUN --presentation --time-ms N` inspects a rendered frame in output time. Findings retain source-frame provenance when available. Completed OCR batches are reused under the same image/model/policy identity; failures still block export. Presentation repairs reuse capture footage. See [workflow auditing](workflow-audit.md) for report privacy, CLI/MCP interfaces, progress and phase timings.
