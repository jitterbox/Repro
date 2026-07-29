# repro-compare

Use this skill when an agent needs to compare two Repro run manifests, render a
compare composition MP4, or report layout artifacts.

## Required Inputs

- Left run JSON manifest.
- Right run JSON manifest.
- For rendered compare output: two MP4s plus a compare composition JSON.

## Commands

```bash
repro compare .repro/baseline.json .repro/current.json
```

```bash
repro render-compare \
  --composition .repro/compare-composition.json \
  --video-a .repro/before.mp4 \
  --video-b .repro/after.mp4 \
  -o .repro/compare-render
```

Composition schema and layout routing:
[`docs/design-recs/schemas/compare-composition.schema.json`](../../docs/design-recs/schemas/compare-composition.schema.json),
[`docs/design-recs/video-system-spec.md`](../../docs/design-recs/video-system-spec.md).

## Conflict Rules Summary

- Compare mode requires the controlled capture profile.
- `showActions` conflicts with timing-sensitive captures and pixel diffs.
- Onion/difference compare modes require matching viewport DSF.
- Voiceover conflicts with preserved real timing.
- Strict redaction requires the redaction feature gate.
- Prefer `cropped-roi` for sub-8px geometry; `blink` is opt-in only.

## When to use which layout

| Question | Prefer |
| --- | --- |
| Side-by-side review | `side-by-side` |
| Subtle pixel drift | `difference` / edge overlay |
| Overlay alignment | `onion` / `wipe` |
| Sub-8px geometry | `cropped-roi` (primary); DOM geometry deltas first |
| Vestibular-safe diff flash | `blink` only when explicitly requested |

Manifests must include `steps`, `geometry`, and `environment`. Material env
drift fails the compare unless `--override-env-drift`.

Playbook: [`docs/ai-usage.md`](../../docs/ai-usage.md) §5–§7.

## Discipline

Discovery may use an LLM once to decide which behavior to compare. Commit the
deterministic `*.spec.ts`; CI reruns the same comparison with no LLM.

Never put credentials in agent context. Use the CLI for comparison and artifact
loading.
