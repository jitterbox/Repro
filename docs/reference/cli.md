# CLI reference

Generated from Commander. Every command, argument, option and CLI default is listed below. See [workflows](../ai-usage.md) for evidence semantics and [configuration](../configuration.md) for JSON file settings.

## repro

```text
Usage: repro [options] [command]

Repro AI capture, annotation, and evidence CLI

Options:
  -V, --version                     output the version number
  -h, --help                        display help for command

Commands:
  setup [options]                   Install pinned Chromium; optionally
                                    provision Windows/Ubuntu system dependencies
  defaults [options]                Print a complete editable treatment plan
                                    with visual, timing and encoding defaults
  import                            Import source-linked ticket context
  treatments [options]
  validate-treatment <file>
  discovery-guide [options]
  discover [options] <file>
  render [options] <run>
  export [options] <run>
  experiment-native [options]
  doctor [options]
  capabilities [options]
  describe [options] <capability>
  recipes [options]
  migrate-run [options] <run>
  validate-evidence <file>
  init [options]
  record [options] <url>
  run [options] <spec>
  frame [options] <run>
  review [options] <run>
  capture [options]                 Validate config and capture a run
  annotate [options]                Build an annotation plan and render video
  compare [options] <left> <right>  Compare before/after run directories, or
                                    legacy manifests
  render-compare [options]          Render a compare composition MP4 from two
                                    videos
  file [options]                    Gate evidence with OCR and upload to ALM
  package [options]                 Package viewer bundle and evidence manifest
  quality [options]                 Build and gate a quality report
  validate-config [options]         Print mode and feature conflicts
  help [command]                    display help for command
```

## repro setup

```text
Usage: repro setup [options]

Install pinned Chromium; optionally provision Windows/Ubuntu system dependencies

Options:
  --system      Install FFmpeg, OCR and system browser dependencies (may require
                elevation)
  --no-browser  Skip browser download
  --dry-run     Print commands without installing anything
  -h, --help    display help for command
```

## repro defaults

```text
Usage: repro defaults [options]

Print a complete editable treatment plan with visual, timing and encoding
defaults

Options:
  --json        Machine-readable JSON (also the default)
  --out <file>  Create a UTF-8 treatment file; fails if it already exists
  -h, --help    display help for command
```

## repro import

```text
Usage: repro import [options] [command]

Import source-linked ticket context

Options:
  -h, --help             display help for command

Commands:
  jira [options] <file>
  help [command]         display help for command
```

## repro import jira

```text
Usage: repro import jira [options] <file>

Options:
  --out-dir <directory>
  --attachments-dir <directory>
  -h, --help                     display help for command
```

## repro treatments

```text
Usage: repro treatments [options]

Options:
  --json
  -h, --help  display help for command
```

## repro validate-treatment

```text
Usage: repro validate-treatment [options] <file>

Options:
  -h, --help  display help for command
```

## repro discovery-guide

```text
Usage: repro discovery-guide [options]

Options:
  --json
  -h, --help  display help for command
```

## repro discover

```text
Usage: repro discover [options] <file>

Options:
  --assessment <file>  Source-referenced agent interpretation
  --json
  -h, --help           display help for command
```

## repro render

```text
Usage: repro render [options] <run>

Options:
  --renderer <backend>  legacy or hyperframes (default: "legacy")
  --treatment <file>    Evidence-referenced scene treatments
  --baseline <run>      Compare two previously rendered scene compositions
  --observational       Label faithful paired playback without controlled proof
  --evidence <file>     Presentation-only revision of the committed evidence
                        specification
  -h, --help            display help for command
```

## repro export

```text
Usage: repro export [options] <run>

Options:
  --out-dir <path>
  --draft           Create an audited acceptance bundle for an unpromoted scene
                    renderer
  --baseline <run>  Include an audited before/after pair
  -h, --help        display help for command
```

## repro experiment-native

```text
Usage: repro experiment-native [options]

Options:
  --out-dir <path>
  -h, --help        display help for command
```

## repro doctor

```text
Usage: repro doctor [options]

Options:
  --json
  -h, --help  display help for command
```

## repro capabilities

```text
Usage: repro capabilities [options]

Options:
  --json
  -h, --help  display help for command
```

## repro describe

```text
Usage: repro describe [options] <capability>

Options:
  --json
  -h, --help  display help for command
```

