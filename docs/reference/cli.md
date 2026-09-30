# CLI reference

Generated from Commander. Every command, argument, option and CLI default is listed below. See [workflows](../ai-usage.md) for evidence semantics and [configuration](../configuration.md) for JSON file settings.

## repro

```text
Usage: repro [options] [command]

Repro AI capture, annotation, and evidence CLI

Options:
  -V, --version                     output the version number
  --workflow-log <file>             Append private command timing records (or
                                    use REPRO_WORKFLOW_LOG)
  -h, --help                        display help for command

Commands:
  workflow-report <file>            Summarize command timings, capture
                                    invocations and incomplete workflow records
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
  init [options] [work-item]        Create a scenario; optionally name artifacts
                                    with a bug/work-item ID or name
  record [options] <url>
  run [options] <spec>
  frame [options] <run>
  review [options] <run>
  capture [options]                 Validate config and capture a run
  compare [options] <left> <right>  Compare before/after run directories, or
                                    numeric comparison manifests
  file [options]                    Gate evidence with OCR and upload to ALM
  package [options]                 Package viewer bundle and evidence manifest
  quality [options]                 Build and gate a quality report
  validate-config [options]         Print mode and feature conflicts
  help [command]                    display help for command
```

## repro workflow-report

```text
Usage: repro workflow-report [options] <file>

Summarize command timings, capture invocations and incomplete workflow records

Options:
  -h, --help  display help for command
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
  --app-version <value>  Target application version
  --version-overlay      Show known app version/build throughout the video
                         (default on)
  --no-version-overlay   Omit the app version/build textbox
  --build-id <id>        Target application build label for presentation
  --treatment <file>     Evidence-referenced scene treatments
  --baseline <run>       Compare two previously rendered scene compositions
  --observational        Label faithful paired playback without controlled proof
  --evidence <file>      Presentation-only revision of the committed evidence
                         specification
  -h, --help             display help for command
```

## repro export

```text
Usage: repro export [options] <run>

Options:
  --description <text>      Brief issue description used for descriptive
                            filenames
  --use-work-item-id        Prefer the supplied issue ID for names (default on)
  --no-use-work-item-id     Name artifacts by description with a stable
                            uniqueness suffix
  --work-item <id-or-name>  Override the work item used in exported filenames
  --config <path>           Read naming and export preferences from a Repro
                            config
  --devtools                Include sanitized, synchronized browser diagnostics
                            (default on)
  --no-devtools             Export media without browser diagnostics
  --out-dir <path>
  --draft                   Create an audited acceptance bundle for an
                            unpromoted scene renderer
  --baseline <run>          Include an audited before/after pair
  -h, --help                display help for command
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
Usage: repro init [options] [work-item]

Create a scenario; optionally name artifacts with a bug/work-item ID or name

Options:
  --description <text>  Brief description for this issue, stored with scenario
                        metadata
  --directory <path>
  -h, --help            display help for command
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
  --description <text>        Brief issue description used for descriptive
                              filenames
  --use-work-item-id          Prefer the supplied issue ID for names (default
                              on)
  --no-use-work-item-id       Name artifacts by description with a stable
                              uniqueness suffix
  --app-version <value>       Target application version
  --version-overlay           Show known app version/build throughout the video
                              (default on)
  --no-version-overlay        Omit the app version/build textbox
  --work-item <id-or-name>    Work item used for run and exported artifact names
  --devtools                  Export sanitized browser diagnostics by default
                              for this run
  --no-devtools               Disable diagnostics export for this run; local
                              capture remains enabled
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

## repro compare

```text
Usage: repro compare [options] <left> <right>

Compare before/after run directories, or numeric comparison manifests

Arguments:
  left                  Before run directory, or numeric comparison JSON
                        manifest
  right                 After run directory, or numeric comparison JSON manifest

Options:
  -o, --out <path>      Write compare result JSON
  --override-env-drift  Allow material environment drift
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
