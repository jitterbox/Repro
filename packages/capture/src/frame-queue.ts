export type FrameDropPolicy = 'drop-newest' | 'drop-oldest';

export interface FrameQueueOptions {
  readonly capacity: number;
  readonly dropPolicy?: FrameDropPolicy;
}

export interface FrameQueuePushResult {
  readonly accepted: boolean;
  readonly droppedCount: number;
}

export class FrameQueue<T> {
  readonly #capacity: number;
  readonly #dropPolicy: FrameDropPolicy;
  readonly #items: T[] = [];
  #droppedCount = 0;

  constructor(options: FrameQueueOptions) {
    if (!Number.isInteger(options.capacity) || options.capacity < 1) {
      throw new Error('Frame queue capacity must be a positive integer');
    }

    this.#capacity = options.capacity;
    this.#dropPolicy = options.dropPolicy ?? 'drop-oldest';
  }

  get capacity(): number {
    return this.#capacity;
  }

  get droppedCount(): number {
    return this.#droppedCount;
  }

  get size(): number {
    return this.#items.length;
  }

  push(item: T): FrameQueuePushResult {
    if (this.#items.length < this.#capacity) {
      this.#items.push(item);
      return this.#result(true);
    }

    this.#droppedCount += 1;

    if (this.#dropPolicy === 'drop-newest') {
      return this.#result(false);
    }

    this.#items.shift();
    this.#items.push(item);
    return this.#result(true);
  }

  shift(): T | undefined {
    return this.#items.shift();
  }

  drain(): T[] {
    return this.#items.splice(0, this.#items.length);
  }

  #result(accepted: boolean): FrameQueuePushResult {
    return { accepted, droppedCount: this.#droppedCount };
  }
}
