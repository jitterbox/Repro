import { testId, type BugWorkItem } from '../bugs.js';
import { waitReady } from '../harness.js';

import type { CaptureSession } from '@repro/capture';

export async function driveMenuExport(session: CaptureSession): Promise<void> {
  const page = session.page;
  await waitReady(page);
  await session.showChapter('Accept terms');
  await page.click('[data-testid="chk-terms"]');
  await session.showChapter('Open Actions');
  await page.click('[data-testid="btn-actions"]');
  await session.emitElementCue(
    'editorial.stacking',
    '[data-testid="menu-actions"]',
    {
      zIndex: 50,
      label: 'Actions menu',
    },
  );
  await page.click('[data-testid="btn-export"]');
  await session.emitElementCue(
    'editorial.stacking',
    '[data-testid="menu-export"]',
    {
      zIndex: 20,
      label: 'Export submenu (losing)',
    },
  );
  await page.waitForTimeout(400);
  await page.click('[data-testid="btn-export-csv"]').catch(() => undefined);
  await page.waitForTimeout(300);
}

export async function driveConsoleSave(session: CaptureSession): Promise<void> {
  const page = session.page;
  await waitReady(page);
  await session.showChapter('Click Save');
  page.once('pageerror', () => undefined);
  await page.click('[data-testid="btn-save"]').catch(() => undefined);
  await page.waitForTimeout(500);
}

export async function driveTiming(session: CaptureSession): Promise<void> {
  const page = session.page;
  await waitReady(page);
  session.emitSemantic('editorial.pause', { holdMs: 1400 });
  await page.waitForTimeout(200);
  await session.showChapter('Recalculate freeze');
  await page.click('[data-testid="btn-recalculate"]');
  session.emitSemantic('editorial.freeze', { durationMs: 1200 });
  await page.waitForTimeout(400);
}

export async function driveHeavySort(session: CaptureSession): Promise<void> {
  const page = session.page;
  await waitReady(page);
  session.emitSemantic('editorial.pause', { holdMs: 1000 });
  await session.showChapter('Heavy sort freeze');
  await page.click('[data-testid="btn-sort-heavy"]');
  session.emitSemantic('editorial.freeze', { durationMs: 900 });
  await page.waitForTimeout(400);
}

export async function driveCls(session: CaptureSession): Promise<void> {
  const page = session.page;
  await waitReady(page);
  session.emitSemantic('editorial.slowmo', { factor: 4 });
  await session.showChapter('Wait for promo CLS');
  await page.waitForSelector('[data-testid="promo-banner"]', {
    timeout: 3_000,
  });
  await session.emitElementCue('editorial.zoom', '[data-testid="promo-slot"]', {
    magnification: 2.5,
  });
  await page.waitForTimeout(600);
}

export async function driveToastStack(session: CaptureSession): Promise<void> {
  const page = session.page;
  await waitReady(page);
  await session.showChapter('Wait for toast CLS');
  await page.waitForSelector('[data-testid="stack-toast"]', { timeout: 3_000 });
  await session.emitElementCue(
    'editorial.hidden',
    '[data-testid="aria-ghost"]',
    { label: 'aria-hidden surcharge' },
  );
  await session.showChapter('Open Actions stacking');
  await page.click('[data-testid="chk-terms"]');
  await page.click('[data-testid="btn-actions"]');
  await session.emitElementCue(
    'editorial.stacking',
    '[data-testid="sticky-tip"]',
    {
      zIndex: 15,
      label: 'Sticky tip',
    },
  );
  await page.click('[data-testid="btn-export"]');
  await session.emitElementCue(
    'editorial.stacking',
    '[data-testid="menu-export"]',
    {
      zIndex: 10,
      label: 'Export under tip',
    },
  );
  await page.waitForTimeout(500);
}

export async function driveBadgeFlicker(
  session: CaptureSession,
): Promise<void> {
  const page = session.page;
  await waitReady(page);
  session.emitSemantic('editorial.pause', { holdMs: 1400 });
  session.emitSemantic('editorial.slowmo', { factor: 4 });
  await session.showChapter('Watch badge flicker');
  await page.locator('[data-testid="status-badge"]').waitFor({
    state: 'visible',
  });
  await page.waitForTimeout(1_200);
}

export async function driveHoverHidden(session: CaptureSession): Promise<void> {
  const page = session.page;
  await waitReady(page);
  await session.showChapter('Reveal advanced pricing');
  await session.emitElementCue(
    'editorial.hidden',
    '[data-testid="advanced-panel"]',
    { label: 'Hover-only panel' },
  );
  await page.hover('[data-testid="advanced-wrap"]');
  await page.waitForTimeout(500);
}

