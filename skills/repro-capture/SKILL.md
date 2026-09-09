---
name: repro-capture
description: Use Repro to capture browser bug evidence with committed scenarios, measured checkpoints, and verified outcomes.
---

# repro-capture

Use this skill when an agent needs to capture a deterministic Repro run from a
committed config and target URL.

## Required Inputs

- Repro config JSON path.
- Target URL when the config does not drive navigation itself.
- Output directory for the capture database, frames, and evidence.

## Command

```bash
repro capture --config repro.config.json --url "$URL" --out-dir .repro/run
```

## Conflict Rules Summary

- Compare mode requires the controlled capture profile.
- `showActions` conflicts with timing-sensitive captures and pixel diffs.
- Onion/difference compare modes require matching viewport DSF.
- Voiceover conflicts with preserved real timing.
- Strict redaction requires the redaction feature gate.

## Bug class → capture profile

| Class                    | Profile      | Notes                                          |
| ------------------------ | ------------ | ---------------------------------------------- |
| Race / flake / prod-like | `faithful`   | Set `timingSensitive` when needed              |
| Visual compare / demo    | `controlled` | Required for mode `compare`                    |
| PII / auth               | either       | Always enable `redaction` (+ `strict` to file) |

See [`docs/ai-usage.md`](../../docs/ai-usage.md) for the full matrix and example
`repro.config.json` files.

## Discipline

Discovery may use an LLM once to understand the scenario. Commit the resulting
deterministic `*.spec.ts`, then CI must rerun the same spec with no LLM.

Never put credentials in agent context. Invoke the CLI and let configured vault
or environment integrations handle secrets.

## Evidence workflow

1. **Claim:** State what the evidence must prove. Give the scenario a descriptive title; use separate Before/After variant labels. Only label results “Bug reproduced” or “Fix verified” when designated outcome checks support them.
2. **Recipe:** Run `repro capabilities --json`, `repro describe <capability> --json`, `repro recipes --json`, and `repro doctor`. Choose a recipe and commit its evidence specification alongside the executable Playwright test. Bind locators in code; reference target IDs in the evidence file.
3. **Capture:** Use `test` from `@repro/playwright`, `repro.target`, `repro.step`, `repro.outcome`, and `repro.checkpoint`. Run `repro validate-evidence evidence.json` and `repro validate-config --config repro.config.json`, then `repro run scenario.spec.ts --evidence evidence.json --url "$URL"`. Repeated attempts must all be reported.
4. **Inspect:** Use `repro frame <run> --checkpoint <id>` and `repro review <run>`. Inspect the actual image; check the title, variant, trigger, numbered steps, expected/observed result, framing, timestamps, uncertainty and crop transform. Keep a context image. Default crop padding is 24 CSS pixels. For positional comparisons, retain common bounds and scale.
5. **Verify:** Rerun the same committed claim after the fix with an explicit baseline. Preserve unrelated test failures as errors. Never silently heal assertions. Capture transient behavior before its trigger; do not wait for stability when instability is the subject.
6. **Export:** Only export inspected presentation media after required evidence and actual frame OCR pass. Missing OCR blocks strict export. Never include raw captures, traces, HAR or credentials in a shareable package.

For hidden-hitbox claims, `repro.hitTest(checkpoint, target, point)` records a point sample, hit-test stack, styles and measured bounds. A box outline is not proof of the complete hit region. Label each diagnostic and reference its observation. Do not change CSS or force-click to manufacture evidence. An absent target is absent; a baseline footprint must be labelled as such.

Built-in browser screenshots or exploration MCPs can help discover a scenario. Committed proof must use Repro's capture owner and clock. Do not run another screencast owner concurrently. Optional local diagnostics must disable external telemetry and CrUX requests. MCP resources `repro://capabilities`, `repro://recipes`, `repro://evidence-schema` and `repro://run-schema` expose on-demand guidance.
