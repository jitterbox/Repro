# Configure presentation and capture

Keep three decisions separate: `repro.config.json` controls capture, privacy and export preferences, `evidence.json` defines the claim and required observations, and `treatment.json` defines presentation. Presentation-only changes can reuse a run; capture or assertion changes require recapture. Every setting is listed in the [generated schemas](reference/schemas.md), including nested options, types, ranges and defaults.

## Work-item names and browser diagnostics

Start with `repro init DASH2R-949` or `repro init "Mobile metric overflow"`. Initialization stores the ID/name in `repro.config.json`:

```json
{
  "workItem": "DASH2R-949",
  "export": { "devtools": true }
}
```

These are optional fields in a complete capture config. Without a work-item name, Repro uses the evidence scenario ID. Names are converted to safe Windows/Linux filename stems; spaces become hyphens, reserved device names are escaped, and long names receive a short hash. Run directories also use this stem with a unique suffix. Internal run manifests and renderer filenames remain stable for compatibility.

Exports contain matching files under `assets/`:

- `DASH2R-949_before_repro.mp4`
- `DASH2R-949_before_devtools.json`
- `DASH2R-949_before_checkpoint-result.png` (when that checkpoint exists)
- `DASH2R-949_before_captions.vtt` (when captions exist)

The middle component is the scenario's variant ID, including for standalone evidence. Exported diagnostic files are linked from the portable viewer. ALM delivery retains its existing content-identity upload names.

```sh
repro run scenario.spec.ts --evidence evidence.json --config repro.config.json --work-item DASH2R-949
repro export path/to/run --out-dir bundle --no-devtools
repro export path/to/run --out-dir bundle --devtools --work-item "Mobile metric overflow"
```

For scene acceptance bundles, also pass `--draft`. Both `run` and `export` accept `--devtools` / `--no-devtools`. A run stores its resolved preference; an export override needs no recapture. Replacing a bundle with `--no-devtools` removes its previous diagnostic file. Opting out changes export only; local diagnostic capture remains available for review.

Export precedence is explicit CLI flags, then an export-time `--config` file (if supplied), otherwise the captured run configuration. Missing `export.devtools` means **true**; missing `workItem` falls back to the scenario ID. An export-time config replaces the captured configuration for these preferences. MCP `repro.run` and `repro.export` expose `workItem` and `devtools`; `repro.export` also accepts `config`.

The versioned [DevTools report schema](reference/schemas/devtools-report-schema.json) contains captured console/network/lifecycle events, available performance/state/WebMCP observations, checkpoint geometry, coverage/limitations, calibrated source timestamps and timing uncertainty. Scene reports include exact source-frame identities and output segments for holds, slow motion and replay. Legacy runs expose only the timing/observations actually recorded; missing data is explicitly reported.

This is Repro diagnostic JSON, not a Chrome-importable trace or a full browser-memory dump. Raw traces, DOM serialization, request/response bodies, headers, storage and credentials remain local. Export strips URL credentials/query strings/fragments, redacts known sensitive fields and text, and applies configured privacy patterns. Pixel OCR and diagnostic text/schema audits still fail closed. Inspect coverage before claiming that a particular diagnostic stream was captured.

## Create editable presentation defaults

```sh
repro defaults --out treatment.json
repro validate-treatment treatment.json
repro render path/to/run --renderer hyperframes --treatment treatment.json
```

`--out` creates UTF-8 JSON on both operating systems and refuses to overwrite an existing file. `--json` prints the same defaults for an agent. Keep the template in version control and add relevant treatments/steps. There is no machine-global hidden theme: the treatment file is the reproducible source of presentation choices.

Example overrides (omitted settings keep their defaults):

```json
{
  "schemaVersion": "1.0.0",
  "style": {
    "bodyFontSize": 20,
    "headingFontSize": 22,
    "titleFontSize": 30,
    "dataFontSize": 16,
    "cardWidth": 384,
    "cardPadding": 16,
    "cardGap": 20,
    "cardRadius": 10,
    "outerInset": 24,
    "gutterGap": 32,
    "background": "#101721",
    "criticalAccent": "#ffb76b"
  },
  "timing": { "readingHoldMs": 6000, "entryMs": 150, "exitMs": 200 },
  "encoding": { "crf": 18, "preset": "medium" },
  "outputScale": 1,
  "cursorGlow": true,
  "actionAudio": false,
  "steps": [],
  "treatments": []
}
```

## Visual controls

All dimensions are logical output pixels before `outputScale`. Font sizes are independent of the application's viewport, browser zoom and device scale factor.

