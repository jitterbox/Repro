import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

export class ProcessError extends Error {
  readonly category = 'process-failed';
  constructor(
    readonly command: string,
    readonly code: number | null,
    readonly output: string,
  ) {
    super(
      `${command} exited ${code}: ${output.trim() ? output.slice(-4000) : 'No diagnostic output was captured. Run repro doctor and check local browser/server execution permissions.'}`,
    );
  }
}
export class ProcessCancelledError extends Error {
  readonly category = 'cancelled';
  readonly code = 'ABORT_ERR';
  constructor(command: string) {
    super(`${command} was cancelled`);
    this.name = 'AbortError';
  }
}
/** Shell-free, bounded diagnostics and cancellation shared by capture and pipeline. */
export function runProcess(
  command: string,
  args: readonly string[],
  options: {
    signal?: AbortSignal;
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    stdin?: 'ignore' | 'inherit';
  } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const { signal, stdin = 'ignore', ...spawnOptions } = options;
    if (signal?.aborted) {
      reject(new ProcessCancelledError(command));
      return;
    }
    // Isolate cancellable runs so browsers and web servers inherit a group we own.
    const processGroup = signal !== undefined && process.platform !== 'win32';
    const child = spawn(resolveMediaCommand(command), args, {
      ...spawnOptions,
      detached: processGroup,
      stdio: [stdin, 'pipe', 'pipe'],
    });
    let output = '';
    let cancelled = false;
    let closed = false;
    let terminationComplete = false;
    let terminationError: Error | undefined;
    const finishCancellation = () => {
      if (closed && terminationComplete) {
        signal?.removeEventListener('abort', cancel);
        reject(terminationError ?? new ProcessCancelledError(command));
      }
    };
    const killGroup = (kind: NodeJS.Signals) => {
      if (child.pid === undefined) return;
      try {
        process.kill(-child.pid, kind);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH')
          terminationError = error as Error;
      }
    };
    const cancel = () => {
      if (cancelled) return;
      cancelled = true;
      if (processGroup) {
        killGroup('SIGTERM');
        // Even when the parent exits first, descendants may ignore SIGTERM.
        setTimeout(() => {
          killGroup('SIGKILL');
          terminationComplete = true;
          finishCancellation();
        }, 500);
      } else if (child.pid !== undefined) {
        const killer = spawn(
          'taskkill',
          ['/pid', String(child.pid), '/T', '/F'],
          {
            stdio: 'ignore',
          },
        );
        killer.on('error', (error) => {
          terminationError = error;
          child.kill();
          terminationComplete = true;
          finishCancellation();
        });
        killer.on('close', () => {
          terminationComplete = true;
          finishCancellation();
        });
      } else {
        terminationComplete = true;
        finishCancellation();
      }
    };
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
    const append = (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-1_000_000);
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    child.on('error', (error) => {
      if (!cancelled) {
        signal?.removeEventListener('abort', cancel);
        reject(error);
      }
    });
    child.on('close', (code) => {
      closed = true;
      if (cancelled) {
        finishCancellation();
        return;
      }
      signal?.removeEventListener('abort', cancel);
      if (code === 0) resolve(output);
      else reject(new ProcessError(command, code, output));
    });
  });
}
export async function probeMedia(path: string) {
  return JSON.parse(
    await runProcess('ffprobe', [
      '-v',
      'error',
      '-show_format',
      '-show_streams',
      '-of',
      'json',
      path,
    ]),
  ) as {
    streams: { width?: number; height?: number; codec_name?: string }[];
    format: { duration?: string };
  };
}
export const h264Profile = [
  '-c:v',
  'libx264',
  '-preset',
  'veryfast',
  '-crf',
  '18',
  '-pix_fmt',
  'yuv420p',
  '-profile:v',
  'high',
  '-color_range',
  'tv',
  '-color_primaries',
  'bt709',
  '-color_trc',
  'bt709',
  '-colorspace',
  'bt709',
  '-movflags',
  '+faststart',
] as const;

/** Explicit overrides also support portable installations without changing PATH. */
export function resolveMediaCommand(command: string): string {
  const variable = (
    {
      ffmpeg: 'REPRO_FFMPEG',
      ffprobe: 'REPRO_FFPROBE',
      tesseract: 'REPRO_TESSERACT',
    } as Record<string, string>
  )[command];
  if (!variable) return command;
  const override = process.env[variable];
  if (override) return override;
  if (process.platform !== 'win32') return command;
  const candidates = [
    ...(process.env.LOCALAPPDATA
      ? [
          join(
            process.env.LOCALAPPDATA,
            'Microsoft',
            'WinGet',
            'Links',
            `${command}.exe`,
          ),
        ]
      : []),
    ...(command === 'tesseract' && process.env.ProgramFiles
      ? [join(process.env.ProgramFiles, 'Tesseract-OCR', 'tesseract.exe')]
      : []),
  ];
  return candidates.find(existsSync) ?? command;
}