## repro recipes

```text
Usage: repro recipes [options]

Options:
  --json
  -h, --help  display help for command
```

## repro migrate-run

```text
Usage: repro migrate-run [options] <run>

Options:
  --out-dir <path>
  -h, --help        display help for command
```

## repro validate-evidence

```text
Usage: repro validate-evidence [options] <file>

Options:
  -h, --help  display help for command
```

## repro init

```text
Usage: repro init [options]

Options:
  --directory <path>
  -h, --help          display help for command
```

## repro record

```text
Usage: repro record [options] <url>

Options:
  --output <path>
  -h, --help       display help for command
```

## repro run

```text
Usage: repro run [options] <spec>

Options:
  --evidence <path>
  --url <url>
  --config <path>
  --playwright-config <path>
  --project <name>
  --out-dir <path>
  --build-id <id>
  --baseline <run>
  --repeat <count>            Capture all attempts
  --watch                     Coalesce edits and rerun selected scenario
  --watch-server <path>       JSON command/args/url for a persistent build
                              server
  --verbose                   Include full manifests and environment provenance
  -h, --help                  display help for command
```

## repro frame

```text
Usage: repro frame [options] <run>

Options:
  --checkpoint <id>
  --time-ms <number>  Run-relative milliseconds
  --target <id>
  -h, --help          display help for command
```

## repro review

```text
Usage: repro review [options] <run>

Options:
  --presentation    Review the rendered scene with source timing
  --baseline <run>
  --port <number>   Loopback port
  -h, --help        display help for command
```

## repro capture

```text
Usage: repro capture [options]

Validate config and capture a run

Options:
  -c, --config <path>   Repro config JSON
  --url <url>           URL to open before capture
  -o, --out-dir <path>  Capture output directory
  --run-id <id>         Stable run id
  --store-path <path>   SQLite store path
  --resume <rootDir>    Resume from verified stage root
  -h, --help            display help for command
```

## repro annotate

```text
Usage: repro annotate [options]

Build an annotation plan and render video

Options:
  -c, --config <path>   Repro config JSON
  --events <path>       Event JSONL file
  --frames <path>       Frame manifest JSON file
  --video <path>        Input MP4 path
  -o, --out-dir <path>  Render output directory
  --plan-out <path>     Plan JSON output path
  --output-name <name>  Rendered MP4 file name
  --resume <rootDir>    Resume from verified stage root
  -h, --help            display help for command
```

## repro compare

```text
Usage: repro compare [options] <left> <right>

Compare before/after run directories, or legacy manifests

Arguments:
  left                  Before run directory, or legacy JSON manifest
  right                 After run directory, or legacy JSON manifest

Options:
  -o, --out <path>      Write compare result JSON
  --override-env-drift  Allow material environment drift
  -h, --help            display help for command
```

## repro render-compare

```text
Usage: repro render-compare [options]

Render a compare composition MP4 from two videos

Options:
  --composition <path>  Compare composition JSON
  --video-a <path>      Before / left MP4 path
  --video-b <path>      After / right MP4 path
  -o, --out-dir <path>  Render output directory
  --ffmpeg <path>       ffmpeg binary path
  -h, --help            display help for command
```

## repro file

```text
Usage: repro file [options]

Gate evidence with OCR and upload to ALM

Options:
  --system <ado|jira>   ALM system
  --evidence <path>     Evidence artifact path
  --title <title>       ALM title
  -c, --config <path>   Config for strict redaction gate
  --description <text>  ALM description
  --endpoint <url>      ALM upload endpoint
  --issue <id>          Existing Jira issue key or ADO work item id
  --project <name>      ADO project
  -h, --help            display help for command
```

## repro package

```text
Usage: repro package [options]

Package viewer bundle and evidence manifest

Options:
  -o, --out-dir <path>    Package output directory
  --viewer-dir <path>     Built viewer dist directory
  --asset <kind:path...>  External asset entries
  -h, --help              display help for command
```

## repro quality

```text
Usage: repro quality [options]

Build and gate a quality report

Options:
  --input <path>    Golden expected or run metrics JSON
  -o, --out <path>  QualityReport JSON output path
  -h, --help        display help for command
```

## repro validate-config

```text
Usage: repro validate-config [options]

Print mode and feature conflicts

Options:
  -c, --config <path>  Repro config JSON
  -h, --help           display help for command
```
