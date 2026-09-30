import {
  startWorkflowCommand,
  workflowReport,
} from '@jitterbox/repro-pipeline';
import { setup } from '@jitterbox/repro-pipeline';
import { treatmentPlanSchema } from '@jitterbox/repro-contracts';
import { importJiraIssue } from '@jitterbox/repro-pipeline';
import { renderScenePair } from '@jitterbox/repro-pipeline';
import {
  treatmentCatalog,
  parseTreatmentPlan,
} from '@jitterbox/repro-pipeline';
import { readFile, writeFile } from 'node:fs/promises';
import {
  discoverBug,
  discoveryGuide,
  capabilities,
  describeCapability,
  recipes,
  doctor,
  validateEvidence,
  runScenario,
  summarizeRunResult,
  initScenario,
  recordScenario,
  inspectFrame,
  auditEvidence,
  reviewRun,
  renderEvidence,
  exportEvidence,
  watchScenarioWithServer,
  watchServerSchema,
  experimentNative,
  migrateRun,
} from '@jitterbox/repro-pipeline';
import { Command } from 'commander';
import { z } from 'zod';
import {
  withOperationTelemetry,
  type OperationTelemetry,
} from '@jitterbox/repro-core';
import { pipelineProblem } from '@jitterbox/repro-pipeline';

import { captureCommand } from './commands/capture.js';
import { compareCommand } from './commands/compare.js';
import { fileCommand } from './commands/file.js';
import { packageCommand } from './commands/package.js';
import { qualityCommand } from './commands/quality.js';
import { validateConfigCommand } from './commands/validate-config.js';

export * from './commands/capture.js';
export * from './commands/compare.js';
export * from './commands/file.js';
export * from './commands/package.js';
export * from './commands/quality.js';
export * from './commands/validate-config.js';

export const REPRO_CLI_VERSION = '0.3.1' as const;

type Writer = (text: string) => void;

const AlmSystemSchema = z.enum(['ado', 'jira']);

