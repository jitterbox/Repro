# AGENTS.md — Repro

You are operating in the **Repro** monorepo: an AI-driven bug reproduction video
pipeline (Playwright capture → annotated MP4 → ADO/Jira evidence).

## Read first

1. **[`docs/ai-usage.md`](docs/ai-usage.md)** — full AI playbook: modes, feature
   flags, **bug-class → config matrix**, CLI playbooks, conflict rules, example
   configs, and hard constraints.
2. Skills (thin CLI wrappers): `skills/repro-{capture,annotate,compare,file}/`
3. Spike decisions: [`docs/spikes.md`](docs/spikes.md)
4. Fixture corpus: [`apps/shoplite/`](apps/shoplite/) + [`testdata/bugs/`](testdata/bugs/)
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
| Capture / annotate / file | matching `skills/repro-*` |
| Before/after | mode `compare` + `repro compare` |
| Validate setup | `pnpm build && node scripts/e2e/smoke.mjs` |
| Fixture bugs / feature videos | `apps/shoplite`, `testdata/bugs`, `pnpm test:e2e-fixture` |
