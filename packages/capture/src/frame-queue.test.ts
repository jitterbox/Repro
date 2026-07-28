import { describe, expect, it } from 'vitest';

import { FrameQueue } from './frame-queue.js';

describe('FrameQueue', () => {
  it('drops the oldest frame when capacity is exceeded', () => {
    const queue = new FrameQueue<number>({ capacity: 2 });

    queue.push(1);
    queue.push(2);
    const result = queue.push(3);

    expect(result).toEqual({ accepted: true, droppedCount: 1 });
    expect(queue.drain()).toEqual([2, 3]);
    expect(queue.droppedCount).toBe(1);
  });

  it('can reject the newest frame', () => {
    const queue = new FrameQueue<number>({
      capacity: 1,
      dropPolicy: 'drop-newest',
    });

    queue.push(1);
    const result = queue.push(2);

    expect(result).toEqual({ accepted: false, droppedCount: 1 });
    expect(queue.shift()).toBe(1);
  });

  it('requires a positive integer capacity', () => {
    expect(() => new FrameQueue({ capacity: 0 })).toThrow(
      'Frame queue capacity',
    );
  });
});
