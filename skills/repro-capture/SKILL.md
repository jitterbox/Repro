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

| Class | Profile | Notes |
| --- | --- | --- |
| Race / flake / prod-like | `faithful` | Set `timingSensitive` when needed |
| Visual compare / demo | `controlled` | Required for mode `compare` |
| PII / auth | either | Always enable `redaction` (+ `strict` to file) |

See [`docs/ai-usage.md`](../../docs/ai-usage.md) for the full matrix and example
`repro.config.json` files.

## Discipline

Discovery may use an LLM once to understand the scenario. Commit the resulting
deterministic `*.spec.ts`, then CI must rerun the same spec with no LLM.

Never put credentials in agent context. Invoke the CLI and let configured vault
or environment integrations handle secrets.
