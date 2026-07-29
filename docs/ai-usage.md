# Repro — AI agent usage guide

This document is the authoritative playbook for agents (and humans driving
agents) that need to reproduce bugs, produce annotated evidence videos, compare
before/after runs, and file artifacts into Azure DevOps or Jira.

**Hard rules for agents**

1. Prefer CLI verbs (`repro …`) over inventing Playwright/ffmpeg scripts.
2. Never put ALM tokens, cookies, or vault keys in prompts or chat.
3. Follow the **product pipeline** (`validate-config` → `capture` → `annotate` →
   `package` / `file` / `compare` / `render-compare` → `quality`). CI reruns
   committed configs and specs with **no LLM** (see `.github/workflows/ci.yml`).
4. Always `repro validate-config` before capture when features/mode change.
5. Pipeline completion ≠ success — run `repro quality` / OCR gates as required.
6. Do not silently fall back from `surfaceCapture: "page"` to OS capture.

Related skills (thin CLI wrappers): `repro-capture`, `repro-annotate`,
`repro-compare`, `repro-file` under `skills/`.

Visual language, overlay theming, viewer UI, and Claude Design prompts:
[`design-brief.md`](design-brief.md).

---

## 1. Choose a mode (exactly one)

| Mode | When to use | Profile | Output intent |
| --- | --- | --- | --- |
| `repro` | Reproduce a failure for a single issue | Usually `faithful` | Annotated MP4 + evidence |
| `compare` | Before/after or baseline vs candidate | **Must** be `controlled` | Synced A/B layouts + geometry deltas |
| `demo` | Fix verification / walkthrough (no failure expected) | Often `controlled` | Narration-forward polished video |

Layouts (`side-by-side`, `onion`, `wipe`, `blink`, `difference`, `cropped-roi`,
edge overlay) are **render/compare parameters**, not modes. One compare capture
pair can emit multiple layouts. Prefer `cropped-roi` for sub-8px geometry deltas;
use `blink` only when explicitly opted in (never default — vestibular risk).

---

## 2. Capture profiles

| Profile | Semantics | Use when |
| --- | --- | --- |
| `faithful` | Preserve real timing, randomness, live network, service workers | Race bugs, flaky timing, “only in prod-like” repros |
| `controlled` | Frozen/seeded clock & RNG, reduced motion, optional HAR stub, blocked SW | `compare` mode, visual/regression diffs, demos that must be stable |

Compare mode **requires** `controlled`. Skipping determinism shifts all cost into
alignment noise.

---

## 3. Surface capture

| Value | Captures | Does **not** capture |
| --- | --- | --- |
| `page` (default) | Page content via screencast | Browser chrome, permission prompts, native file pickers, OS dialogs |
| `os` | Explicit OS-surface backend (extra privacy exposure) | — must be chosen deliberately and recorded in provenance |

Never silently upgrade `page` → `os`.

---

## 4. Feature flag catalog

Turn features on only when they help the bug class. More overlays ≠ better
evidence.

| Flag | What it captures / shows | Typical bug classes |
| --- | --- | --- |
| `cursor` | Pointer path | Click/miss, hover menus |
| `clickViz` | Click/tap ripples | Wrong target, double-submit |
| `keystrokes` | Key badges (printable suppressed in form fields by policy) | Shortcuts, IME, keyboard traps |
| `consoleOverlay` | Console/errors with trigger highlight | JS exceptions, failed assertions |
| `specCard` | Env/spec intro slate | Any filed ticket |
| `steps` | Chapters, step counter, progress bar | Multi-step repros |
| `pauses` | Freeze frames + PAUSED badge | “Wait for …” moments |
| `slowmo` | `setpts` slow-mo + speed badge | Fast UI that reviewers miss |
| `zoom` | ROI zoom callouts | Sub-pixel / small-control bugs |
| `redaction` | PII masking pipeline | Auth, PII, payments |
| `vitalsHud` | CLS/LCP/INP HUD | Perf / jank |
| `voiceover` | Kokoro narration + VTT (audio drives segment length) | Demos, stakeholder reviews |
| `freezeDetect` | LoAF / rAF freeze badges | Main-thread hangs |
| `a11yOverlay` | A11y issue overlays | Axe/ARIA failures |
| `hiddenElements` | Hidden / `aria-hidden` callouts | Invisible interactive controls |
| `hitTargets` | Hit-test / touch-target viz | Mis-clicks, tiny targets |
| `stackingContexts` | Stacking/z-index viz | Click-through, overlay traps |
| `layoutShiftViz` | Layout-shift regions | CLS, jumping UI |

Additional knobs on config (not feature flags):

