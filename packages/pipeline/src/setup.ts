import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { runProcess } from '@repro/core';
import { doctor } from './discovery.js';

const require = createRequire(import.meta.url);
export interface SetupCommand {
  command: string;
  args: string[];
  purpose: string;
}
/** Plan is inspectable and shell-free; no installer runs during npm install. */
export function setupCommands(
  platform: NodeJS.Platform,
  options: { system?: boolean; browser?: boolean; linuxId?: string } = {},
): SetupCommand[] {
  if (!['linux', 'win32'].includes(platform))
    throw new Error('Repro setup supports Windows and Linux.');
  const commands: SetupCommand[] = [];
  if (options.system) {
    if (platform === 'win32') {
      for (const id of ['Gyan.FFmpeg', 'UB-Mannheim.TesseractOCR'])
        commands.push({
          command: 'winget',
          args: [
            'install',
            '--exact',
            '--id',
            id,
            '--silent',
            '--accept-package-agreements',
            '--accept-source-agreements',
            '--disable-interactivity',
          ],
          purpose: `Install ${id}`,
        });
    } else {
      if (!['ubuntu', 'debian'].includes(options.linuxId ?? ''))
        throw new Error(
          'Automatic system setup supports Ubuntu/Debian. Install FFmpeg with libass, Tesseract (English data), fontconfig and Chromium system libraries using your distribution package manager, then run repro setup.',
        );
      commands.push(
        {
          command: 'sudo',
          args: ['apt-get', 'update'],
          purpose: 'Refresh system package index',
        },
        {
          command: 'sudo',
          args: [
            'apt-get',
            'install',
            '-y',
            'ffmpeg',
            'tesseract-ocr',
            'tesseract-ocr-eng',
            'fontconfig',
            'fonts-liberation',
          ],
          purpose: 'Install video, OCR and font tools',
        },
      );
    }
  }
  if (options.browser !== false)
    commands.push({
      command: process.execPath,
      args: [
        join(dirname(require.resolve('playwright/package.json')), 'cli.js'),
        'install',
        ...(options.system && platform === 'linux' ? ['--with-deps'] : []),
        'chromium',
      ],
      purpose: 'Install lockfile-pinned Chromium and headless shell',
    });
  return commands;
}
export async function setup(
  options: { system?: boolean; browser?: boolean; dryRun?: boolean } = {},
) {
  let linuxId = '';
  if (process.platform === 'linux') {
    const release = await readFile('/etc/os-release', 'utf8');
    linuxId = /^ID=["']?([^\s"']+)/m.exec(release)?.[1] ?? '';
  }
  if (process.arch !== 'x64')
    throw new Error(
      'Repro 0.2 supports x64 hosts; ARM renderer support has not been validated.',
    );
  const commands = setupCommands(process.platform, { ...options, linuxId });
  if (options.dryRun)
    return { platform: process.platform, arch: process.arch, commands };
  const before = await doctor();
  const passed = (name: string) =>
    before.checks.some((c) => c.name === name && c.status === 'passed');
  for (const item of commands) {
    if (
      item.command === 'winget' &&
      ((item.args.includes('Gyan.FFmpeg') &&
        ['ffmpeg', 'ffprobe', 'filters'].every(passed)) ||
        (item.args.includes('UB-Mannheim.TesseractOCR') && passed('ocr')))
    )
      continue;
    const elevated = item.command === 'sudo' && process.getuid?.() === 0;
    try {
      await runProcess(
        elevated ? (item.args[0] ?? item.command) : item.command,
        elevated ? item.args.slice(1) : item.args,
        { stdin: 'inherit' },
      );
    } catch (error) {
      throw new Error(
        `${item.purpose} failed. Run repro setup --dry-run${options.system ? ' --system' : ''} for exact commands. System installation may need an elevated terminal. ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  const report = await doctor();
  return {
    platform: process.platform,
    arch: process.arch,
    commands,
    ...report,
    ok: report.checks.every((check) => check.status === 'passed'),
  };
}
