import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { MonotonicClockBridge, ReproStore, Viewport } from '@jitterbox/repro-core';
import type { CDPSession, Page } from 'playwright';

import { FrameQueue } from './frame-queue.js';
import { JpegDimensionsError, assertJpegDimensions } from './jpeg-dims.js';

export interface ScreencastOptions {
  /** Experimental only; production configs retain CDP until acceptance passes. */
  readonly backend?: 'cdp' | 'native';
  readonly clock: MonotonicClockBridge;
  readonly directory: string;
  readonly page: Page;
  readonly pageId: string;
  readonly queueSize?: number;
  readonly runId: string;
  readonly store: ReproStore;
  readonly viewport: Viewport;
}

export interface ScreencastFrameRecord {
  readonly path: string;
  readonly seq: number;
  readonly sourceTs: number;
  readonly timeMs: number;
}

export interface PageScreencast {
  readonly directory: string;
  readonly droppedCount: number;
  readonly pageId: string;
  readonly timestampTablePath: string;
  ready(): Promise<void>;
  stop(): Promise<void>;
}

interface RawScreencastFrame {
  readonly data: Buffer;
  readonly sourceTs: number;
  readonly timeMs: number;
}

interface CdpScreencastFrame {
  readonly data: string;
  readonly metadata?: { readonly timestamp?: number };
  readonly sessionId: number;
}

export async function startPageScreencast(
  options: ScreencastOptions,
): Promise<PageScreencast> {
  const session = new PageScreencastSession(options);
  await session.start();
  return session;
}

class PageScreencastSession implements PageScreencast {
  readonly #frames: ScreencastFrameRecord[] = [];
  readonly #options: ScreencastOptions;
  readonly #queue: FrameQueue<RawScreencastFrame>;
  #drainPromise: Promise<void> | undefined;
  #seq = 0;
  #dimensionErrors = 0;
  readonly #errors: unknown[] = [];
  #stopCapture: (() => Promise<void>) | undefined;
  #stopped = false;
  #resolveFirst: (() => void) | undefined;
  readonly #firstFrame = new Promise<void>((resolve) => {
    this.#resolveFirst = resolve;
  });

  constructor(options: ScreencastOptions) {
    this.#options = options;
    this.#queue = new FrameQueue({
      capacity: options.queueSize ?? 60,
      dropPolicy: 'drop-oldest',
    });
  }

  get directory(): string {
    return this.#options.directory;
  }

  get droppedCount(): number {
    return this.#queue.droppedCount + this.#dimensionErrors;
  }

  get pageId(): string {
    return this.#options.pageId;
  }

  get timestampTablePath(): string {
    return join(this.#options.directory, 'timestamps.json');
  }

  async start(): Promise<void> {
    await mkdir(this.#options.directory, { recursive: true });

    // CDP respects maxWidth/maxHeight; native page.screencast does not
    // reliably match the configured viewport when showActions runs.
    this.#stopCapture =
      this.#options.backend === 'native'
        ? await this.#startNative()
        : await this.#startCdp();
  }

  async ready(): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.#firstFrame,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            reject(new Error(`No initial frame for ${this.pageId}`));
          }, 5000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async stop(): Promise<void> {
    this.#stopped = true;
    await this.#stopCapture?.();
    while (this.#drainPromise !== undefined) await this.#drainPromise;
    await this.#writeTimestampTable();
    if (!this.#frames.length)
      this.#errors.push(new Error('Capture produced no frames'));
    if (this.droppedCount)
      this.#errors.push(
        new Error(
          `Incomplete capture: ${this.droppedCount} dropped or dimension-mismatched frames`,
        ),
      );
    if (this.#errors.length)
      throw new AggregateError(
        this.#errors,
        `Screencast capture incomplete: ${this.#errors
          .slice(0, 8)
          .map((error) => String(error))
          .join('; ')}`,
      );
  }

  async #startNative(): Promise<() => Promise<void>> {
    const screencast = this.#options.page.screencast;
    await screencast.start({
      size: this.#options.viewport,
      quality: 90,
      onFrame: ({ data, timestamp }) => {
        this.#enqueueFrame({
          data,
          sourceTs: timestamp / 1000,
          timeMs: this.#options.clock.fromEpoch(timestamp),
        });
        return Promise.resolve();
      },
    });
    return () => screencast.stop();
  }

  async #startCdp(): Promise<() => Promise<void>> {
    const client = await this.#options.page
      .context()
      .newCDPSession(this.#options.page);
    const onFrame = (params: unknown): void => {
      try {
        this.#enqueueFrame(cdpFrameFrom(params, this.#options.clock));
      } catch (error) {
        this.#errors.push(error);
      }
      void this.#acknowledgeFrame(client, params).catch((error: unknown) => {
        if (!this.#stopped) this.#errors.push(error);
      });
    };

    client.on('Page.screencastFrame', onFrame);
    await client.send('Page.startScreencast', cdpStartOptions(this.#options));

    return async () => {
      client.off('Page.screencastFrame', onFrame);
      await client.send('Page.stopScreencast').catch(() => undefined);
      await client.detach().catch(() => undefined);
    };
  }

  async #acknowledgeFrame(client: CDPSession, params: unknown): Promise<void> {
    const frame = asCdpFrame(params);
    await client.send('Page.screencastFrameAck', {
      sessionId: frame.sessionId,
    });
  }

  #enqueueFrame(frame: RawScreencastFrame): void {
    if (this.#stopped) {
      return;
    }

    this.#queue.push(frame);
    this.#scheduleDrain();
  }

  #scheduleDrain(): void {
    if (this.#drainPromise !== undefined) {
      return;
    }

    this.#drainPromise = this.#drainQueue()
      .catch((error: unknown) => {
        this.#errors.push(error);
      })
      .finally(() => {
        this.#drainPromise = undefined;
        if (this.#queue.size > 0) {
          this.#scheduleDrain();
        }
      });
  }

  async #drainQueue(): Promise<void> {
    let frame = this.#queue.shift();

    while (frame !== undefined) {
      await this.#writeFrame(frame);
      frame = this.#queue.shift();
    }
  }

  async #writeFrame(frame: RawScreencastFrame): Promise<void> {
    const seq = this.#seq + 1;
    const path = join(this.#options.directory, frameName(seq));

    try {
      assertJpegDimensions(frame.data, this.#options.viewport);
    } catch (error) {
      if (error instanceof JpegDimensionsError) {
        this.#dimensionErrors++;
        this.#errors.push(
          new Error(
            `${this.pageId} at ${frame.timeMs.toFixed(3)} ms: ${error.message}`,
          ),
        );
        return;
      }
      throw error;
    }

    await writeFile(path, frame.data);
    this.#appendFrame(path, seq, frame.sourceTs, frame.timeMs);
    this.#seq = seq;
  }

  #appendFrame(
    path: string,
    seq: number,
    sourceTs: number,
    timeMs: number,
  ): void {
    this.#options.store.appendFrame({
      droppedCount: this.#queue.droppedCount,
      height: this.#options.viewport.height,
      pageId: this.#options.pageId,
      path,
      runId: this.#options.runId,
      seq,
      sourceTs,
      t_mono: timeMs,
      width: this.#options.viewport.width,
    });
    this.#frames.push({ path, seq, sourceTs, timeMs });
    this.#resolveFirst?.();
  }

  async #writeTimestampTable(): Promise<void> {
    await writeFile(
      this.timestampTablePath,
      `${JSON.stringify(this.#frames, null, 2)}\n`,
    );
    if (this.#errors.length || this.droppedCount) {
      await writeFile(
        join(this.directory, 'frame-errors.json'),
        JSON.stringify(
          {
            pageId: this.pageId,
            droppedFrames: this.#queue.droppedCount,
            rejectedDimensions: this.#dimensionErrors,
            errors: this.#errors.map((error) => String(error)),
          },
          null,
          2,
        ),
      );
    }
  }
}

