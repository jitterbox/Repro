import { spawn } from 'node:child_process';

export interface EncodeOptions {
  readonly ffmpegPath?: string;
  readonly frameRate?: number;
  readonly inputPattern: string;
  readonly outputPath: string;
  readonly overwrite?: boolean;
}

export interface EncodeResult {
  readonly args: readonly string[];
  readonly command: string;
  readonly outputPath: string;
}

const BT709_ARGS = [
  '-c:v',
  'libx264',
  '-crf',
  '18',
  '-preset',
  'medium',
  '-pix_fmt',
  'yuv420p',
  '-profile:v',
  'high',
  '-color_primaries',
  'bt709',
  '-color_trc',
  'bt709',
  '-colorspace',
  'bt709',
  '-color_range',
  'tv',
  '-movflags',
  '+faststart',
] as const;

export async function encodeH264(
  options: EncodeOptions,
): Promise<EncodeResult> {
  const command = options.ffmpegPath ?? 'ffmpeg';
  const args = await encodeArgs(command, options);

  await run(command, args);
  return { args, command, outputPath: options.outputPath };
}

export async function buildEncodeArgs(
  options: EncodeOptions,
): Promise<readonly string[]> {
  return encodeArgs(options.ffmpegPath ?? 'ffmpeg', options);
}

async function encodeArgs(
  command: string,
  options: EncodeOptions,
): Promise<readonly string[]> {
  const useZscale = await ffmpegHasZscale(command);
  return [
    options.overwrite === false ? '-n' : '-y',
    '-framerate',
    String(options.frameRate ?? 30),
    '-i',
    options.inputPattern,
    '-vf',
    videoFilter(useZscale),
    ...BT709_ARGS,
    options.outputPath,
  ];
}

async function ffmpegHasZscale(command: string): Promise<boolean> {
  const result = await run(command, ['-hide_banner', '-filters'], false);
  return result.includes(' zscale ');
}

/**
 * Screencast JPEGs are full-range yuvj420p (often tagged bt470bg). Bare
 * zscale without matrixin fails with "no path between colorspaces".
 */
export function videoFilter(useZscale: boolean): string {
  if (!useZscale) {
    return 'scale=in_range=full:out_range=tv,format=yuv420p';
  }

  return (
    'zscale=matrixin=170m:transferin=709:primariesin=709:rangein=full:' +
    'matrix=709:transfer=709:primaries=709:range=limited,format=yuv420p'
  );
}

function run(
  command: string,
  args: readonly string[],
  rejectOnFailure = true,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];

    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.on('error', (error) => {
      if (rejectOnFailure) {
        reject(error);
        return;
      }

      resolve('');
    });
    child.on('close', (code) => {
      settleProcess({ chunks, code, reject, rejectOnFailure, resolve });
    });
  });
}

interface ProcessSettlement {
  readonly chunks: readonly Buffer[];
  readonly code: number | null;
  readonly reject: (reason?: unknown) => void;
  readonly rejectOnFailure: boolean;
  readonly resolve: (value: string) => void;
}

function settleProcess(settlement: ProcessSettlement): void {
  const output = Buffer.concat(settlement.chunks).toString('utf8');

  if (settlement.code === 0 || !settlement.rejectOnFailure) {
    settlement.resolve(output);
    return;
  }

  settlement.reject(
    new Error(`ffmpeg exited with code ${String(settlement.code)}\n${output}`),
  );
}
