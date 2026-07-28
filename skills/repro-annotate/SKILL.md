# repro-annotate

Use this skill when an agent needs to turn captured events and frames into an
annotated evidence video.

## Required Inputs

- Repro config JSON path.
- Event JSONL path from capture.
- Input MP4 path.
- Optional frame manifest JSON path.
- Output directory for `plan.json`, overlay files, and rendered MP4.

## Command

```bash
repro annotate \
  --config repro.config.json \
  --events .repro/events.jsonl \
  --video .repro/raw.mp4 \
  --out-dir .repro/rendered
```

## Conflict Rules Summary

- Compare mode requires the controlled capture profile.
- `showActions` conflicts with timing-sensitive captures and pixel diffs.
- Onion/difference compare modes require matching viewport DSF.
- Voiceover conflicts with preserved real timing.
- Strict redaction requires the redaction feature gate.

## Bug-Class Feature Defaults

| Bug class          | Default features                      |
| ------------------ | ------------------------------------- |
| CLS / layout shift | `layoutShiftViz`, `vitalsHud`, `zoom` |
| Freeze / hang      | `freezeDetect`, `pauses`, `vitalsHud` |
| Console error      | `consoleOverlay`, `steps`, `clickViz` |

## Discipline

Discovery may use an LLM once to identify useful callouts. Commit the
deterministic `*.spec.ts` and generated plan inputs, then CI reruns without LLM.

Never put credentials in agent context. Call the CLI so secrets stay in vault,
environment, or ALM integrations.