export async function drivePointer(session: CaptureSession): Promise<void> {
  const page = session.page;
  await waitReady(page);
  await session.showChapter('Right-click Beta');
  await page.click('[data-testid="sku-beta"]', { button: 'right' });
  await page.click('[data-testid="ctx-delete"]');
  await session.showChapter('Drag Gamma');
  const handle = page.locator('[data-testid="drag-handle-gamma"]');
  const target = page.locator('[data-testid="sku-alpha"]');
  await handle.dragTo(target);
  await page.waitForTimeout(400);
}

export async function driveDragOffset(session: CaptureSession): Promise<void> {
  const page = session.page;
  await waitReady(page);
  await session.showChapter('Drag Gamma residual');
  await session.emitElementCue('editorial.zoom', '[data-testid="sku-gamma"]', {
    magnification: 2.5,
  });
  const handle = page.locator('[data-testid="drag-handle-gamma"]');
  const target = page.locator('[data-testid="sku-alpha"]');
  await handle.dragTo(target);
  await page.waitForTimeout(500);
}

export async function driveA11y(session: CaptureSession): Promise<void> {
  const page = session.page;
  await waitReady(page);
  await session.showChapter('Tiny hit target');
  await session.emitElementCue(
    'editorial.hit-target',
    '[data-testid="btn-row-menu"]',
    { label: '8×8 hit target' },
  );
  await session.emitElementCue(
    'editorial.zoom',
    '[data-testid="btn-row-menu"]',
    {
      magnification: 2.5,
    },
  );
  await page.click('[data-testid="btn-row-menu"]').catch(() => undefined);
  await session.showChapter('Keyboard trap');
  await page.click('[data-testid="btn-help"]');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
}

export async function driveHitTarget(session: CaptureSession): Promise<void> {
  const page = session.page;
  await waitReady(page);
  await session.showChapter('Inspect tiny menu');
  await session.emitElementCue(
    'editorial.hit-target',
    '[data-testid="btn-row-menu"]',
    { label: 'Row menu 8×8' },
  );
  await session.emitElementCue(
    'editorial.hit-target',
    '[data-testid="btn-filter-chip"]',
    { label: 'Filter chip 8×8' },
  );
  await session.emitElementCue(
    'editorial.zoom',
    '[data-testid="btn-row-menu"]',
    {
      magnification: 2.5,
    },
  );
  await page.click('[data-testid="btn-row-menu"]').catch(() => undefined);
  await page.waitForTimeout(400);
}

export async function drivePopup(session: CaptureSession): Promise<void> {
  const page = session.page;
  await waitReady(page);
  await session.showChapter('Open invoice popup');
  const popupPromise = page.context().waitForEvent('page');
  await page.click('[data-testid="btn-invoice"]');
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  session.markFocusedPage(popup);
  await session.emitEditorialCut('invoice-popup');
  await popup.waitForTimeout(500);
  await popup.close();
}

export async function driveRedaction(session: CaptureSession): Promise<void> {
  const page = session.page;
  await waitReady(page);
  await session.showChapter('Focus PII field');
  await page.click('[data-testid="input-email"]');
  await page.keyboard.type('secret');
  await session.showChapter('Focus Tax ID');
  await page.click('[data-testid="input-ssn"]');
  await page.keyboard.type('x');
  await page.waitForTimeout(300);
}

export async function driveDemo(session: CaptureSession): Promise<void> {
  const page = session.page;
  await waitReady(page);
  await session.showChapter('Happy path export');
  await page.click('[data-testid="chk-terms"]');
  await page.click('[data-testid="btn-actions"]');
  await page.click('[data-testid="btn-export"]');
  await page.click('[data-testid="btn-export-csv"]');
  await page.click('[data-testid="btn-save"]');
  await page.waitForTimeout(400);
}

export async function driveGeometry(session: CaptureSession): Promise<void> {
  const page = session.page;
  await waitReady(page);
  await session.showChapter('Inspect Save alignment', 'save-step');
  const save = page.locator('[data-testid="btn-save"]');
  await save.scrollIntoViewIfNeeded();
  await session.captureAnchor(page, 'btn-save', 'before');
  await session.emitElementCue('editorial.zoom', '[data-testid="btn-save"]', {
    magnification: 2.5,
  });
  await page.waitForTimeout(600);
  await session.captureAnchor(page, 'btn-save', 'after');
}

export async function driveContrast(session: CaptureSession): Promise<void> {
  const page = session.page;
  await waitReady(page);
  await session.showChapter('Inspect price contrast');
  await page.locator('[data-testid="price-alpha"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
}

export async function driveMultiShape(
  session: CaptureSession,
  bug: BugWorkItem,
): Promise<void> {
  const page = session.page;
  await waitReady(page);
  await session.showChapter('Multi annotation targets');
  for (const hint of bug['Custom.AnnotationHints']) {
    const sel = `[data-testid="${hint.target}"]`;
    await page
      .locator(sel)
      .scrollIntoViewIfNeeded()
      .catch(() => undefined);
  }
  await page.click(testId(bug, 'terms'));
  await page.click(testId(bug, 'actions'));
  await page.click(testId(bug, 'export'));
  await page.waitForTimeout(500);
}
