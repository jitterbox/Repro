# Golden Corpus

This directory holds small, deterministic manifests used to evaluate Repro
quality gates. Fixtures are intentionally advisory and should not require live
LLM calls during CI.

Required dimensions must pass before a run is considered successful. Pipeline
completion alone is not success.

## Fixtures

- `login-flow.manifest.json` covers a happy-path repro with redaction enabled.
- `redaction-block.manifest.json` covers a strict redaction gate failure.
- `compare-drift.manifest.json` covers alignment and visual drift metrics.
