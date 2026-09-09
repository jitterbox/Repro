import { describe, it, expect } from 'vitest';
import { capabilities, recipes, validateEvidence } from './discovery.js';
import { capabilitySchema } from '@repro/contracts';
describe('AI-readable discovery', () => {
  it('describes every entry with prerequisites, invocation and verification', () => {
    for (const capability of capabilities) {
      expect(capabilitySchema.safeParse(capability).success).toBe(true);
      if (capability.status === 'implemented') {
        if(capability.surface==='cli') expect(capability.invocation).toMatch(/^repro /);
        else if(capability.surface==='playwright') expect(capability.invocation).toContain('repro.');
        expect(capability.verification.length).toBeGreaterThan(10);
      }
    }
  });
  it('publishes structurally and semantically valid recipes', () => {
    for (const recipe of recipes)
      expect(validateEvidence(recipe)).toEqual(recipe);
  });
});
