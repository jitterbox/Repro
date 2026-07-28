import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { MonotonicClockBridge, ReproStore, Viewport } from '@repro/core';
import type { CDPSession, Page } from 'playwright';

import { FrameQueue } from './frame-queue.js';
import { assertJpegDimensions } from './jpeg-dims.js';

export interface ScreencastOptions {
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
}

export interface PageScreencast {
  readonly directory: string;
  readonly droppedCount: number;
  readonly pageId: string;
  readonly timestampTablePath: string;
  stop(): Promise<void>;
}

interface RawScreencastFrame {
  readonly data: Buffer;
  readonly sourceTs: number;
}

interface ExperimentalScreencastHandle {
  readonly stop?: () => Promise<void>;
}

interface ExperimentalScreencast {
  start(options: {
    readonly onFrame: (frame: unknown) => void;
  }): Promise<ExperimentalScreencastHandle | undefined>;
  stop?: () => Promise<void>;
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
  #stopCapture: (() => Promise<void>) | undefined;
  #stopped = false;

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
    return this.#queue.droppedCount;
  }

  get pageId(): string {
    return this.#options.pageId;
  }

  get timestampTablePath(): string {
    return join(this.#options.directory, 'timestamps.json');
  }

  async start(): Promise<void> {
    await mkdir(this.#options.directory, { recursive: true });

    this.#stopCapture =
      (await this.#startNativeScreencast()) ?? (await this.#startCdp());
  }

  async stop(): Promise<void> {
    this.#stopped = true;
    await this.#stopCapture?.();
    await this.#drainPromise;
    await this.#writeTimestampTable();
  }

  async #startNativeScreencast(): Promise<(() => Promise<void>) | undefined> {
    const screencast = nativeScreencastFrom(this.#options.page);

    if (screencast?.start === undefined) {
      return undefined;
    }

    const handle = await screencast.start({
      onFrame: (frame) => {
        this.#enqueueFrame(nativeFrameFrom(frame, this.#options.clock));
      },
    });

    return async () => {
      await handle?.stop?.();
      await screencast.stop?.();
    };
  }

  async #startCdp(): Promise<() => Promise<void>> {
    const client = await this.#options.page.context().newCDPSession(
      this.#options.page,
    );
    const onFrame = (params: unknown): void => {
      void this.#handleCdpFrame(client, params);
    };

    client.on('Page.screencastFrame', onFrame);
    await client.send('Page.startScreencast', cdpStartOptions(this.#options));

    return async () => {
      client.off('Page.screencastFrame', onFrame);
      await client.send('Page.stopScreencast').catch(() => undefined);
      await client.detach().catch(() => undefined);
    };
  }

  async #acknowledgeFrame(
    client: CDPSession,
    params: unknown,
  ): Promise<void> {
    const frame = asCdpFrame(params);
    await client.send('Page.screencastFrameAck', {
      sessionId: frame.sessionId,
    });
  }

  async #handleCdpFrame(
    client: CDPSession,
    params: unknown,
  ): Promise<void> {
    await this.#acknowledgeFrame(client, params);
    this.#enqueueFrame(cdpFrameFrom(params, this.#options.clock));
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

    this.#drainPromise = this.#drainQueue().finally(() => {
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

    assertJpegDimensions(frame.data, this.#options.viewport);
    await writeFile(path, frame.data);
    this.#appendFrame(path, seq, frame.sourceTs);
    this.#seq = seq;
  }

  #appendFrame(path: string, seq: number, sourceTs: number): void {
    this.#options.store.appendFrame({
      droppedCount: this.#queue.droppedCount,
      height: this.#options.viewport.height,
      pageId: this.#options.pageId,
      path,
      runId: this.#options.runId,
      seq,
      sourceTs,
      t_mono: this.#options.clock.nowMono(),
      width: this.#options.viewport.width,
    });
    this.#frames.push({ path, seq, sourceTs });
  }

  async #writeTimestampTable(): Promise<void> {
    await writeFile(
      this.timestampTablePath,
      `${JSON.stringify(this.#frames, null, 2)}\n`,
    );
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

function nativeFrameFrom(
  frame: unknown,
  clock: MonotonicClockBridge,
): RawScreencastFrame {
  const record = recordFrom(frame);
  return {
    data: bufferFrom(record.data ?? record.buffer),
    sourceTs: numberFrom(record.timestamp) ?? clock.nowMono(),
  };
}

function cdpFrameFrom(
  params: unknown,
  clock: MonotonicClockBridge,
): RawScreencastFrame {
  const frame = asCdpFrame(params);
  const timestampMs = frame.metadata?.timestamp;
  return {
    data: Buffer.from(frame.data, 'base64'),
    sourceTs: timestampMs ?? clock.nowMono(),
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

function bufferFrom(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) {
    return value;
  }

  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }

  if (typeof value === 'string') {
    return Buffer.from(value, 'base64');
  }

  throw new Error('Invalid screencast frame data');
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

function nativeScreencastFrom(page: Page): ExperimentalScreencast | undefined {
  const record = page as unknown as Record<string, unknown>;
  const screencast = record.screencast;

  if (!screencast || typeof screencast !== 'object') {
    return undefined;
  }

  const candidate = screencast as Partial<ExperimentalScreencast>;
  return typeof candidate.start === 'function'
    ? (candidate as ExperimentalScreencast)
    : undefined;
}
