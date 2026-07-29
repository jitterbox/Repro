import {
  driveConsoleSave,
  driveGeometry,
} from '@repro/e2e-fixture';

import type { BugWorkItem } from '@repro/e2e-fixture';
import type { CaptureSession } from '@repro/capture';
import type { CompareManifest } from '@repro/compare';

type BugDriver = (session: CaptureSession) => Promise<void>;

const BUG_DRIVERS: Readonly<Record<string, BugDriver>> = {
  'BUG-1001': driveGeometry,
  'BUG-1008': driveConsoleSave,
};

export function bugCaptureDriver(bugId: string): BugDriver {
  const driver = BUG_DRIVERS[bugId];
  if (driver === undefined) {
    throw new Error(`No capture driver registered for ${bugId}`);
  }
  return driver;
}

export function compareManifestForBug(
  bugId: string,
  variant: 'broken' | 'fixed',
): CompareManifest {
  if (bugId === 'BUG-1001') {
    return geometryManifest(
      'save',
      variant === 'broken' ? -12 : 0,
    );
  }

  throw new Error(`No compare manifest registered for ${bugId}`);
}

function geometryManifest(
  id: string,
  dx: number,
  color = '#000000',
): CompareManifest {
  return {
    environment: {
      browserVersion: 'chromium',
      deviceScaleFactor: 1,
      locale: 'en-US',
      playwrightVersion: '1.62.0',
      schemaVersion: 1,
      timezone: 'UTC',
      viewport: { deviceScaleFactor: 1, height: 720, width: 1280 },
    },
    geometry: [
      {
        bounds: { h: 36, w: 96, x: 140 + dx, y: 420 },
        path: 'main/aside/div.save-row/button',
        styles: { color },
        testId: 'btn-save',
        text: color,
      },
    ],
    schemaVersion: 1,
    steps: [
      {
        durationMs: 1_000,
        id: `${id}-step`,
        label: 'Inspect control',
        startMs: 0,
      },
    ],
  };
}

export function expectedFiledFeatures(
  bug: BugWorkItem,
): Readonly<Record<string, boolean>> {
  const features = bug['Custom.ReproConfig'].features;
  return {
    specCard: features.specCard === true,
    steps: features.steps === true,
  };
}
