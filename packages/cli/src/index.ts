import { readFile } from 'node:fs/promises';
import {
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
  reviewRun,
  renderEvidence,
  exportEvidence,
  watchScenario,
  experimentNative,
  migrateRun,
} from '@repro/pipeline';
import { Command } from 'commander';
import { z } from 'zod';

import { annotateCommand } from './commands/annotate.js';
import { captureCommand } from './commands/capture.js';
import { compareCommand } from './commands/compare.js';
import { fileCommand } from './commands/file.js';
import { packageCommand } from './commands/package.js';
import { qualityCommand } from './commands/quality.js';
import { renderCompareCommand } from './commands/render-compare.js';
import { validateConfigCommand } from './commands/validate-config.js';

export * from './commands/annotate.js';
export * from './commands/capture.js';
export * from './commands/compare.js';
export * from './commands/file.js';
export * from './commands/package.js';
export * from './commands/quality.js';
export * from './commands/render-compare.js';
export * from './commands/validate-config.js';

export const REPRO_CLI_VERSION = '0.1.0' as const;

type Writer = (text: string) => void;

const AlmSystemSchema = z.enum(['ado', 'jira']);

export function createReproProgram(writer: Writer = console.log): Command {
  const program = new Command();

  program
    .name('repro')
    .description('Repro AI capture, annotation, and evidence CLI')
    .version(REPRO_CLI_VERSION);

  program
    .command('render <run>')
    .option(
      '--evidence <file>',
      'Presentation-only revision of the committed evidence specification',
    )
    .action(async (run: string, options: { evidence?: string }) => {
      writer(JSON.stringify(await renderEvidence(run, options), null, 2));
    });
  program
    .command('export <run>')
    .requiredOption('--out-dir <path>')
    .option('--baseline <run>', 'Include an audited before/after pair')
    .action(
      async (run: string, options: { outDir: string; baseline?: string }) => {
        writer(
          JSON.stringify(
            await exportEvidence(run, options.outDir, options.baseline),
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
    .command('init')
    .option('--directory <path>')
    .action(async (options: { directory?: string }) => {
      writer(JSON.stringify(await initScenario(options.directory), null, 2));
    });
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
    .option('--verbose', 'Include full manifests and environment provenance')
    .action(
      async (
        spec: string,
        options: Omit<Parameters<typeof runScenario>[0], 'spec'> & {
          watch?: boolean;
          verbose?: boolean;
        },
      ) => {
        if (options.watch) {
          const close = watchScenario({ ...options, spec }, (result) => {
            writer(
              JSON.stringify(
                options.verbose ? result : summarizeRunResult(result),
              ),
            );
          });
          process.once('SIGINT', () => {
            void close();
          });
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
    .command('frame <run>')
    .option('--checkpoint <id>')
    .option('--time-ms <number>', 'Run-relative milliseconds', Number)
    .option('--target <id>')
    .action(
      async (run: string, options: Parameters<typeof inspectFrame>[1]) => {
        writer(JSON.stringify(await inspectFrame(run, options), null, 2));
      },
    );
  program
    .command('review <run>')
    .option('--baseline <run>')
    .option('--port <number>', 'Loopback port', Number)
    .action(
      async (run: string, options: { port?: number; baseline?: string }) => {
        const review = await reviewRun(run, options.port, options.baseline);
        writer(JSON.stringify({ url: review.url }));
      },
    );
  addCapture(program, writer);
  addAnnotate(program, writer);
  addCompare(program, writer);
  addRenderCompare(program, writer);
  addFile(program, writer);
  addPackage(program, writer);
  addQuality(program, writer);
  addValidateConfig(program, writer);

  return program;
}

export async function runCli(
  argv: readonly string[] = process.argv,
): Promise<void> {
  const program = createReproProgram();
  await program.parseAsync(argv);
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

function addAnnotate(program: Command, writer: Writer): void {
  program
    .command('annotate')
    .description('Build an annotation plan and render video')
    .requiredOption('-c, --config <path>', 'Repro config JSON')
    .requiredOption('--events <path>', 'Event JSONL file')
    .option('--frames <path>', 'Frame manifest JSON file')
    .requiredOption('--video <path>', 'Input MP4 path')
    .requiredOption('-o, --out-dir <path>', 'Render output directory')
    .option('--plan-out <path>', 'Plan JSON output path')
    .option('--output-name <name>', 'Rendered MP4 file name')
    .option('--resume <rootDir>', 'Resume from verified stage root')
    .action(async (options: AnnotateOptions) => {
      await printResult(writer, annotateCommand(options));
    });
}

function addCompare(program: Command, writer: Writer): void {
  program
    .command('compare')
    .description('Compare before/after run directories, or legacy manifests')
    .argument('<left>', 'Before run directory, or legacy JSON manifest')
    .argument('<right>', 'After run directory, or legacy JSON manifest')
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

function addRenderCompare(program: Command, writer: Writer): void {
  program
    .command('render-compare')
    .description('Render a compare composition MP4 from two videos')
    .requiredOption('--composition <path>', 'Compare composition JSON')
    .requiredOption('--video-a <path>', 'Before / left MP4 path')
    .requiredOption('--video-b <path>', 'After / right MP4 path')
    .requiredOption('-o, --out-dir <path>', 'Render output directory')
    .option('--ffmpeg <path>', 'ffmpeg binary path')
    .action(async (options: RenderCompareCliOptions) => {
      await printResult(
        writer,
        renderCompareCommand({
          composition: options.composition,
          outDir: options.outDir,
          videoA: options.videoA,
          videoB: options.videoB,
          ...(options.ffmpeg === undefined
            ? {}
            : { ffmpegPath: options.ffmpeg }),
        }),
      );
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
type AnnotateOptions = Parameters<typeof annotateCommand>[0];
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
type RenderCompareOptions = Parameters<typeof renderCompareCommand>[0];
type RenderCompareCliOptions = RenderCompareOptions & {
  readonly ffmpeg?: string;
};
type ValidateOptions = Parameters<typeof validateConfigCommand>[0];
