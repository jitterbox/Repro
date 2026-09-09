import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';

import type { JudgeInput, JudgeVerdict, VideoJudge } from './types.js';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const FALLBACK_MODEL = 'claude-3-5-sonnet-20241022';
const DEFAULT_VOTES = 3;

export interface AnthropicJudgeOptions {
  readonly apiKey: string;
  readonly model?: string;
  readonly votes?: number;
  readonly cacheDir?: string;
}

export function anthropicJudge(options: AnthropicJudgeOptions): VideoJudge {
  if (!options.apiKey.trim()) {
    throw new Error(
      'anthropicJudge requires a non-empty apiKey; set ANTHROPIC_API_KEY',
    );
  }

  const model = options.model ?? DEFAULT_MODEL;
  const votes = options.votes ?? DEFAULT_VOTES;
  const cacheDir =
    options.cacheDir ?? join(process.cwd(), '.repro', 'judge-cache');

  return {
    assess: (input) =>
      assessWithCache(input, { ...options, model, votes, cacheDir }),
  };
}

async function assessWithCache(
  input: JudgeInput,
  options: AnthropicJudgeOptions & {
    readonly model: string;
    readonly votes: number;
    readonly cacheDir: string;
  },
): Promise<JudgeVerdict> {
  const videoHash = await sha256File(input.videoPath);
  await mkdir(options.cacheDir, { recursive: true });
  const cachePath = join(options.cacheDir, `${videoHash}.json`);

  try {
    await access(cachePath);
    return JSON.parse(await readFile(cachePath, 'utf8')) as JudgeVerdict;
  } catch {
    // cache miss
  }

  const verdict = await majorityVerdict(input, options);
  await writeFile(cachePath, `${JSON.stringify(verdict, null, 2)}\n`, 'utf8');
  return verdict;
}

async function majorityVerdict(
  input: JudgeInput,
  options: AnthropicJudgeOptions & {
    readonly model: string;
    readonly votes: number;
  },
): Promise<JudgeVerdict> {
  const verdicts = await Promise.all(
    Array.from({ length: options.votes }, () => callAnthropic(input, options)),
  );

  const passVotes = verdicts.filter((verdict) => verdict.pass).length;
  const pass = passVotes > verdicts.length / 2;
  const score =
    verdicts.reduce((total, verdict) => total + verdict.score, 0) /
    verdicts.length;

  const findings = dedupeFindings(
    verdicts.flatMap((verdict) => verdict.findings),
  );
  const summary = verdicts.map((verdict) => verdict.summary).join(' | ');

  return { pass, score, summary, findings };
}

async function callAnthropic(
  input: JudgeInput,
  options: AnthropicJudgeOptions & { readonly model: string },
): Promise<JudgeVerdict> {
  const prompt = buildPrompt(input);
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': options.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: options.model,
      max_tokens: 1024,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    const retryModel =
      options.model === DEFAULT_MODEL ? FALLBACK_MODEL : undefined;
    if (response.status === 404 && retryModel) {
      return callAnthropic(input, { ...options, model: retryModel });
    }
    throw new Error(`Anthropic judge failed (${response.status}): ${body}`);
  }

  const payload = (await response.json()) as AnthropicResponse;
  const text = payload.content
    .flatMap((block) => (block.type === 'text' ? [block.text] : []))
    .join('\n');
  return parseVerdict(text);
}

function buildPrompt(input: JudgeInput): string {
  const rubric =
    input.rubric ??
    [
      'You are evaluating a bug reproduction video for human usefulness.',
      'Return JSON only: {"pass":boolean,"score":0-1,"summary":string,',
      '"findings":[{"message":string,"confidence":0-1}]}.',
      'Fail when overlays are missing, redaction leaks are likely,',
      'or the reproduction steps are unclear.',
    ].join(' ');

  return [
    rubric,
    `Video path: ${input.videoPath}`,
    input.planPath ? `Plan path: ${input.planPath}` : '',
    input.bugId ? `Bug ID: ${input.bugId}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function parseVerdict(text: string): JudgeVerdict {
  const jsonMatch = /\{[\s\S]*\}/u.exec(text);
  if (!jsonMatch) {
    return {
      pass: false,
      score: 0,
      summary: 'Judge returned non-JSON response',
      findings: [{ message: text.slice(0, 500), confidence: 0.2 }],
    };
  }

  const parsed = JSON.parse(jsonMatch[0]) as Partial<JudgeVerdict>;
  return {
    pass: Boolean(parsed.pass),
    score: clamp01(parsed.score ?? 0),
    summary: typeof parsed.summary === 'string' ? parsed.summary : 'No summary',
    findings: Array.isArray(parsed.findings)
      ? parsed.findings.flatMap((finding) => {
          if (
            finding &&
            typeof finding === 'object' &&
            typeof (finding as JudgeFindingRecord).message === 'string'
          ) {
            const record = finding as JudgeFindingRecord;
            return [
              {
                message: record.message,
                confidence: clamp01(record.confidence ?? 0.5),
              },
            ];
          }
          return [];
        })
      : [],
  };
}

function dedupeFindings(
  findings: JudgeVerdict['findings'],
): JudgeVerdict['findings'] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = finding.message.trim().toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function sha256File(path: string): Promise<string> {
  const data = await readFile(path);
  return createHash('sha256').update(data).digest('hex');
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

interface AnthropicResponse {
  readonly content: readonly {
    readonly type: string;
    readonly text?: string;
  }[];
}

interface JudgeFindingRecord {
  readonly message: string;
  readonly confidence?: number;
}
