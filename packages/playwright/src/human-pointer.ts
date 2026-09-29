import type { Locator, Page } from '@playwright/test';

/** A committed, repeatable approach curve. These positions are actually dispatched
 * to the browser and recorded; the renderer never invents a mouse trajectory. */
export function humanApproach(
  from: { x: number; y: number },
  to: { x: number; y: number },
  count = 32,
) {
  const dx = to.x - from.x,
    dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const bend = Math.min(36, length * 0.12);
  return Array.from({ length: count }, (_, i) => {
    const u = (i + 1) / count;
    const t = u * u * (3 - 2 * u);
    const arc = Math.sin(Math.PI * t) * bend;
    return {
      x: from.x + dx * t - (dy / length) * arc,
      y: from.y + dy * t + (dx / length) * arc,
    };
  });
}

/** Use one controller per page and route all mouse movement through it. */
export function humanPointer(page: Page) {
  let position = { x: 0, y: 0 };
  async function move(x: number, y: number, durationMs = 640) {
    const target = { x, y };
    if (Math.hypot(x - position.x, y - position.y) < 1) return;
    const count = Math.max(2, Math.ceil(durationMs / 20));
    for (const point of humanApproach(position, target, count)) {
      await page.mouse.move(point.x, point.y);
      await page.waitForTimeout(durationMs / count);
    }
    position = target;
  }
  async function approach(locator: Locator) {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    if (!box) throw new Error('Human pointer target is not visible');
    await move(box.x + box.width / 2, box.y + box.height / 2);
  }
  async function click(
    locator: Locator,
    options: {
      button?: 'left' | 'right';
      force?: boolean;
      double?: boolean;
    } = {},
  ) {
    await approach(locator);
    if (options.double) await locator.dblclick({ delay: 85 });
    else
      await locator.click({
        button: options.button ?? 'left',
        force: options.force ?? false,
        delay: 85,
      });
  }
  return { move, approach, click };
}