| Group | Keys | Default / meaning |
| --- | --- | --- |
| Typography | `bodyFontSize`, `headingFontSize`, `titleFontSize`, `dataFontSize`, `lineHeight` | 18 / 20 / 28 / 14px; body line height 1.4 |
| Cards | `cardWidth`, `cardPadding`, `cardRadius`, `cardGap` | 336 / 12 / 8 / 16px; text is measured after fonts load |
| Layout | `outerInset`, `gutterGap`, `sourceTop`, `mobileSourceTop`, `minHeight` | 24 / 24 / 96 / 128 / 960px; mobile is a viewport narrower than 768px |
| Palette | `background`, `cardBackground`, `foreground`, `criticalAccent`, `criticalBackground`, `cursorColor` | Six-digit hex colors; critical plate, highlight and leader share an accent |
| Output | `outputScale` | 1 or 2; viewport remains unchanged, annotations and source pixels scale together |
| Pointer/audio | `cursorGlow`, `actionAudio` | true / false; pointer positions come from actual recorded input |

Cards live in a right annotation gutter. Output width is viewport width + two outer insets + gutter gap + card width, rounded up to an even pixel count. Height accommodates source chrome and `minHeight`, also even. Magnifier crop width follows card padding and width without stretching evidence. Increasing type size can need wider cards or a taller output. Layout and overlap gates still apply; configuration never disables them or silently truncates a required explanation.

Source Sans 3 and Source Code Pro remain bundled, pinned fonts. Arbitrary fonts, freeform CSS, z-order and evidence-pixel distortion are intentionally not customization points. Individual treatments choose text, critical/normal severity, expected values, dotted outlines, 2×/4× magnification, 0.1×/0.2× replay and data-panel formats. `repro treatments --json` explains selection and evidence prerequisites; the [treatment schema](reference/schemas/treatment-schema.json) covers every field.

## Timing and encoding

`timing.entryMs` / `exitMs` default to 150 / 200ms. `readingHoldMs` defaults to 5400ms, with a 4000ms minimum. A longer evidence-spec reading hold takes precedence. Transitions longer than the default add their excess to the hold so they do not reduce existing reading time. `outcomeHoldMs` defaults to 2200ms; `clickWaveMs` to 350ms. Holds are visibly identified and map to a captured source moment.

Capture action pacing is separate: commit waits and `humanPointer` motion in the scenario. Changing a reading hold never invents or changes a recorded mouse path. Keep timing-sensitive intervals faithful; replay captured source frames slowly afterward.

`encoding.crf` is 0–35 (default 18; lower means higher quality/larger files). `encoding.preset` is an x264 preset from ultrafast through veryslow (default veryfast; slower uses more CPU for compression). H.264 High, yuv420p, BT.709, fast-start MP4 and 30fps remain pinned compatibility defaults in 0.2. Encoder settings are recorded in render receipts. Pair output uses the left pane's encoding settings; each pane retains its own rendered typography. The legacy renderer keeps its existing encoding/theme contract; these new settings apply to Hyperframes.

## Capture, diagnostics, privacy and advanced interfaces

See [AI usage](ai-usage.md) for the complete bug-class/feature matrix, `faithful` versus `controlled`, viewport/device scale, redaction masks/patterns, comparison alignment, annotation mode, captions, voiceover, diagnostics and conflict rules. Use `repro validate-config --config repro.config.json` after changing capture settings, and `repro validate-evidence evidence.json` for a claim.

The [Playwright API guide](playwright-api.md) describes targets, checkpoints, human pointer input and application-state readers. The [schema index](reference/schemas.md) covers capture config, evidence, treatment, compiled scenes, quality results, comparison compositions, watch/server options, run manifests and discovery. The [CLI reference](reference/cli.md) covers every command flag; the [MCP reference](reference/mcp.md) covers every tool input and resource.

## Environment settings

| Variable | Purpose |
| --- | --- |
| `REPRO_FFMPEG`, `REPRO_FFPROBE`, `REPRO_TESSERACT` | Explicit native executable paths; otherwise PATH/Windows discovery |
| `PLAYWRIGHT_BROWSERS_PATH` | Playwright browser cache location, shared by setup and execution |
| `TESSDATA_PREFIX` | Custom Tesseract language-data directory; English data is required |
| `REPRO_OCR_WORKERS` | OCR concurrency, integer 1–8, default 2 |
| `REPRO_OCR_COMMAND` | Advanced external OCR adapter command; must supply actual frame-audit evidence, never bypasses strict export |
| `REPRO_ADO_TOKEN`, `REPRO_JIRA_TOKEN` | Delivery-only secrets; keep out of prompts and artifacts |
| `REPRO_EVIDENCE`, `REPRO_CONFIG`, `REPRO_OUT`, `REPRO_URL`, `REPRO_BUILD_ID`, `REPRO_WORK_ITEM`, `REPRO_EXPORT_DEVTOOLS` | Passed to fixtures by `repro run`; prefer CLI flags |
| `REPRO_CODE_IDENTITY`, `REPRO_SCENARIO_SOURCE_IDENTITY` | Internal runner provenance; do not override to manufacture matching evidence |

Test-script-specific `REPRO_*` environment variables are development controls, not public runtime settings. Optional AI evaluation has separate provider requirements; deterministic replay does not use them.
