---
name: repro-setup
description: Install or repair Repro's local CLI, browser, video and OCR tools on Windows or Linux, and verify agent workflows.
---

# Set up Repro

Repro is a local Node CLI plus optional MCP server. This skill does not include the runtime or an AI model. Use a separate evidence folder when the target application's source is unavailable.

1. Check Node 22+, npm, OS and architecture. The 0.2 renderer targets Windows x64 and Linux x64. Read [installation](https://github.com/jitterbox/Repro/blob/main/docs/installation.md) for source/tarball installation before npm publication, or for offline and non-Debian hosts.
2. Once the release is published, install project-local packages with `npm install --save-dev @repro/cli@0.2.0 @repro/playwright@0.2.0 @repro/mcp@0.2.0`. Use `npx repro` for the commands below when the CLI is project-local. Reuse an existing installed runtime instead of reinstalling it.
3. Run `repro setup --system --dry-run` to inspect the actual platform commands. Run `repro setup --system` when installation is authorized. Windows uses WinGet; Ubuntu/Debian uses apt and Playwright's system dependency installer. System packages can require an elevated terminal. `repro setup` installs the pinned browser without changing system packages.
4. Run `repro doctor`; check Chromium/headless shell, FFmpeg/ffprobe/filters, fonts and English OCR. Resolve failed checks; strict OCR export cannot be bypassed. `REPRO_FFMPEG`, `REPRO_FFPROBE` and `REPRO_TESSERACT` accept absolute executable paths for portable installs.
5. In a writable evidence folder, run `repro init ID --description "Brief issue"` using the supplied per-scenario identity (omit ID when unavailable; descriptive naming is the fallback) and `repro capabilities --json`. Read `repro treatments --json` and `repro defaults --json` before selecting presentation effects. Initialization creates starter files; bind real locators and assertions before recording.

For MCP, register the installed `repro-mcp` executable as a stdio server using the harness's MCP settings. Its `setup` tool defaults to dry-run. The CLI remains usable in any harness that can run local commands. Use the existing harness's model/subscription; capture, replay and rendering are model-free. Keep authentication secrets out of skill files and prompts.

Completion means dependency checks pass and the installed CLI can initialize and validate an evidence project. Record any untested OS or missing dependency explicitly. Do not treat installing a skill as installing Repro, or claim an unpublished npm version exists.

App config stores `naming.useWorkItemId` and `versionOverlay.enabled`/`discover` policies, all true by default. Keep changing IDs, descriptions, app versions and builds in scenario/run metadata or CLI arguments. See [configuration](https://github.com/jitterbox/Repro/blob/main/docs/configuration.md).