export function createReproProgram(writer: Writer = console.log): Command {
  const program = new Command();

  program
    .name('repro')
    .description('Repro AI capture, annotation, and evidence CLI')
    .version(REPRO_CLI_VERSION)
    .option(
      '--workflow-log <file>',
      'Append private command timing records (or use REPRO_WORKFLOW_LOG)',
    );

  program
    .command('workflow-report <file>')
    .description(
      'Summarize command timings, capture invocations and incomplete workflow records',
    )
    .action(async (file: string) => {
      writer(JSON.stringify(await workflowReport(file), null, 2));
    });

  program
    .command('setup')
    .description(
      'Install pinned Chromium; optionally provision Windows/Ubuntu system dependencies',
    )
    .option(
      '--system',
      'Install FFmpeg, OCR and system browser dependencies (may require elevation)',
    )
    .option('--no-browser', 'Skip browser download')
    .option('--dry-run', 'Print commands without installing anything')
    .action(
      async (options: {
        system?: boolean;
        browser?: boolean;
        dryRun?: boolean;
      }) => {
        const result = await setup(options);
        writer(JSON.stringify(result, null, 2));
        if ('ok' in result && !result.ok) process.exitCode = 1;
      },
    );
  program
    .command('defaults')
    .description(
      'Print a complete editable treatment plan with visual, timing and encoding defaults',
    )
    .option('--json', 'Machine-readable JSON (also the default)')
    .option(
      '--out <file>',
      'Create a UTF-8 treatment file; fails if it already exists',
    )
    .action(async (options: { out?: string }) => {
      const text = JSON.stringify(
        treatmentPlanSchema.parse({ schemaVersion: '1.0.0' }),
        null,
        2,
      );
      if (options.out) {
        await writeFile(options.out, text + '\n', {
          encoding: 'utf8',
          flag: 'wx',
        });
        writer(JSON.stringify({ written: options.out }));
      } else writer(text);
    });
  program
    .command('import')
    .description('Import source-linked ticket context')
    .command('jira <file>')
    .requiredOption('--out-dir <directory>')
    .option('--attachments-dir <directory>')
    .action(
      async (
        file: string,
        options: { outDir: string; attachmentsDir?: string },
      ) => {
        writer(JSON.stringify(await importJiraIssue(file, options), null, 2));
      },
    );
  program
    .command('treatments')
    .option('--json')
    .action(() => {
      writer(JSON.stringify(treatmentCatalog, null, 2));
    });
  program.command('validate-treatment <file>').action(async (file: string) => {
    parseTreatmentPlan(JSON.parse(await readFile(file, 'utf8')));
    writer(JSON.stringify({ ok: true }));
  });
  program
    .command('discovery-guide')
    .option('--json')
    .action(() => {
      writer(JSON.stringify(discoveryGuide(), null, 2));
    });
  program
    .command('discover <file>')
    .option('--assessment <file>', 'Source-referenced agent interpretation')
    .option('--json')
    .action(async (file: string, options: { assessment?: string }) => {
      const bug: unknown = JSON.parse(await readFile(file, 'utf8'));
      const assessment: unknown = options.assessment
        ? JSON.parse(await readFile(options.assessment, 'utf8'))
        : undefined;
      writer(JSON.stringify(discoverBug(bug, assessment), null, 2));
    });
  program
    .command('render <run>')
    .option('--app-version <value>', 'Target application version')
    .option(
      '--version-overlay',
      'Show known app version/build throughout the video (default on)',
    )
    .option('--no-version-overlay', 'Omit the app version/build textbox')
    .option(
      '--build-id <id>',
      'Target application build label for presentation',
    )
    .option('--treatment <file>', 'Evidence-referenced scene treatments')
    .option(
      '--baseline <run>',
      'Compare two previously rendered scene compositions',
    )
    .option(
      '--observational',
      'Label faithful paired playback without controlled proof',
    )
    .option(
      '--evidence <file>',
      'Presentation-only revision of the committed evidence specification',
    )
    .action(
      async (
        run: string,
        options: {
          evidence?: string;
          treatment?: string;
          baseline?: string;
          observational?: boolean;
          appVersion?: string;
          buildId?: string;
          versionOverlay?: boolean;
        },
      ) => {
        if (options.baseline) {
          if (
            options.treatment ||
            options.evidence ||
            options.appVersion ||
            options.buildId ||
            options.versionOverlay !== undefined
          )
            throw new Error(
              'Render each scene first, then compare with --baseline',
            );
          writer(
            JSON.stringify(
              await renderScenePair(
                options.baseline,
                run,
                options.observational,
              ),
              null,
              2,
            ),
          );
          return;
        }
        if (options.observational)
          throw new Error('--observational requires --baseline');
        writer(
          JSON.stringify(
            await renderEvidence(run, {
              ...options,
            }),
            null,
            2,
          ),
        );
      },
    );
  program
    .command('export <run>')
    .option(
      '--description <text>',
      'Brief issue description used for descriptive filenames',
    )
    .option(
      '--use-work-item-id',
      'Prefer the supplied issue ID for names (default on)',
    )
    .option(
      '--no-use-work-item-id',
      'Name artifacts by description with a stable uniqueness suffix',
    )
    .option(
      '--work-item <id-or-name>',
      'Override the work item used in exported filenames',
    )
    .option(
      '--config <path>',
      'Read naming and export preferences from a Repro config',
    )
    .option(
      '--devtools',
      'Include sanitized, synchronized browser diagnostics (default on)',
    )
    .option('--no-devtools', 'Export media without browser diagnostics')
    .requiredOption('--out-dir <path>')
    .option(
      '--draft',
      'Create an audited acceptance bundle for an unpromoted scene renderer',
    )
    .option('--baseline <run>', 'Include an audited before/after pair')
    .action(
      async (
        run: string,
        options: {
          outDir: string;
          baseline?: string;
          draft?: boolean;
          workItem?: string;
          description?: string;
          useWorkItemId?: boolean;
          devtools?: boolean;
          config?: string;
        },
      ) => {
        writer(
          JSON.stringify(
            await exportEvidence(
              run,
              options.outDir,
              options.baseline,
              options.draft,
              {
                ...(options.workItem === undefined
                  ? {}
                  : { workItem: options.workItem }),
                ...(options.description === undefined
                  ? {}
                  : { description: options.description }),
                ...(options.useWorkItemId === undefined
                  ? {}
                  : { useWorkItemId: options.useWorkItemId }),
                ...(options.devtools === undefined
                  ? {}
                  : { devtools: options.devtools }),
                ...(options.config === undefined
                  ? {}
                  : { config: options.config }),
              },
            ),
            null,
            2,
          ),
        );
      },
    );
  program
    .command('experiment-native')
    .requiredOption('--out-dir <path>')
    .action(async (options: { outDir: string }) => {
      writer(JSON.stringify(await experimentNative(options.outDir), null, 2));
    });
  program
    .command('doctor')
    .option('--json')
    .action(async () => {
      writer(JSON.stringify(await doctor(), null, 2));
    });
  program
    .command('capabilities')
    .option('--json')
    .action(() => {
      writer(JSON.stringify(capabilities, null, 2));
    });
  program
    .command('describe <capability>')
    .option('--json')
    .action((id: string) => {
      writer(JSON.stringify(describeCapability(id), null, 2));
    });
  program
    .command('recipes')
    .option('--json')
    .action(() => {
      writer(JSON.stringify(recipes, null, 2));
    });
  program
    .command('migrate-run <run>')
    .requiredOption('--out-dir <path>')
    .action(async (run: string, options: { outDir: string }) => {
      writer(JSON.stringify(await migrateRun(run, options.outDir), null, 2));
    });
  program.command('validate-evidence <file>').action(async (file: string) => {
    validateEvidence(JSON.parse(await readFile(file, 'utf8')));
    writer(JSON.stringify({ ok: true }));
  });
  program
    .command('init [work-item]')
    .option(
      '--description <text>',
      'Brief description for this issue, stored with scenario metadata',
    )
    .description(
      'Create a scenario; optionally name artifacts with a bug/work-item ID or name',
    )
    .option('--directory <path>')
    .action(
      async (
        workItem: string | undefined,
        options: { directory?: string; description?: string },
      ) => {
        writer(
          JSON.stringify(
            await initScenario(
              options.directory,
              workItem,
              options.description,
            ),
            null,
            2,
          ),
        );
      },
    );
  program
    .command('record <url>')
    .option('--output <path>')
    .action(async (url: string, options: { output?: string }) => {
      writer(
        JSON.stringify(await recordScenario(url, options.output), null, 2),
      );
    });
  program
    .command('run <spec>')
    .option(
      '--description <text>',
      'Brief issue description used for descriptive filenames',
    )
    .option(
      '--use-work-item-id',
      'Prefer the supplied issue ID for names (default on)',
    )
    .option(
      '--no-use-work-item-id',
      'Name artifacts by description with a stable uniqueness suffix',
    )
    .option('--app-version <value>', 'Target application version')
    .option(
      '--version-overlay',
      'Show known app version/build throughout the video (default on)',
    )
    .option('--no-version-overlay', 'Omit the app version/build textbox')
    .option(
      '--work-item <id-or-name>',
      'Work item used for run and exported artifact names',
    )
    .option(
      '--devtools',
      'Export sanitized browser diagnostics by default for this run',
    )
    .option(
      '--no-devtools',
      'Disable diagnostics export for this run; local capture remains enabled',
    )
    .requiredOption('--evidence <path>')
    .option('--url <url>')
    .option('--config <path>')
    .option('--playwright-config <path>')
    .option('--project <name>')
    .option('--out-dir <path>')
    .option('--build-id <id>')
    .option('--baseline <run>')
    .option('--repeat <count>', 'Capture all attempts', Number)
    .option('--watch', 'Coalesce edits and rerun selected scenario')
    .option(
      '--watch-server <path>',
      'JSON command/args/url for a persistent build server',
    )
    .option('--verbose', 'Include full manifests and environment provenance')
    .action(
      async (
        spec: string,
        options: Omit<Parameters<typeof runScenario>[0], 'spec'> & {
          watch?: boolean;
          watchServer?: string;
          verbose?: boolean;
        },
      ) => {
        if (options.watchServer && !options.watch)
          throw new Error('--watch-server requires --watch');
        if (options.watch) {
          const server = options.watchServer
            ? watchServerSchema.parse(
                JSON.parse(
                  await (
                    await import('node:fs/promises')
                  ).readFile(options.watchServer, 'utf8'),
                ),
              )
            : undefined;
          const lifecycle = new AbortController();
          let close: (() => Promise<void>) | undefined;
          const stop = () => {
            lifecycle.abort();
            void close?.();
          };
          process.once('SIGINT', stop);
          process.once('SIGTERM', stop);
          try {
            const stopWatch = await watchScenarioWithServer(
              { ...options, spec, signal: lifecycle.signal },
              (result) => {
                writer(
                  JSON.stringify(
                    options.verbose ? result : summarizeRunResult(result),
                  ),
                );
              },
              server,
            );
            close = async () => {
              process.removeListener('SIGINT', stop);
              process.removeListener('SIGTERM', stop);
              await stopWatch();
            };
            if (lifecycle.signal.aborted) await close();
          } catch (error) {
            process.removeListener('SIGINT', stop);
            process.removeListener('SIGTERM', stop);
            throw error;
          }
          return;
        }
        const result = await runScenario({ ...options, spec });
        writer(
          JSON.stringify(
            options.verbose ? result : summarizeRunResult(result),
            null,
            2,
          ),
        );
        process.exitCode = result.ok ? 0 : 1;
      },
    );
  program
    .command('audit <run>')
    .description(
      'Audit rendered pixels and preserve private frame-linked privacy diagnostics',
    )
    .option('--json', 'Print a structured audit summary (also the default)')
    .action(async (run: string) =>
      { writer(JSON.stringify(await auditEvidence(run), null, 2)); },
    );
  program
    .command('frame <run>')
    .option('--checkpoint <id>')
    .option(
      '--time-ms <number>',
      'Run-relative milliseconds; output milliseconds with --presentation',
      Number,
    )
    .option(
      '--presentation',
      'Inspect an encoded presentation frame and its source mapping',
    )
    .option('--target <id>')
    .action(
      async (run: string, options: Parameters<typeof inspectFrame>[1]) => {
        writer(JSON.stringify(await inspectFrame(run, options), null, 2));
      },
    );
  program
    .command('review <run>')
    .option('--presentation', 'Review the rendered scene with source timing')
    .option('--baseline <run>')
    .option('--port <number>', 'Loopback port', Number)
    .action(
      async (
        run: string,
        options: { port?: number; baseline?: string; presentation?: boolean },
      ) => {
        const review = await reviewRun(
          run,
          options.port,
          options.baseline,
          options.presentation,
        );
        writer(JSON.stringify({ url: review.url }));
      },
    );
  addCapture(program, writer);
  addCompare(program, writer);
  addFile(program, writer);
  addPackage(program, writer);
  addQuality(program, writer);
  addValidateConfig(program, writer);

  return program;
}

