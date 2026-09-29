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

**0.2.0 release status:** package preparation is implemented; npm publication and pushing these changes are separate release steps. Until published, use the [source or packed-toolchain installation](docs/installation.md#install-from-source-now). Remote skill installation reads the pushed GitHub repository.

## Install the CLI

Once 0.2.0 is published, from an evidence project with Node 22+:

```sh
npm install --save-dev @repro/cli@0.2.0 @repro/playwright@0.2.0
npx repro setup --system
npx repro doctor
npx repro init
```

The same commands work in **Windows PowerShell and Linux**. System setup uses WinGet on Windows and apt on Ubuntu/Debian; it can require elevation. Other Linux distributions use their package manager for native dependencies. The initial support baseline is x64. [OS requirements, offline packages and troubleshooting →](docs/installation.md#native-dependencies-and-supported-hosts)

Optional: install `@repro/mcp@0.2.0` to expose tools/resources through a local stdio MCP server. [MCP setup →](docs/installation.md#mcp)

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
npx repro render path/to/run --renderer hyperframes --treatment treatment.json
npx repro review path/to/run
npx repro export path/to/run --draft --out-dir evidence-bundle
```

Add relevant treatments and step descriptions to `treatment.json` before rendering. Inspect the actual frames and motion; a valid plan alone does not establish good evidence. Hyperframes is currently an opt-in renderer with audited draft export. The legacy renderer remains the default while final promotion gates are completed. `--draft` never bypasses privacy/OCR checks. [Scene workflow and current limits →](docs/scene-renderer.md)

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
