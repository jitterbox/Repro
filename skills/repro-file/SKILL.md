# repro-file

Use this skill when an agent needs to file Repro evidence into ADO or Jira after
redaction and OCR gates pass.

## Required Inputs

- ALM system: `ado` or `jira`.
- Evidence artifact path.
- Title.
- Optional config path for strict redaction gate.
- Optional ALM endpoint configured outside agent context.

## Command

```bash
repro file \
  --system jira \
  --evidence .repro/package/viewer/rendered.mp4 \
  --title "Bug reproduction"
```

## Conflict Rules Summary

- Compare mode requires the controlled capture profile.
- `showActions` conflicts with timing-sensitive captures and pixel diffs.
- Onion/difference compare modes require matching viewport DSF.
- Voiceover conflicts with preserved real timing.
- Strict redaction requires the redaction feature gate.

## Pre-flight for filing

1. Config has `features.redaction` + `redaction.strict` when evidence may contain
   PII.
2. `repro package` produced external MP4/VTT/JSON (no base64 embeds).
3. OCR gate must pass — missing audit inputs fail closed under strict mode.
4. Filename: `{ISSUEID}__{slug}__{env}__{sha7}__{ISO8601Z}.mp4`

Playbook: [`docs/ai-usage.md`](../../docs/ai-usage.md) §7D / §10.

## Discipline

Discovery may use an LLM once to summarize the issue. Commit the deterministic
`*.spec.ts`; CI reruns capture, render, OCR gate, and filing prep with no LLM.

Never put credentials in agent context. Call the CLI so tokens remain in ALM
configuration, vault, or environment variables.
