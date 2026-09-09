# Repro

Repro turns a committed Playwright scenario into inspectable evidence of a browser bug and its fix. Capture original behavior, compare explicit before/after runs, review the pixels, and export audited screenshots, video, captions and a portable viewer. Execution and rendering require no LLM or hosted service.

## Start locally

Use Node 22 and pnpm 9.15.0. Install the lockfile-pinned Chromium plus FFmpeg, fonts and Tesseract for strict export.

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install --with-deps chromium
pnpm build
node packages/cli/dist/bin.js doctor
node packages/cli/dist/bin.js capabilities --json
node packages/cli/dist/bin.js recipes --json
```

The examples below use the installed `repro` executable. In this workspace, replace `repro` with `node packages/cli/dist/bin.js`. Packages can be packed and installed locally; registry publication is separate.

## Commit a scenario and its claim

```bash
repro init
repro describe checkpoint --json
repro describe hit-test --json
repro validate-config --config repro.config.json
repro validate-evidence evidence.json
```

Edit the generated Playwright spec with durable locators and assertions. In the evidence specification, name the scenario, explicit variant, meaningful numbered steps, trigger, expected result, targets, checkpoints and privacy requirements. Use `@repro/playwright` fixtures with ordinary Playwright setup, authentication, projects, retries and teardown.

For transient bugs, start a committed capture segment before the trigger and select a calibrated event-linked frame afterward. For hidden obstructions, inspect the hit-test sample image, measured element bounds and actual pointer recipient. These measurements do not establish an entire hidden hit region. See the [AI playbook](docs/ai-usage.md) for recipes and timing/privacy constraints.

## Capture, inspect and compare

The public fixture example manages its own local server:

```bash
repro run packages/playwright/examples/scenario.spec.ts \
  --playwright-config packages/playwright/examples/playwright.config.ts \
  --evidence packages/playwright/examples/before.json \
  --url http://127.0.0.1:3198 --out-dir .repro/before

repro run packages/playwright/examples/scenario.spec.ts \
  --playwright-config packages/playwright/examples/playwright.config.ts \
  --evidence packages/playwright/examples/after.json \
  --url 'http://127.0.0.1:3198?fixed=1' --out-dir .repro/after
```

Set `BEFORE_RUN` and `AFTER_RUN` to the respective `runs[0].directory` values returned by those commands. Each invocation has an isolated directory. Ordinary reruns observe the application again.

```bash
repro frame "$BEFORE_RUN" --checkpoint result --target target
repro frame "$AFTER_RUN" --checkpoint result --target target
repro compare "$BEFORE_RUN" "$AFTER_RUN"
repro review "$AFTER_RUN" --baseline "$BEFORE_RUN"
```

Review opens a loopback server with original recordings, synchronized playback, semantic steps, checkpoint context/crops, measured targets, assertions and browser diagnostics. A before assertion mismatch qualifies as bug evidence only when explicitly designated; unrelated failures remain unsuccessful or inconclusive. Comparisons require compatible controlled environments and the same measured scenario source/test identity. Unmatched or uncertain evidence cannot silently become verified proof.

## Render and export

```bash
repro render "$BEFORE_RUN"
repro render "$AFTER_RUN"
repro export "$AFTER_RUN" --baseline "$BEFORE_RUN" --out-dir .repro/bundle
```

Inspect the rendered stills and video before delivery. Presentation edits add reading holds, titles and highlights without changing execution timing. Unchanged renders reuse verified artifacts. Strict export audits actual media frames with local OCR and fails closed when evidence or OCR is missing. Share the resulting bundle; raw captures, events, HAR, traces and credentials stay local.

The bundle includes captions, descriptive image labels, before/after roles and a viewer that works after relocation. Serve its directory locally and open `viewer/public/index.html`. Side-by-side is the default; onion, wipe, difference and edge views are available. Independent **presentation** timing includes reading holds; local review provides original capture timing.

Existing `capture`, `annotate`, `render-compare`, `package`, `quality` and `file` verbs remain compatibility interfaces. Generic raw JSON is not a shareable package asset. Filing uses the existing Jira/ADO clients and outbox; keep ALM credentials outside prompts.

## Verification

```bash
pnpm typecheck
pnpm lint
pnpm test:milestone       # sequential browser/media checks; build first
pnpm test:e2e-fixture     # ShopLite regression corpus
pnpm test:clean-install  # packed packages in an unrelated consumer project
```

`test:milestone` records each check, duration, log and final result under `.repro/milestone` (override with `REPRO_MILESTONE_OUT`). It includes real captured pixels, synchronization negative controls, moving and network privacy canaries, all published recipes, relocated review and clean installation. Synthetic metadata/media controls are labeled explicitly. Optional live agent evaluation remains separate from deterministic CI.

## Architecture and guidance

- `@repro/contracts`: runtime Zod contracts, generated schemas, capability registry and visual tokens; independent of runtime core.
- `@repro/pipeline`: shared application services used by CLI, Playwright and the stdio MCP adapter.
- `@repro/playwright`: public fixtures and reporter; `@repro/cli`: developer interface; `@repro/mcp`: agent discovery and application-service adapter.
- Focused capture, plan, render, compare, viewer, evaluation, core, vault and ALM packages retain their domain responsibilities.
- [Agent entrypoint](AGENTS.md), [AI playbook](docs/ai-usage.md), [design brief](docs/design-brief.md), [spike decisions](docs/spikes.md), [implementation and acceptance ledger](docs/implementation-progress.md).

Generated capability documentation and schemas are in `packages/contracts/dist/discovery` after building. MCP exposes detailed schemas and recipes as on-demand resources. Commit discovery results as deterministic specs/configuration; CI executes them without an LLM.
