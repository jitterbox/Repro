---
name: repro-annotate
description: Render or revise a Repro evidence video from a committed capture, choosing measured treatments and inspecting the result without unnecessary recapture.
---

# Render captured evidence

1. Obtain the run directory returned by `repro run`. Inspect the decisive source checkpoint with `repro frame RUN --checkpoint ID` before rendering. Required observations and original source frames must exist.
2. Read `repro treatments --json`. Use default presentation or author only relevant evidence-referenced treatments. For styling changes, start with `repro defaults --out treatment.json`, then `repro validate-treatment treatment.json`.
3. Run `repro render RUN` (optionally `--treatment treatment.json` or `--evidence edited.json`). The polished scene compositor is the only renderer. Known app version/build metadata appears by default; override with `--app-version` / `--build-id` or omit with `--no-version-overlay`.
4. Inspect `repro review RUN --presentation`, checkpoint stills and transition frames. Confirm readable pacing, correct targets, protected evidence, clean connectors and complete units. Allow at most three automatic presentation repairs, retaining diagnostics.
5. Reuse source footage for presentation changes. Recapture only for changed execution, missing required observations or capture/privacy failure; record the reason first.
6. Export reviewed individual videos using `repro export RUN --draft --out-dir evidence`. Strict OCR remains mandatory; unresolved evidence/privacy/visual failures block export. Final-quality and paired export remain gated.

Use [configuration](https://github.com/jitterbox/Repro/blob/master/docs/configuration.md) for adaptive panel placement, visual defaults and encoding. Use [scene rendering](https://github.com/jitterbox/Repro/blob/master/docs/scene-renderer.md) for supported treatments and limits. When auditing speed or tool use, follow [workflow auditing](https://github.com/jitterbox/Repro/blob/master/docs/workflow-audit.md) for native harness transcripts and private CLI timings.