| Field | Meaning |
| --- | --- |
| `showActions` | Playwright native action callouts (~500ms block per action) |
| `timingSensitive` | Race/timing bug — **forbids** `showActions` |
| `preserveRealTiming` | Keep wall timing — **conflicts** with `voiceover` |
| `redaction.strict` | OCR audit gate blocks ALM upload on any hit |
| `compare.strategy` / `compare.streams` | A/B layout and stream types |

---

## 5. Bug / issue class → recommended config

Use this matrix when classifying a ticket. Start from the row, then add
`specCard` + `steps` for anything you will file.

**Beat / duration guidance:** Filed `repro` videos target **15–30s** total output
time; compare beats run **3–4s** per aligned step. Use timeline beats (hold,
slowmo, outcome) rather than stretching capture tail — pauses hold at the beat,
not after the action fades.

| Bug / task class | Mode | Profile | Features (on) | Also set | Avoid |
| --- | --- | --- | --- | --- | --- |
| Functional failure (happy-path break) | `repro` | `faithful` | `steps`, `clickViz`, `consoleOverlay`, `specCard` | — | Heavy `slowmo` unless needed |
| Race / timing flake | `repro` | `faithful` | `steps`, `freezeDetect`, `vitalsHud`, `pauses` | `timingSensitive: true` | `showActions`, `controlled` |
| Console / uncaught exception | `repro` | `faithful` | `consoleOverlay`, `steps`, `clickViz` | — | — |
| CLS / layout shift | `repro` | `faithful` or `controlled`* | `layoutShiftViz`, `vitalsHud`, `zoom`, `slowmo` | Slow at shift | `showActions` if measuring pixels |
| Freeze / hang / long task | `repro` | `faithful` | `freezeDetect`, `vitalsHud`, `pauses`, `steps` | — | `voiceover` pacing that hides duration |
| Visual / CSS / spacing | `compare` | `controlled` | `steps`, `zoom`, optional `cursor` | DOM geometry primary; pixel confirmation | Different viewport/DSF |
| Regression after fix | `compare` | `controlled` | `steps`, `specCard` | Identical env manifests | Env drift without override |
| Click / hit-target miss | `repro` | `faithful` | `hitTargets`, `clickViz`, `cursor`, `zoom` | — | — |
| Keyboard / a11y trap | `repro` | `faithful` | `keystrokes`, `a11yOverlay`, `hiddenElements`, `steps` | — | Overlay without `inert` (probe handles this) |
| Stacking / modal click-through | `repro` | `faithful` | `stackingContexts`, `clickViz`, `cursor` | — | — |
| Form / PII / auth flow | `repro` | `faithful` | `redaction`, `steps`, `keystrokes`† | `redaction.strict: true` | Filing without OCR gate |
| Network / API error UX | `repro` | `faithful` | `steps`, `consoleOverlay`, `specCard` | Keep sanitized HAR | Raw HAR bodies |
| Perf / INP / LCP | `repro` | `faithful` | `vitalsHud`, `steps`, `slowmo` | — | Artificial `controlled` that hides jank |
| Multi-page / popup flow | `repro` | `faithful` | `steps`, `specCard`, `clickViz` | Expect editorial cuts | Single-page assumptions |
| Demo / stakeholder walkthrough | `demo` | `controlled` | `steps`, `voiceover`, `specCard`, `cursor` | Drop `preserveRealTiming` | `timingSensitive` |
| Fix verification (pass expected) | `demo` | `controlled` | `steps`, `specCard`, optional `voiceover` | Assert no failure | Filing as “bug” without outcome slate |

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
    "voiceover": true,
    "cursor": true,
    "clickViz": true,
    "specCard": true
  }
}
```

---

## 6. Conflict rules (validator-enforced)

Run `repro validate-config -c repro.config.json` after every config edit.

| Rule | Effect |
| --- | --- |
| `compare` ⇒ `profile: "controlled"` | Error otherwise |
| `showActions` + `timingSensitive` | Error |
| `showActions` + `compare.streams` includes `pixel-diff` | Error |
| `onion` / `difference` ⇒ identical viewport + DSF | Error if mismatched |
| `voiceover` + `preserveRealTiming` | Error |
| `redaction.strict` without `features.redaction` | Error |
| Material env drift on compare | Fail unless `--override-env-drift` |

Warnings: redaction enabled without `strict` on protected captures.

---

## 7. End-to-end task playbooks

### A. Single-issue repro → annotated MP4 → package

1. Classify bug → pick mode/features from §5.
2. Write `repro.config.json`; `repro validate-config -c …`.
3. Commit `issue.spec.ts` (deterministic actions) after one discovery pass.
4. `repro capture -c repro.config.json --url "$URL" -o .repro/run`
5. Export/use events JSONL + encoded video from the run directory.
6. `repro annotate -c … --events … --video … -o .repro/rendered`
7. `repro package -o .repro/package --asset mp4:… --asset vtt:… --asset json:…`
8. Optional: `repro quality --input …`

### B. Race / timing-sensitive bug

1. `mode: "repro"`, `profile: "faithful"`, `timingSensitive: true`.
2. Features: `freezeDetect`, `vitalsHud`, `pauses`, `steps` — **no** `showActions`.
3. Capture live network; do not HAR-stub unless the race is independent of net.
4. Prefer PNG anchors at failure; cite anchors in the ticket, not JPEG alone.

### C. Before/after visual or geometry compare

1. Two controlled captures with **identical** viewport, DSF, locale, fonts, browser.
2. Emit compare manifests (`steps` + `geometry` + `environment`).
3. `repro compare baseline.json candidate.json -o .repro/compare.json`
4. Prefer DOM geometry deltas for sub-5px claims; use difference/edge layouts as
   confirmation.
5. Caption timing gaps (“before 412ms / after 1180ms”) — often the bug itself.

### D. PII / auth evidence for ALM

1. `features.redaction: true`, `redaction.strict: true`.
2. Capture → annotate → package.
3. `repro file --system jira|ado --evidence … --title … -c repro.config.json`
4. Strict OCR with no audit inputs **fails closed** (does not silently pass).
5. Credentials only via env/vault — never in agent context.

### E. Demo / release walkthrough

1. `mode: "demo"`, `profile: "controlled"`, `voiceover: true`.
2. Do **not** set `preserveRealTiming`.
3. Narration document drives VTT + transcript; video pads to audio.

### F. Resume a failed stage

```bash
repro capture -c repro.config.json --url "$URL" -o .repro/run --resume .repro/run
repro annotate -c … --events … --video … -o .repro/rendered --resume .repro/rendered
```

Stages are content-addressed; matching cache keys skip completed work.

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

| Task | Command |
| --- | --- |
| Validate features/mode | `repro validate-config -c repro.config.json` |
| Capture run | `repro capture -c … --url … -o …` |
| Annotate + render | `repro annotate -c … --events … --video … -o …` |
| Compare manifests | `repro compare left.json right.json -o out.json` |
| Package viewer bundle | `repro package -o … --asset mp4:…` |
| Quality gate | `repro quality --input … -o report.json` |
| File to ADO/Jira | `repro file --system jira --evidence … --title …` |
| Smoke E2E | `node scripts/e2e/smoke.mjs` |
| Golden eval | `node scripts/evaluation/run-golden.mjs` |

Build first: `pnpm build` (or `pnpm --filter @repro/cli build`).

---

## 10. Evidence & naming

ALM attachment basename:

`{ISSUEID}__{slug}__{env}__{sha7}__{ISO8601Z}.mp4`

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
          NO  → mode=demo (optional voiceover)
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

| Agent goal | Skill |
| --- | --- |
| Record a session | `repro-capture` |
| Burn annotations into video | `repro-annotate` |
| Sync before/after | `repro-compare` |
| Attach to ADO/Jira | `repro-file` |

Skills are wrappers: they must call the CLI, not reimplement capture/render.

---

## 14. Fixture corpus (ShopLite)

Evaluation app and bug work items live in-repo (not in ALM):

| Path | Role |
| --- | --- |
| [`apps/shoplite/`](../apps/shoplite/) | Broken/fixed demo SPA (`?fixture=broken\|fixed`) |
| [`testdata/bugs/`](../testdata/bugs/) | ADO-shaped `BUG-10xx.json` work items |
| [`testdata/specs/`](../testdata/specs/) | Fake ACs + mockup tokens |
| [`packages/e2e-fixture/`](../packages/e2e-fixture/) | Vitest harness + feature-coverage scenarios |

### Toggle broken ↔ fixed

```bash
pnpm shoplite:dev
# http://localhost:5177/?fixture=broken
# http://localhost:5177/?fixture=fixed
```

The document element gets `data-repro-fixture="broken|fixed"`. Switching is
global for the whole app (not per bug) and does not require a rebuild.

### Generate coverage videos

```bash
pnpm build
pnpm test:e2e-fixture
```

Artifacts write to `.repro/fixture-videos/<scenario>/` (gitignored). Each
scenario exercises a slice of modes/features/layouts so the suite covers the
feature checklist without a full Cartesian matrix. Each bug JSON includes
`Custom.ReproConfig` — use that as the source of truth for recommended flags.