export async function runCli(
  argv: readonly string[] = process.argv,
): Promise<void> {
  const telemetry: OperationTelemetry = { phases: {}, metrics: {} };
  return withOperationTelemetry(telemetry, async () => {
    const program = createReproProgram();
    let finish: Awaited<ReturnType<typeof startWorkflowCommand>> | undefined;
    program.hook('preAction', async (_root, command) => {
      const file =
        program.opts<{ workflowLog?: string }>().workflowLog ??
        process.env.REPRO_WORKFLOW_LOG;
      if (file && command.name() !== 'workflow-report') {
        const names = [command.name()];
        let parent = command.parent;
        while (parent && parent !== program) {
          names.unshift(parent.name());
          parent = parent.parent;
        }
        finish = await startWorkflowCommand(
          file,
          names.join(' '),
          REPRO_CLI_VERSION,
        );
      }
    });
    try {
      await program.parseAsync(argv);
      await finish?.(process.exitCode ? 'failed' : 'passed', telemetry);
    } catch (error) {
      const problem = pipelineProblem(error).error;
      await finish?.('failed', {
        ...telemetry,
        errorCode:
          'code' in problem && typeof problem.code === 'string'
            ? problem.code
            : problem.category,
        ...('reportPath' in problem && typeof problem.reportPath === 'string'
          ? { reportPath: problem.reportPath }
          : {}),
      });
      throw error;
    }
  });
}

