---
name: repro-compare
description: Compare matching Repro runs, verify before/after assertions, and render synchronized scene panes with measured differences.
---

# Compare captured runs

1. Obtain Before and After run directories for the same committed scenario and test case. Verified comparison requires controlled profiles and designated failing/passing assertions.
2. Run `repro compare BEFORE AFTER`. Resolve incompatible environments or missing observations before claiming a verified fix.
3. Render each run with `repro render RUN`, optionally with its own validated treatment plan. Inspect each presentation before pairing.
4. Run `repro render AFTER --baseline BEFORE`. For faithful captures use `--observational`; this labels playback without claiming controlled equivalence.
5. Inspect pane labels, shared scale, checkpoint alignment, waiting states and difference callouts. Prefer individual videos unless simultaneous comparison helps explain the issue.
6. Paired rendering is local review output. Export individually reviewed runs with `repro export RUN --draft --out-dir evidence`; strict OCR remains mandatory. Occurrence-aware paired packaging remains gated.

The compositor supplies side-by-side scene playback; retired FFmpeg onion/wipe/blink/difference video layouts are not supported. Numeric and geometry comparison reports remain available.

Read [scene rendering](https://github.com/jitterbox/Repro/blob/master/docs/scene-renderer.md) for proof semantics and [configuration](https://github.com/jitterbox/Repro/blob/master/docs/configuration.md) for treatments and adaptive placement. Reuse valid captures for presentation-only repairs.
