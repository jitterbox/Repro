<p align="center">
  <img src="assets/branding/repro-logo.png" alt="Repro — replay bug logo" width="480">
</p>

# Repro

**Turn real browser interactions into clear, annotated reproduction videos and synchronized developer evidence.**

Repro records existing websites with Playwright, then adds measured highlights, numbered steps, cursor feedback, magnifiers, slow replay and diagnostic panels. An AI agent can plan the scenario and choose relevant treatments. The committed scenario, capture and rendering run locally without a model or AI API key.

## Install with your AI agent

```sh
npx skills@latest add jitterbox/Repro --copy
```

Choose your harness—Claude Code, Cursor, Codex or another supported agent—and the Repro skills. Then ask:

> Use repro-setup to install Repro, then record this workflow on my QA site.

The setup skill installs the CLI and checks Chromium, FFmpeg and OCR. Skills are portable instructions around the same CLI; they do not supply an AI model. [Installation guide →](docs/installation.md)

Skills are also bundled in the npm CLI package. After the npm installation below,
install them without GitHub access using `npx skills@latest add ./node_modules/@jitterbox/repro-cli/skills --copy`.


## Install the CLI

From an evidence project with Node 22+:

```sh
npm install --save-dev @jitterbox/repro-cli@0.3.2 @jitterbox/repro-playwright@0.3.2
npx repro setup --system
npx repro doctor
npx repro init DASH2R-949 --description "Mobile metric overflow"
```

The same commands work in **Windows PowerShell and Linux**. System setup uses WinGet on Windows and apt on Ubuntu/Debian; it can require elevation. Other Linux distributions use their package manager for native dependencies. The initial support baseline is x64. [OS requirements, offline packages and troubleshooting →](docs/installation.md#native-dependencies-and-supported-hosts)

Optional: install `@jitterbox/repro-mcp@0.3.2` to expose tools/resources through a local stdio MCP server. [MCP setup →](docs/installation.md#mcp)

## Record a website—with or without its source

With only a QA URL and authorized access, keep a separate evidence folder. An agent explores the real UI, binds locators, defines expected/observed results and commits a Playwright scenario. Repository access additionally helps locate routes, instrumentation and source/build references; it is not required to record a website.

After editing the starter scenario and evidence files to match your app:

```sh
npx repro validate-config --config repro.config.json
npx repro validate-evidence evidence.json
npx repro run scenario.spec.ts --evidence evidence.json --config repro.config.json --url https://qa.example.com
```

Use the run directory returned by the command to render, inspect and export:

```sh
npx repro defaults --out treatment.json
npx repro treatments --json
npx repro validate-treatment treatment.json
npx repro render path/to/run --treatment treatment.json
npx repro review path/to/run
npx repro export path/to/run --draft --out-dir evidence-bundle
```

Issue IDs/descriptions belong to each scenario or run. The app-level `naming.useWorkItemId` policy defaults to true: prefer a supplied ID, otherwise use a brief description plus a stable uniqueness suffix. Set it to false or pass `--no-use-work-item-id` to always use descriptive names. Videos and the default sanitized DevTools JSON share the same base name; `--no-devtools` disables diagnostic export. [Naming and export settings →](docs/configuration.md#work-item-names-and-browser-diagnostics)

A persistent app version/build textbox is **on by default when values are known**. Supply `--app-version` / `--build-id`, or let Repro read declared version metadata at runtime. Configure app-specific selectors/property paths, or disable it with `versionOverlay.enabled: false` / `--no-version-overlay`. [Version/build settings →](docs/configuration.md#persistent-application-versionbuild-textbox)

Add relevant treatments and step descriptions to `treatment.json` before rendering. Inspect the actual frames and motion; a valid plan alone does not establish good evidence. The polished Hyperframes scene compositor is the only renderer. Audited draft export remains required while final-quality acceptance gates are completed. `--draft` never bypasses privacy/OCR checks. [Scene workflow and current limits →](docs/scene-renderer.md)

Before and after can be captured on different days and reviewed independently. Use a controlled comparison when matching scenario identity and assertions justify a fix-verification claim; side-by-side output is optional.

## Make the output yours

Configure text sizes, line spacing, card width/padding/corners, layout gutters, colors, transitions, reading holds, cursor glow, optional action audio, output scale and H.264 quality/speed. Commit these choices with the treatment plan and re-render without recapturing. Fonts are bundled and the scene records resolved settings for replay. [Configuration guide →](docs/configuration.md)

The agent chooses evidence and treatment intent; shipped components implement the visuals. Older models can render the same committed plan, but their ability to discover the right interaction and choose treatments has not been established by cross-generation benchmarks. Review and validation remain part of the workflow.

## Documentation

- [Install CLI, skills and MCP](docs/installation.md)
- [Configure visuals, timing, encoding and capture](docs/configuration.md)
- [Every CLI command and option](docs/reference/cli.md)
- [Every MCP tool, input and resource](docs/reference/mcp.md)
- [All configuration and artifact schemas](docs/reference/schemas.md)
- [Playwright observation and input API](docs/playwright-api.md)
- [Agent workflows and bug-class recipes](docs/ai-usage.md)
- [Workflow timings, privacy audit reports and efficient retries](docs/workflow-audit.md)
- [Rendering, diagnostics and acceptance status](docs/scene-renderer.md)
- [Release and npm publishing](docs/releasing.md)
- [Complete documentation index](docs/README.md)

## Develop and validate

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm lint
pnpm docs:check
pnpm test
```

Browser/media tests require `repro setup --system`. `pnpm test:clean-install` verifies relocatable packages in an unrelated consumer project. [CI](.github/workflows/ci.yml) checks Windows and Linux runtime paths; the larger [scene acceptance suite](.github/workflows/scene-acceptance.yml) includes rendered fixtures and privacy gates. Read [AGENTS.md](AGENTS.md) before changing capture/evidence behavior.

[Apache-2.0](LICENSE). Dependencies and installed media tools retain their respective licenses; bundled fonts use the SIL Open Font License. See [third-party notices](packages/compositor/THIRD_PARTY_NOTICES.md).
