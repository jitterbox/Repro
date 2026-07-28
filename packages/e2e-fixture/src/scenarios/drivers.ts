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
  await page.click('[data-testid="btn-export"]');
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
  await page.waitForTimeout(900);
  await session.showChapter('Recalculate freeze');
  await page.click('[data-testid="btn-recalculate"]');
  await page.waitForTimeout(400);
}

export async function driveCls(session: CaptureSession): Promise<void> {
  const page = session.page;
  await waitReady(page);
  await session.showChapter('Wait for promo CLS');
  await page.waitForSelector('[data-testid="promo-banner"]', {
    timeout: 3_000,
  });
  await page.waitForTimeout(600);
}

export async function driveHoverHidden(session: CaptureSession): Promise<void> {
  const page = session.page;
  await waitReady(page);
  await session.showChapter('Reveal advanced pricing');
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

export async function driveA11y(session: CaptureSession): Promise<void> {
  const page = session.page;
  await waitReady(page);
  await session.showChapter('Tiny hit target');
  await page.click('[data-testid="btn-row-menu"]').catch(() => undefined);
  await session.showChapter('Keyboard trap');
  await page.click('[data-testid="btn-help"]');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
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
  session.emitEditorialCut('invoice-popup');
  await popup.waitForTimeout(500);
  await popup.close();
}

export async function driveRedaction(session: CaptureSession): Promise<void> {
  const page = session.page;
  await waitReady(page);
  await session.showChapter('Focus PII field');
  await page.click('[data-testid="input-email"]');
  await page.keyboard.type('secret');
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
  await session.showChapter('Inspect Save alignment');
  await page.locator('[data-testid="btn-save"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
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
    await page.locator(sel).scrollIntoViewIfNeeded().catch(() => undefined);
  }
  await page.click(testId(bug, 'terms'));
  await page.click(testId(bug, 'actions'));
  await page.click(testId(bug, 'export'));
  await page.waitForTimeout(500);
}