function cdpStartOptions(options: ScreencastOptions): Record<string, unknown> {
  return {
    everyNthFrame: 1,
    format: 'jpeg',
    maxHeight: options.viewport.height,
    maxWidth: options.viewport.width,
    quality: 90,
  };
}

function cdpFrameFrom(
  params: unknown,
  clock: MonotonicClockBridge,
): RawScreencastFrame {
  const frame = asCdpFrame(params);
  const timestampMs = frame.metadata?.timestamp;
  if (timestampMs === undefined || !Number.isFinite(timestampMs))
    throw new Error('Screencast frame is missing a valid source timestamp');
  return {
    data: Buffer.from(frame.data, 'base64'),
    sourceTs: timestampMs,
    timeMs: clock.fromEpoch(timestampMs * 1000),
  };
}

function asCdpFrame(params: unknown): CdpScreencastFrame {
  const record = recordFrom(params);
  const data = record.data;
  const sessionId = record.sessionId;

  if (typeof data !== 'string' || typeof sessionId !== 'number') {
    throw new Error('Invalid CDP screencast frame');
  }

  return {
    data,
    sessionId,
    ...metadataProperty(record.metadata),
  };
}

function metadataProperty(
  value: unknown,
): Pick<CdpScreencastFrame, 'metadata'> | Record<string, never> {
  if (value === undefined) {
    return {};
  }

  const record = recordFrom(value);
  const timestamp = numberFrom(record.timestamp);
  return { metadata: timestamp === undefined ? {} : { timestamp } };
}

function numberFrom(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function recordFrom(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    throw new Error('Expected an object');
  }

  return value as Record<string, unknown>;
}

function frameName(seq: number): string {
  return `frame-${String(seq).padStart(6, '0')}.jpg`;
}
