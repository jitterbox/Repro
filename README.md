# Repro

Monorepo for the **Repro AI** bug reproduction video pipeline.

## Documentation

| Doc | Audience |
| --- | --- |
| [`AGENTS.md`](AGENTS.md) | Agent entrypoint (constraints + routing) |
| [`docs/ai-usage.md`](docs/ai-usage.md) | Full AI playbook: modes, features, **bug-class → config matrix**, CLI playbooks |
| [`docs/spikes.md`](docs/spikes.md) | Phase 0 spike results / design locks |
| `skills/repro-*/SKILL.md` | Thin CLI wrappers for capture / annotate / compare / file |

## Packages

| Package             | Description                          |
| ------------------- | ------------------------------------ |
| `@repro/contracts`  | Shared types and schemas             |
| `@repro/core`       | Core pipeline orchestration          |
| `@repro/probe`      | Environment and app probing          |
| `@repro/capture`    | Session capture                      |
| `@repro/plan`       | Reproduction plan generation         |
| `@repro/render`     | Video rendering                      |
| `@repro/compare`    | Visual / behavioral comparison       |
| `@repro/alm`        | Application lifecycle management     |
| `@repro/vault`      | Secrets and artifact storage         |
| `@repro/cli`        | Command-line interface               |
| `@repro/viewer`     | Accessible report viewer             |
| `@repro/evaluation` | Quality gates / DiffSpot+WUICC stubs |

## Requirements

- Node.js 22 (`nvm use`)
- [pnpm](https://pnpm.io/) 9+
- ffmpeg 6+ (8.x recommended; `maskedmerge` / `gblur` / `pixelize`)

Phase 0 spike results: [`docs/spikes.md`](docs/spikes.md).

## Scripts

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm lint
pnpm test
```

## CLI Usage

The `@repro/cli` package exposes the `repro` binary after build.

```bash
pnpm --filter @repro/cli build
pnpm --filter @repro/cli exec repro validate-config --config repro.config.json
```

Capture validates the config with the core mode/feature conflict validator
before opening Playwright and writing a run store.

```bash
repro capture \
  --config repro.config.json \
  --url "https://example.test" \
  --out-dir .repro/run
```

Annotation consumes committed capture artifacts and renders a deterministic
video without another LLM pass.

```bash
repro annotate \
  --config repro.config.json \
  --events .repro/events.jsonl \
  --video .repro/raw.mp4 \
  --out-dir .repro/rendered
```

Comparison reads two JSON run manifests and reports structural differences.

```bash
repro compare .repro/baseline.json .repro/current.json
```

Filing runs the OCR redaction gate before preparing or uploading evidence to
ADO or Jira. Keep credentials in the ALM environment or vault integration, not
in agent context.

```bash
repro file \
  --system jira \
  --evidence .repro/rendered/rendered.mp4 \
  --title "Bug reproduction"
```

Packaging copies the built viewer bundle plus external MP4, VTT, and JSON
assets into a distributable evidence folder.

```bash
pnpm --filter @repro/viewer build
repro package \
  --out-dir .repro/package \
  --asset mp4:.repro/rendered/rendered.mp4 \
  --asset json:.repro/report.json
```

Quality evaluation treats pipeline completion as necessary but insufficient:
required dimensions such as redaction leakage, determinism, and human
usefulness must pass the gate.

```bash
repro quality \
  --input testdata/golden/login-flow.manifest.json \
  --out .repro/quality-report.json
node scripts/evaluation/run-golden.mjs
node scripts/e2e/smoke.mjs
```

## Layout

```
packages/
  alm/        capture/    cli/        compare/
  contracts/  core/       evaluation/ plan/
  probe/      render/     vault/      viewer/
```
