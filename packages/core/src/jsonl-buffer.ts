import { dirname } from 'node:path';
import { mkdir, open } from 'node:fs/promises';

import type { FileHandle } from 'node:fs/promises';

export interface JsonlBufferOptions {
  readonly path: string;
  readonly flushIntervalMs?: number;
}

export class JsonlBuffer {
  readonly #flushIntervalMs: number;
  readonly #path: string;
  #buffer: string[] = [];
  #closed = false;
  #file: FileHandle | undefined;
  #flushPromise: Promise<void> | undefined;
  #timer: ReturnType<typeof setTimeout> | undefined;

  constructor(options: JsonlBufferOptions) {
    this.#path = options.path;
    this.#flushIntervalMs = options.flushIntervalMs ?? 200;
  }

  append(record: unknown): void {
    if (this.#closed) {
      throw new Error('Cannot append to a closed JSONL buffer');
    }

    this.#buffer.push(`${JSON.stringify(record)}\n`);
    this.#scheduleFlush();
  }

  async flush(): Promise<void> {
    if (this.#flushPromise !== undefined) {
      return this.#flushPromise;
    }

    this.#flushPromise = this.#drain();
    await this.#flushPromise;
    this.#flushPromise = undefined;
  }

  async close(): Promise<void> {
    this.#closed = true;
    this.#clearTimer();
    await this.flush();
    await this.#file?.close();
    this.#file = undefined;
  }

  async #drain(): Promise<void> {
    const file = await this.#getFile();
    while (this.#buffer.length > 0) {
      const chunk = this.#buffer.splice(0).join('');
      await file.write(chunk);
      await file.sync();
    }
  }

  async #getFile(): Promise<FileHandle> {
    if (this.#file !== undefined) {
      return this.#file;
    }

    await mkdir(dirname(this.#path), { recursive: true });
    this.#file = await open(this.#path, 'a');
    return this.#file;
  }

  #scheduleFlush(): void {
    if (this.#timer !== undefined) {
      return;
    }

    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      void this.flush();
    }, this.#flushIntervalMs);
  }

  #clearTimer(): void {
    if (this.#timer === undefined) {
      return;
    }

    clearTimeout(this.#timer);
    this.#timer = undefined;
  }
}
