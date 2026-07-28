# repro-compare

Use this skill when an agent needs to compare two Repro run manifests or report
artifacts.

## Required Inputs

- Left run JSON manifest.
- Right run JSON manifest.

## Command

```bash
repro compare .repro/baseline.json .repro/current.json
```

## Conflict Rules Summary

- Compare mode requires the controlled capture profile.
- `showActions` conflicts with timing-sensitive captures and pixel diffs.
- Onion/difference compare modes require matching viewport DSF.
- Voiceover conflicts with preserved real timing.
- Strict redaction requires the redaction feature gate.

## Discipline

Discovery may use an LLM once to decide which behavior to compare. Commit the
deterministic `*.spec.ts`; CI reruns the same comparison with no LLM.

Never put credentials in agent context. Use the CLI for comparison and artifact
loading.