function addCapture(program: Command, writer: Writer): void {
  program
    .command('capture')
    .description('Validate config and capture a run')
    .requiredOption('-c, --config <path>', 'Repro config JSON')
    .option('--url <url>', 'URL to open before capture')
    .option('-o, --out-dir <path>', 'Capture output directory')
    .option('--run-id <id>', 'Stable run id')
    .option('--store-path <path>', 'SQLite store path')
    .option('--resume <rootDir>', 'Resume from verified stage root')
    .action(async (options: CaptureOptions) => {
      await printResult(writer, captureCommand(options));
    });
}

function addCompare(program: Command, writer: Writer): void {
  program
    .command('compare')
    .description(
      'Compare before/after run directories, or numeric comparison manifests',
    )
    .argument(
      '<left>',
      'Before run directory, or numeric comparison JSON manifest',
    )
    .argument(
      '<right>',
      'After run directory, or numeric comparison JSON manifest',
    )
    .option('-o, --out <path>', 'Write compare result JSON')
    .option('--override-env-drift', 'Allow material environment drift')
    .action(async (left: string, right: string, options: CompareOptions) => {
      const result = await compareCommand({
        left,
        ...(options.out === undefined ? {} : { out: options.out }),
        overrideEnvDrift: options.overrideEnvDrift === true,
        right,
      });

      writer(JSON.stringify(result, null, 2));
      process.exitCode = result.ok ? 0 : 1;
    });
}

