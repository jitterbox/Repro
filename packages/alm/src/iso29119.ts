export interface ReproStep {
  readonly action: string;
  readonly expected: string;
}

export interface AttemptSummary {
  readonly attempts: number;
  readonly hits: number;
}

export interface Iso29119Input {
  readonly title: string;
  readonly steps: readonly ReproStep[];
  readonly systemInfo: readonly SystemInfoEntry[];
  readonly attempts: AttemptSummary;
}

export interface SystemInfoEntry {
  readonly name: string;
  readonly value: string;
}

export interface Iso29119Fields {
  readonly 'Microsoft.VSTS.TCM.ReproSteps': string;
  readonly 'Microsoft.VSTS.TCM.SystemInfo': string;
}

export function buildIso29119Fields(input: Iso29119Input): Iso29119Fields {
  return {
    'Microsoft.VSTS.TCM.ReproSteps': reproStepsHtml(input),
    'Microsoft.VSTS.TCM.SystemInfo': systemInfoHtml(input.systemInfo),
  };
}

function reproStepsHtml(input: Iso29119Input): string {
  const steps = input.steps.map(stepHtml).join('');

  return [
    '<div>',
    `<h3>${escapeHtml(input.title)}</h3>`,
    '<p><strong>Attempts to Repeat:</strong> ',
    `${attemptsText(input.attempts)}</p>`,
    `<ol>${steps}</ol>`,
    '</div>',
  ].join('');
}

function stepHtml(step: ReproStep): string {
  return [
    '<li>',
    `<p><strong>Action:</strong> ${escapeHtml(step.action)}</p>`,
    `<p><strong>Expected:</strong> ${escapeHtml(step.expected)}</p>`,
    '</li>',
  ].join('');
}

function systemInfoHtml(entries: readonly SystemInfoEntry[]): string {
  const rows = entries.map(systemInfoRow).join('');

  return `<table><tbody>${rows}</tbody></table>`;
}

function systemInfoRow(entry: SystemInfoEntry): string {
  return [
    '<tr>',
    `<th>${escapeHtml(entry.name)}</th>`,
    `<td>${escapeHtml(entry.value)}</td>`,
    '</tr>',
  ].join('');
}

function attemptsText(input: AttemptSummary): string {
  const attempts = Math.max(0, input.attempts);
  const hits = Math.min(Math.max(0, input.hits), attempts);
  const rate = attempts === 0 ? 0 : hits / attempts;
  const percent = Math.round(rate * 100);

  return `${String(hits)} of ${String(attempts)} (${String(percent)}% hit rate)`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
