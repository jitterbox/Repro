import { describe, expect, it } from 'vitest';

import { checkOverlayPresence } from './overlay-presence.js';

describe('overlay-presence gate', () => {
  it('fails when plan has zero annotations', async () => {
    const result = await checkOverlayPresence({ plan: { annotations: [] } });

    expect(result.pass).toBe(false);
    expect(result.name).toBe('overlay-presence');
    expect(result.message).toMatch(/zero visible overlays/i);
  });

  it('passes when annotations are present', async () => {
    const result = await checkOverlayPresence({
      plan: {
        annotations: [
          {
            id: 'ann-1',
            component: 'step-badge',
          },
        ],
      },
    });

    expect(result.pass).toBe(true);
  });
});
