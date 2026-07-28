export const REPRO_EVALUATION_VERSION = '0.0.0' as const;

export type QualityMetricName =
  | 'alignment-error'
  | 'detection-precision'
  | 'detection-recall'
  | 'determinism'
  | 'hallucination'
  | 'human-usefulness'
  | 'redaction-leakage'
  | 'region-iou';

export type QualityMetricStatus = 'fail' | 'pass' | 'warn';

export interface QualityMetric {
  readonly name: QualityMetricName;
  readonly required: boolean;
  readonly status: QualityMetricStatus;
  readonly threshold: number;
  readonly value: number;
}

export interface QualityReport {
  readonly completed: boolean;
  readonly generatedAtEpoch: number;
  readonly metrics: readonly QualityMetric[];
  readonly pass: boolean;
  readonly schemaVersion: 1;
}

export interface QualityReportInput {
  readonly completed: boolean;
  readonly metrics: readonly QualityMetric[];
  readonly nowEpoch?: number;
}

export interface QualityMetricValues {
  readonly alignmentErrorMs?: number;
  readonly detectionPrecision?: number;
  readonly detectionRecall?: number;
  readonly determinism?: number;
  readonly hallucination?: number;
  readonly humanUsefulness?: number;
  readonly redactionLeakage?: number;
  readonly regionIou?: number;
}

export interface AdapterRequest {
  readonly manifestPath: string;
  readonly runId: string;
}

export interface AdapterFinding {
  readonly confidence: number;
  readonly message: string;
  readonly source: 'diffspot' | 'wuicc';
}

export interface EvaluationAdapter {
  evaluate(input: AdapterRequest): Promise<readonly AdapterFinding[]>;
}

export function buildQualityReport(input: QualityReportInput): QualityReport {
  const metrics = input.metrics;

  return {
    completed: input.completed,
    generatedAtEpoch: input.nowEpoch ?? Date.now(),
    metrics,
    pass: input.completed && requiredDimensionsPass(metrics),
    schemaVersion: 1,
  };
}

export function qualityMetricsFromValues(
  input: QualityMetricValues,
): readonly QualityMetric[] {
  return [
    metricFromValue(input.alignmentErrorMs, {
      direction: 'at-most',
      name: 'alignment-error',
      threshold: 250,
    }),
    metricFromValue(input.detectionPrecision, {
      direction: 'at-least',
      name: 'detection-precision',
      threshold: 0.9,
    }),
    metricFromValue(input.detectionRecall, {
      direction: 'at-least',
      name: 'detection-recall',
      threshold: 0.85,
    }),
    metricFromValue(input.determinism, {
      direction: 'at-least',
      name: 'determinism',
      threshold: 0.95,
    }),
    metricFromValue(input.hallucination, {
      direction: 'at-most',
      name: 'hallucination',
      threshold: 0.05,
    }),
    metricFromValue(input.humanUsefulness, {
      direction: 'at-least',
      name: 'human-usefulness',
      threshold: 0.7,
    }),
    metricFromValue(input.redactionLeakage, {
      direction: 'at-most',
      name: 'redaction-leakage',
      threshold: 0,
    }),
    metricFromValue(input.regionIou, {
      direction: 'at-least',
      name: 'region-iou',
      threshold: 0.8,
    }),
  ].filter((metric): metric is QualityMetric => metric !== null);
}

export function requiredDimensionsPass(
  metrics: readonly QualityMetric[],
): boolean {
  return metrics.every((metric) => {
    return !metric.required || metric.status === 'pass';
  });
}

function metricFromValue(
  value: number | undefined,
  options: {
    readonly direction: 'at-least' | 'at-most';
    readonly name: QualityMetricName;
    readonly threshold: number;
  },
): QualityMetric | null {
  if (value === undefined) {
    return null;
  }

  return {
    name: options.name,
    required: true,
    status: metricStatus(value, options.threshold, options.direction),
    threshold: options.threshold,
    value,
  };
}

export function metricStatus(
  value: number,
  threshold: number,
  direction: 'at-least' | 'at-most',
): QualityMetricStatus {
  const pass =
    direction === 'at-least' ? value >= threshold : value <= threshold;
  return pass ? 'pass' : 'fail';
}

export function detectionPrecision(input: {
  readonly falsePositive: number;
  readonly truePositive: number;
}): number {
  const total = input.truePositive + input.falsePositive;
  return total === 0 ? 1 : input.truePositive / total;
}

export function detectionRecall(input: {
  readonly falseNegative: number;
  readonly truePositive: number;
}): number {
  const total = input.truePositive + input.falseNegative;
  return total === 0 ? 1 : input.truePositive / total;
}

export function regionIou(input: {
  readonly intersectionArea: number;
  readonly unionArea: number;
}): number {
  return input.unionArea === 0 ? 1 : input.intersectionArea / input.unionArea;
}

export function alignmentErrorMs(input: {
  readonly actualMs: number;
  readonly expectedMs: number;
}): number {
  return Math.abs(input.actualMs - input.expectedMs);
}

export function redactionLeakage(input: {
  readonly leakedCount: number;
  readonly inspectedCount: number;
}): number {
  return input.inspectedCount === 0
    ? 0
    : input.leakedCount / input.inspectedCount;
}

export function determinismScore(input: {
  readonly matchingRuns: number;
  readonly totalRuns: number;
}): number {
  return input.totalRuns === 0 ? 1 : input.matchingRuns / input.totalRuns;
}

export function hallucinationRate(input: {
  readonly unsupportedClaims: number;
  readonly totalClaims: number;
}): number {
  return input.totalClaims === 0
    ? 0
    : input.unsupportedClaims / input.totalClaims;
}

export function humanUsefulness(input: {
  readonly averageRating: number;
  readonly maxRating: number;
}): number {
  return input.maxRating === 0 ? 0 : input.averageRating / input.maxRating;
}

export function diffSpotAdapter(endpoint: string): EvaluationAdapter {
  return httpAdapter(endpoint, 'diffspot');
}

export function wuiccAdapter(endpoint: string): EvaluationAdapter {
  return httpAdapter(endpoint, 'wuicc');
}

export function localAdapter(
  findings: readonly AdapterFinding[],
): EvaluationAdapter {
  return {
    evaluate: () => Promise.resolve(findings),
  };
}

function httpAdapter(
  endpoint: string,
  source: AdapterFinding['source'],
): EvaluationAdapter {
  return {
    evaluate: async (input) => {
      const response = await fetch(endpoint, {
        body: JSON.stringify(input),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(`${source} adapter failed`);
      }

      return parseFindings(await response.json(), source);
    },
  };
}

function parseFindings(
  value: unknown,
  source: AdapterFinding['source'],
): readonly AdapterFinding[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const message = item.message;
    const confidence = item.confidence;

    if (typeof message !== 'string' || typeof confidence !== 'number') {
      return [];
    }

    return [{ confidence, message, source }];
  });
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