function addFile(program: Command, writer: Writer): void {
  program
    .command('file')
    .description('Gate evidence with OCR and upload to ALM')
    .requiredOption('--system <ado|jira>', 'ALM system')
    .requiredOption('--evidence <path>', 'Evidence artifact path')
    .requiredOption('--title <title>', 'ALM title')
    .option('-c, --config <path>', 'Config for strict redaction gate')
    .option('--description <text>', 'ALM description')
    .option('--endpoint <url>', 'ALM upload endpoint')
    .option('--issue <id>', 'Existing Jira issue key or ADO work item id')
    .option('--project <name>', 'ADO project')
    .action(async (options: FileOptions) => {
      const system = AlmSystemSchema.parse(options.system);
      await printResult(writer, fileCommand({ ...options, system }));
    });
}

function addPackage(program: Command, writer: Writer): void {
  program
    .command('package')
    .description('Package viewer bundle and evidence manifest')
    .requiredOption('-o, --out-dir <path>', 'Package output directory')
    .option('--viewer-dir <path>', 'Built viewer dist directory')
    .option('--asset <kind:path...>', 'External asset entries')
    .action(async (options: PackageOptions) => {
      await printResult(
        writer,
        packageCommand({
          assets: assetInputs(options.asset ?? []),
          outDir: options.outDir,
          ...(options.viewerDir === undefined
            ? {}
            : { viewerDir: options.viewerDir }),
        }),
      );
    });
}

function addQuality(program: Command, writer: Writer): void {
  program
    .command('quality')
    .description('Build and gate a quality report')
    .requiredOption('--input <path>', 'Golden expected or run metrics JSON')
    .option('-o, --out <path>', 'QualityReport JSON output path')
    .action(async (options: QualityOptions) => {
      const report = await qualityCommand(options);
      writer(JSON.stringify(report, null, 2));
      process.exitCode = report.pass ? 0 : 1;
    });
}

function addValidateConfig(program: Command, writer: Writer): void {
  program
    .command('validate-config')
    .description('Print mode and feature conflicts')
    .requiredOption('-c, --config <path>', 'Repro config JSON')
    .action(async (options: ValidateOptions) => {
      const result = await validateConfigCommand(options);
      writer(result.output);
      process.exitCode = result.validation.ok ? 0 : 1;
    });
}

async function printResult(
  writer: Writer,
  promise: Promise<unknown>,
): Promise<void> {
  writer(JSON.stringify(await promise, null, 2));
}

function assetInputs(
  values: readonly string[],
): readonly { readonly kind: AssetKind; readonly path: string }[] {
  return values.map((value) => {
    const separator = value.indexOf(':');
    const kind = AssetKindSchema.parse(value.slice(0, separator));
    return { kind, path: value.slice(separator + 1) };
  });
}

const AssetKindSchema = z.enum(['chapters', 'json', 'mp4', 'vtt', 'png']);
type AssetKind = z.infer<typeof AssetKindSchema>;
type CaptureOptions = Parameters<typeof captureCommand>[0];
type CompareOptions = Omit<
  Parameters<typeof compareCommand>[0],
  'left' | 'right'
>;
type FileOptions = Omit<Parameters<typeof fileCommand>[0], 'system'> & {
  readonly system: string;
};
interface PackageOptions {
  readonly asset?: readonly string[];
  readonly outDir: string;
  readonly viewerDir?: string;
}
type QualityOptions = Parameters<typeof qualityCommand>[0];
type ValidateOptions = Parameters<typeof validateConfigCommand>[0];
