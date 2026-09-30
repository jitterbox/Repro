# AGENTS.md — Repro

You are operating in the **Repro** monorepo: an AI-driven bug reproduction video
pipeline (Playwright capture → annotated MP4 → ADO/Jira evidence).

## Read first

1. **[`docs/ai-usage.md`](docs/ai-usage.md)** — full AI playbook: modes, feature
   flags, **bug-class → config matrix**, CLI playbooks, conflict rules, example
   configs, and hard constraints.
2. **[`docs/design-brief.md`](docs/design-brief.md)** — Claude Design brief for
   overlay language, theming, viewer UI, compare layouts, and skill visuals.
3. **Product pipeline** — `run → render → export/file` via `repro` CLI;
   deterministic artifacts in CI (`.github/workflows/ci.yml`). Nightly agent +
   judge eval is optional/non-blocking (`.github/workflows/ai-eval.yml`).
4. Skills (thin CLI wrappers): `skills/repro-{capture,annotate,compare,file}/`
5. Spike decisions: [`docs/spikes.md`](docs/spikes.md)
6. Fixture corpus: [`apps/shoplite/`](apps/shoplite/) + [`testdata/bugs/`](testdata/bugs/)
   (ADO-shaped work items). Run videos via `pnpm test:e2e-fixture`.

## Non-negotiables

- Invoke `repro` CLI verbs; do not invent ad-hoc ffmpeg/Playwright pipelines.
- Never place ALM tokens, cookies, or vault secrets in chat or prompts.
- LLM discovery once → commit deterministic `*.spec.ts` + `repro.config.json` →
  CI with no LLM.
- Run `repro validate-config` after changing mode/features.
- `compare` mode requires `profile: "controlled"`.
- `redaction.strict` fails closed on OCR audit — do not bypass.
- Page screencast ≠ OS UI; set `surfaceCapture: "os"` only explicitly.

## Quick routing

| Need | Start with |
| --- | --- |
| Classify bug → features | `docs/ai-usage.md` §5 |
| Design overlays / viewer / themes | `docs/design-brief.md` |
| Capture / render / file | matching `skills/repro-*` |
| Before/after | `repro compare` proof report + `repro render AFTER --baseline BEFORE` |
| Validate setup | `pnpm build && node scripts/e2e/smoke.mjs` |
| CI (no LLM) | `.github/workflows/ci.yml` |
| Agent / judge eval | `.github/workflows/ai-eval.yml` (nightly, non-blocking) |
| Fixture bugs / feature videos | `apps/shoplite`, `testdata/bugs`, `pnpm test:e2e-fixture` |
