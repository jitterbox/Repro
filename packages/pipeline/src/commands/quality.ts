import {
  buildQualityReport,
  qualityMetricsFromValues,
} from '@jitterbox/repro-evaluation';

import { readJson, writeJson } from './io.js';

import type {
  QualityMetric,
  QualityMetricValues,
  QualityReport,
} from '@jitterbox/repro-evaluation';

type MutableQualityMetricValues = {
  -readonly [Key in keyof QualityMetricValues]?: number;
};

export interface QualityCommandOptions {
  readonly input: string;
  readonly out?: string;
}

export async function qualityCommand(
  options: QualityCommandOptions,
): Promise<QualityReport> {
  const source = await readJson(options.input);
  const report = buildQualityReport(qualityReportInput(source));

  await writeJson(options.out ?? 'quality-report.json', report);
  return report;
}

function qualityReportInput(value: unknown): {
  readonly completed: boolean;
  readonly metrics: readonly QualityMetric[];
} {
  const record = isRecord(value) ? value : {};
  const metrics = metricsFromRecord(record);
  const completed =
    typeof record.completed === 'boolean' ? record.completed : true;

  return { completed, metrics };
}

function metricsFromRecord(
  record: Readonly<Record<string, unknown>>,
): readonly QualityMetric[] {
  if (Array.isArray(record.metrics)) {
    return record.metrics.flatMap(metricFromUnknown);
  }

  if (isRecord(record.expected)) {
    return qualityMetricsFromValues(metricValuesFrom(record.expected));
  }

  return qualityMetricsFromValues(metricValuesFrom(record));
}

function metricFromUnknown(value: unknown): readonly QualityMetric[] {
  if (!isRecord(value)) {
    return [];
  }

  return [value as unknown as QualityMetric];
}

function metricValuesFrom(
  record: Readonly<Record<string, unknown>>,
): QualityMetricValues {
  const values: MutableQualityMetricValues = {};

  addNumber(values, 'alignmentErrorMs', record.alignmentErrorMs);
  addNumber(values, 'detectionPrecision', record.detectionPrecision);
  addNumber(values, 'detectionRecall', record.detectionRecall);
  addNumber(values, 'determinism', record.determinism);
  addNumber(values, 'hallucination', record.hallucination);
  addNumber(values, 'humanUsefulness', record.humanUsefulness);
  addNumber(values, 'redactionLeakage', record.redactionLeakage);
  addNumber(values, 'regionIou', record.regionIou);

  return values;
}

function addNumber(
  target: MutableQualityMetricValues,
  key: keyof QualityMetricValues,
  value: unknown,
): void {
  const number = numberValue(value);

  if (number !== undefined) {
    target[key] = number;
  }
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
