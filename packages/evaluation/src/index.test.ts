import { describe, expect, it } from 'vitest';

import {
  buildQualityReport,
  detectionPrecision,
  detectionRecall,
  metricStatus,
  qualityMetricsFromValues,
  regionIou,
  requiredDimensionsPass,
} from './index.js';

describe('evaluation gates', () => {
  it('treats completion alone as insufficient for pass', () => {
    const report = buildQualityReport({
      completed: true,
      metrics: [
        {
          name: 'redaction-leakage',
          required: true,
          status: 'fail',
          threshold: 0,
          value: 2,
        },
      ],
    });

    expect(report.completed).toBe(true);
    expect(report.pass).toBe(false);
  });

  it('passes only when required dimensions pass', () => {
    const metrics = [
      {
        name: 'determinism' as const,
        required: true,
        status: metricStatus(1, 1, 'at-least'),
        threshold: 1,
        value: 1,
      },
      {
        name: 'redaction-leakage' as const,
        required: true,
        status: metricStatus(0, 0, 'at-most'),
        threshold: 0,
        value: 0,
      },
      {
        name: 'human-usefulness' as const,
        required: false,
        status: 'warn' as const,
        threshold: 0.7,
        value: 0.6,
      },
    ];

    expect(requiredDimensionsPass(metrics)).toBe(true);
    expect(buildQualityReport({ completed: true, metrics }).pass).toBe(true);
  });

  it('computes detection and IoU helpers', () => {
    expect(
      detectionPrecision({ falsePositive: 1, truePositive: 3 }),
    ).toBeCloseTo(0.75);
    expect(detectionRecall({ falseNegative: 1, truePositive: 3 })).toBeCloseTo(
      0.75,
    );
    expect(regionIou({ intersectionArea: 50, unionArea: 100 })).toBeCloseTo(
      0.5,
    );
  });

  it('maps simple run metric values to required quality metrics', () => {
    const metrics = qualityMetricsFromValues({
      detectionPrecision: 0.95,
      redactionLeakage: 0.1,
    });

    expect(metrics).toContainEqual(
      expect.objectContaining({
        name: 'detection-precision',
        status: 'pass',
      }),
    );
    expect(metrics).toContainEqual(
      expect.objectContaining({
        name: 'redaction-leakage',
        status: 'fail',
      }),
    );
  });
});
