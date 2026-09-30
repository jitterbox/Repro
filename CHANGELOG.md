# Changelog

## 0.3.0

- Use the polished scene compositor exclusively; remove renderer selection, raw-event `annotate`, and `render-compare`. Render comparisons with `render AFTER --baseline BEFORE`.
- Adapt panel placement across the gutter, header, and protected viewport corners; retire older steps only after their minimum reading interval. Show explicit transfer-size units.
- Add private workflow timing logs, documentation, and the Repro package logo.
- Serialize render/comparison/export access, protect fractional comparison boundaries, prevent stale frames in shorter rerenders, and retain opaque privacy layers.
- Reuse identical sanitized sources and copy unmasked PNGs without per-frame encoding processes.
- Update portable installation, skills, schemas, public references, package contents, and regression coverage.

Final-quality scene export and paired export retain their documented acceptance gates.

## 0.2.1

- Publish packages under `@jitterbox/repro-*`; the CLI command remains `repro`.

- Separate reusable artifact naming policy from each scenario's work-item ID and description; preserve matching video and DevTools filenames.
- Show supplied or discovered target application version/build metadata throughout a video by default, with configurable discovery and CLI overrides.
- Export synchronized, sanitized browser diagnostics by default, with an explicit opt-out.
- Resolve Windows browser paths, FFmpeg subtitle paths, SQLite lock limits, and stalled font inventory; validate packed installation, capture, rendering, strict OCR export, and review on GitHub-hosted Windows.
- Update CLI, MCP, schemas, skills, installation, and configuration documentation.

## 0.2.0

- Add an opt-in deterministic Hyperframes scene pipeline with source-frame mappings, synchronized diagnostics, measured treatments and reviewed standalone/paired demos.
- Add real recorded pointer paths and click feedback, coordinated colored callouts, retained step groups, readable holds and standalone website examples.
- Add validated typography, layout, palette, transition, reading-time and H.264 encoding preferences, with `repro defaults` and MCP equivalents.
- Add `repro setup`, Windows/Linux headless-shell resolution, portable executable overrides and English OCR checks.
- Add portable setup/capture/annotation/comparison/delivery skills, installation-first docs, generated complete CLI/MCP/schema references and release packaging checks.
- Prepare public Apache-2.0 npm packages and an explicitly dispatched publishing workflow. Registry publication is separate.

Hyperframes remains opt-in with audited draft export; renderer promotion, deeper collectors and broader fresh-agent evaluation retain their documented gates.
