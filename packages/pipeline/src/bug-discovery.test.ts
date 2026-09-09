import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import {
  bugBriefJsonSchema,
  discoveryAssessmentJsonSchema,
  capabilities,
  validateEvidence,
} from '@repro/contracts';
import { FeatureFlagsSchema } from '@repro/contracts/config';
import { discoverBug, discoveryGuide } from './bug-discovery.js';

const brief = {
  title: 'Checkout ignores a natural click',
  expected: 'Checkout opens',
  actual: 'No heading appears',
  steps: ['Open the cart', 'Click Checkout'],
  tags: ['functional'],
};
const assessment = {
  claim: 'Checkout fails to open after its natural click',
  expected: 'Checkout opens',
  concerns: [
    {
      kind: 'interaction',
      rationale: 'The reported click does not open the expected page',
      sourceRefs: ['actual', 'steps.2'],
    },
  ],
  triggerStep: 2,
  targets: [
    {
      id: 'target',
      description: 'Intended Checkout control',
      role: 'affected',
    },
  ],
};
describe('bug discovery', () => {
  it('reviews every capability and feature without calling tags a diagnosis', () => {
    const report = discoverBug(brief);
    expect(report.status).toBe('needs-assessment');
    expect(report.evidenceDraft).toBeNull();
    expect(report.decisions).toEqual([]);
    expect(report.candidates.map((c) => c.concern)).toContain('interaction');
    expect(report.capabilityReview.map((c) => c.id)).toEqual(
      capabilities.map((c) => c.id),
    );
    expect(report.featureReview.map((f) => f.id)).toEqual(
      FeatureFlagsSchema.keyof().options,
    );
    for (const strategy of discoveryGuide().strategies) {
      for (const id of strategy.capabilities)
        expect(
          capabilities.some((c) => c.id === id),
          id,
        ).toBe(true);
      for (const flag of strategy.features)
        expect(FeatureFlagsSchema.keyof().options).toContain(flag);
    }
  });
  it('covers the 19 fixture ticket reports without importing their fabricated geometry or instructions', () => {
    const directory = resolve('testdata/bugs');
    const files = readdirSync(directory).filter((f) =>
      /^BUG-\d+\.json$/.test(f),
    );
    expect(files).toHaveLength(19);
    for (const file of files) {
      const ticket = JSON.parse(
        readFileSync(resolve(directory, file), 'utf8'),
      ) as Record<string, unknown>;
      ticket['Custom.Selectors'] = { injected: 'SECRET-DO-NOT-REPEAT' };
      ticket['Custom.AnnotationHints'] = [
        { x: 999, label: 'SECRET-DO-NOT-REPEAT' },
      ];
      const result = discoverBug(ticket);
      expect(result.brief.steps.length, file).toBeGreaterThan(0);
      expect(result.candidates.length, file).toBeGreaterThan(0);
      expect(JSON.stringify(result)).not.toContain('SECRET-DO-NOT-REPEAT');
      expect(result.sourceTrust).toBe('reported-not-verified');
    }
  });
  it('requires agent reasoning for untagged prose and respects deliberate non-selection', () => {
    const report = discoverBug({
      ...brief,
      description: 'There are no console errors; do not assume one.',
      tags: [],
    });
    expect(report.candidates).toEqual([]);
    const selected = discoverBug(
      { ...brief, tags: ['console', 'functional'] },
      assessment,
    );
    expect(selected.decisions.map((d) => d.id)).toEqual(['interaction']);
    expect(
      selected.featureReview.find((f) => f.id === 'consoleOverlay')?.decision,
    ).toBe('not-selected');
    expect(
      selected.capabilityReview.find((c) => c.id === 'experiment-native')
        ?.decision,
    ).toBe('not-selected');
    expect(
      validateEvidence(selected.evidenceDraft).checkpoints[0]?.observations,
    ).toContain('hit-test');
  });
  it('rejects invalid interpretation references and keeps timing and geometry in separate passes', () => {
    expect(() => discoverBug(brief, { ...assessment, triggerStep: 3 })).toThrow(
      'outside',
    );
    expect(() =>
      discoverBug(brief, {
        ...assessment,
        concerns: [{ ...assessment.concerns[0], sourceRefs: ['invented'] }],
      }),
    ).toThrow('source reference');
    expect(() =>
      discoverBug(brief, {
        ...assessment,
        concerns: [{ ...assessment.concerns[0], sourceRefs: ['toString'] }],
      }),
    ).toThrow('source reference');
    const combined = {
      ...assessment,
      concerns: [
        {
          kind: 'transient',
          rationale: 'A brief state needs event-linked frames',
          sourceRefs: ['title'],
        },
        {
          kind: 'geometry',
          rationale: 'Position needs an independent measurement',
          sourceRefs: ['title'],
        },
      ],
    };
    const incomplete = discoverBug(brief, combined);
    expect(incomplete.passes.map((p) => p.profile)).toEqual([
      'faithful',
      'controlled',
    ]);
    expect(incomplete.evidenceDraft).toBeNull();
    const complete = discoverBug(brief, {
      ...combined,
      transientFrame: {
        kind: 'probe.pointer:path',
        match: { phase: 'pointerdown' },
        offsetMs: 100,
      },
    });
    const evidence = validateEvidence(complete.evidenceDraft);
    expect(evidence.checkpoints[0]?.frame?.offsetMs).toBe(100);
    expect(evidence.segments[0]?.step).toBe('step-2');
  });
  it('does not demand bounds for disappearance or intrusive diagnostics in a timing proof', () => {
    const appearance = discoverBug(brief, {
      ...assessment,
      concerns: [
        {
          kind: 'appearance',
          rationale: 'The reported target disappears',
          sourceRefs: ['actual'],
        },
      ],
    });
    const absentProof = validateEvidence(appearance.evidenceDraft);
    expect(absentProof.checkpoints[0]?.observations).toContain('visibility');
    expect(absentProof.checkpoints[0]?.observations).not.toContain('bounds');
    expect(absentProof.checkpoints[0]?.highlights).toEqual([]);
    const timing = discoverBug(brief, {
      ...assessment,
      concerns: [
        ...assessment.concerns,
        {
          kind: 'transient',
          rationale: 'The failure occurs only briefly',
          sourceRefs: ['actual'],
        },
      ],
      transientFrame: { kind: 'probe.pointer:path', offsetMs: 100 },
    });
    expect(
      timing.passes.some((p) => p.purpose.includes('Diagnose pointer')),
    ).toBe(true);
    expect(
      validateEvidence(timing.evidenceDraft).checkpoints.at(-1)?.observations,
    ).not.toContain('hit-test');
  });
  it('blocks native proof and structurally validates the published assessment schema', () => {
    const native = discoverBug(brief, {
      ...assessment,
      concerns: [
        {
          kind: 'native',
          rationale: 'Needs browser chrome',
          sourceRefs: ['title'],
        },
      ],
    });
    expect(native.status).toBe('unsupported-surface');
    expect(native.passes).toEqual([]);
    expect(native.capabilityReview.find((c) => c.id === 'run')?.decision).toBe(
      'not-selected',
    );
    expect(native.evidenceDraft).toBeNull();
    const ajv = new Ajv2020({ strict: false });
    expect(ajv.compile(bugBriefJsonSchema)(brief)).toBe(true);
    const validate = ajv.compile(discoveryAssessmentJsonSchema);
    expect(validate(assessment)).toBe(true);
    expect(validate({ ...assessment, triggerStep: 0 })).toBe(false);
  });
});
