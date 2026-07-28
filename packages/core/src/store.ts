import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';

import { hashChain } from './hash.js';
import {
  EventRecordSchema,
  FrameRecordSchema,
  ReproConfigSchema,
  StageNameSchema,
} from './schema.js';

import type { HashInput } from './hash.js';
import type {
  EventRecord,
  FrameRecord,
  ReproConfig,
  StageName,
} from './schema.js';

export interface ReproStoreOptions {
  readonly path?: string;
}

export type AppendEventInput = Omit<EventRecord, 'hash' | 'prevHash'> & {
  readonly prevHash?: string;
};

export interface CreateRunInput {
  readonly id?: string;
  readonly config: ReproConfig;
  readonly createdAtEpoch?: number;
}

export interface MarkStageInput {
  readonly runId: string;
  readonly name: StageName;
  readonly status: 'pending' | 'running' | 'complete' | 'failed';
  readonly cacheKey?: string;
  readonly manifestPath?: string;
  readonly completedAtEpoch?: number;
}

export interface StageRecord extends MarkStageInput {
  readonly updatedAtEpoch: number;
}

export interface ExportJsonlInput {
  readonly runId: string;
  readonly path?: string;
}

export class ReproStore {
  readonly #db: Database.Database;

  constructor(options: ReproStoreOptions = {}) {
    this.#db = new Database(options.path ?? ':memory:');
    this.#configure();
    this.#migrate();
  }

  createRun(input: CreateRunInput): string {
    const id = input.id ?? randomUUID();
    const config = ReproConfigSchema.parse(input.config);
    const createdAtEpoch = input.createdAtEpoch ?? Date.now();

    this.#db
      .prepare(
        `INSERT INTO runs (id, mode, config_json, created_at_epoch)
         VALUES (@id, @mode, @configJson, @createdAtEpoch)`,
      )
      .run({
        id,
        mode: config.mode,
        configJson: JSON.stringify(config),
        createdAtEpoch,
      });

    return id;
  }

  appendEvent(input: AppendEventInput): EventRecord {
    const prevHash = input.prevHash ?? this.#latestHash(input);
    const hash = hashChain(prevHash, eventChainPayload(input));
    const event = parseEvent(input, prevHash, hash);

    this.#db
      .prepare(
        `INSERT INTO events
         (id, seq, schema_version, run_id, page_id, t_mono, t_epoch, kind,
          payload_json, prev_hash, hash)
         VALUES
         (@id, @seq, @schemaVersion, @runId, @pageId, @tMono, @tEpoch, @kind,
          @payloadJson, @prevHash, @hash)`,
      )
      .run(toEventRow(event));

    return event;
  }

  appendFrame(input: FrameRecord): void {
    const frame = FrameRecordSchema.parse(input);

    this.#db
      .prepare(
        `INSERT INTO frames
         (run_id, page_id, seq, source_ts, t_mono, width, height, path,
          dropped_count)
         VALUES
         (@runId, @pageId, @seq, @sourceTs, @tMono, @width, @height, @path,
          @droppedCount)`,
      )
      .run(toFrameRow(frame));
  }

  markStage(input: MarkStageInput): void {
    StageNameSchema.parse(input.name);
    const updatedAtEpoch = Date.now();

    this.#db
      .prepare(
        `INSERT INTO stages
         (run_id, name, status, cache_key, manifest_path, completed_at_epoch,
          updated_at_epoch)
         VALUES
         (@runId, @name, @status, @cacheKey, @manifestPath,
          @completedAtEpoch, @updatedAtEpoch)
         ON CONFLICT (run_id, name) DO UPDATE SET
          status = excluded.status,
          cache_key = excluded.cache_key,
          manifest_path = excluded.manifest_path,
          completed_at_epoch = excluded.completed_at_epoch,
          updated_at_epoch = excluded.updated_at_epoch`,
      )
      .run(toStageRow(input, updatedAtEpoch));
  }

  getStage(input: { readonly runId: string; readonly name: StageName }):
    | StageRecord
    | null {
    const row = this.#db
      .prepare(
        `SELECT run_id, name, status, cache_key, manifest_path,
          completed_at_epoch, updated_at_epoch
         FROM stages
         WHERE run_id = ? AND name = ?`,
      )
      .get(input.runId, input.name) as StageRow | undefined;

    return row === undefined ? null : stageFromRow(row);
  }

  exportJsonl(input: ExportJsonlInput): string {
    const rows = this.#db
      .prepare(
        `SELECT id, seq, schema_version, run_id, page_id, t_mono, t_epoch,
          kind, payload_json, prev_hash, hash
         FROM events
         WHERE run_id = ?
         ORDER BY seq ASC, id ASC`,
      )
      .all(input.runId) as EventRow[];
    const jsonl = rows.map(eventLineFromRow).join('');

    if (input.path !== undefined) {
      writeFileSync(input.path, jsonl);
    }

    return jsonl;
  }

  close(): void {
    this.#db.close();
  }

  #configure(): void {
    this.#db.pragma('journal_mode = WAL');
    this.#db.pragma('foreign_keys = ON');
  }

  #migrate(): void {
    this.#db.exec(`${SCHEMA_SQL.join(';\n')};`);
  }

  #latestHash(input: { readonly runId: string; readonly pageId: string }):
    | string
    | null {
    const row = this.#db
      .prepare(
        `SELECT hash FROM events
         WHERE run_id = ? AND page_id = ?
         ORDER BY seq DESC
         LIMIT 1`,
      )
      .get(input.runId, input.pageId) as HashRow | undefined;

    return row?.hash ?? null;
  }
}

const SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    mode TEXT NOT NULL,
    config_json TEXT NOT NULL CHECK (json_valid(config_json)),
    created_at_epoch REAL NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    seq INTEGER NOT NULL,
    schema_version INTEGER NOT NULL,
    run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    page_id TEXT NOT NULL,
    t_mono REAL NOT NULL,
    t_epoch REAL,
    kind TEXT NOT NULL,
    payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
    payload_type TEXT GENERATED ALWAYS AS
      (json_extract(payload_json, '$.type')) VIRTUAL,
    prev_hash TEXT,
    hash TEXT NOT NULL,
    UNIQUE (run_id, page_id, seq)
  )`,
  `CREATE INDEX IF NOT EXISTS events_run_seq_idx
    ON events(run_id, seq)`,
  `CREATE INDEX IF NOT EXISTS events_kind_idx
    ON events(kind)`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(
    kind,
    payload_json,
    content='events',
    content_rowid='rowid'
  )`,
  `CREATE TRIGGER IF NOT EXISTS events_ai
    AFTER INSERT ON events BEGIN
      INSERT INTO events_fts(rowid, kind, payload_json)
      VALUES (new.rowid, new.kind, new.payload_json);
    END`,
  `CREATE TRIGGER IF NOT EXISTS events_ad
    AFTER DELETE ON events BEGIN
      INSERT INTO events_fts(events_fts, rowid, kind, payload_json)
      VALUES ('delete', old.rowid, old.kind, old.payload_json);
    END`,
  `CREATE TABLE IF NOT EXISTS frames (
    run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    page_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    source_ts REAL NOT NULL,
    t_mono REAL NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    path TEXT NOT NULL,
    dropped_count INTEGER NOT NULL,
    PRIMARY KEY (run_id, page_id, seq)
  )`,
  `CREATE TABLE IF NOT EXISTS stages (
    run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    status TEXT NOT NULL,
    cache_key TEXT,
    manifest_path TEXT,
    completed_at_epoch REAL,
    updated_at_epoch REAL NOT NULL,
    PRIMARY KEY (run_id, name)
  )`,
  `CREATE TABLE IF NOT EXISTS artifacts (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    stage TEXT NOT NULL,
    path TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    metadata_json TEXT NOT NULL CHECK (json_valid(metadata_json))
  )`,
  `CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL CHECK (json_valid(value_json))
  )`,
];

interface HashRow {
  readonly hash: string;
}

interface EventRow {
  readonly id: string;
  readonly seq: number;
  readonly schema_version: number;
  readonly run_id: string;
  readonly page_id: string;
  readonly t_mono: number;
  readonly t_epoch: number | null;
  readonly kind: string;
  readonly payload_json: string;
  readonly prev_hash: string | null;
  readonly hash: string;
}

interface StageRow {
  readonly run_id: string;
  readonly name: StageName;
  readonly status: StageRecord['status'];
  readonly cache_key: string | null;
  readonly manifest_path: string | null;
  readonly completed_at_epoch: number | null;
  readonly updated_at_epoch: number;
}

function eventChainPayload(input: AppendEventInput): HashInput {
  return {
    id: input.id,
    kind: input.kind,
    pageId: input.pageId,
    payload: input.payload,
    runId: input.runId,
    schemaVersion: input.schemaVersion,
    seq: input.seq,
    t_epoch: input.t_epoch,
    t_mono: input.t_mono,
  };
}

function parseEvent(
  input: AppendEventInput,
  prevHash: string | null,
  hash: string,
): EventRecord {
  return EventRecordSchema.parse({
    ...input,
    ...(prevHash === null ? {} : { prevHash }),
    hash,
  });
}

function toEventRow(event: EventRecord): Record<string, unknown> {
  return {
    id: event.id,
    seq: event.seq,
    schemaVersion: event.schemaVersion,
    runId: event.runId,
    pageId: event.pageId,
    tMono: event.t_mono,
    tEpoch: event.t_epoch ?? null,
    kind: event.kind,
    payloadJson: JSON.stringify(event.payload),
    prevHash: event.prevHash ?? null,
    hash: event.hash,
  };
}

function toFrameRow(frame: FrameRecord): Record<string, unknown> {
  return {
    runId: frame.runId,
    pageId: frame.pageId,
    seq: frame.seq,
    sourceTs: frame.sourceTs,
    tMono: frame.t_mono,
    width: frame.width,
    height: frame.height,
    path: frame.path,
    droppedCount: frame.droppedCount,
  };
}

function toStageRow(
  stage: MarkStageInput,
  updatedAtEpoch: number,
): Record<string, unknown> {
  return {
    runId: stage.runId,
    name: stage.name,
    status: stage.status,
    cacheKey: stage.cacheKey ?? null,
    manifestPath: stage.manifestPath ?? null,
    completedAtEpoch: stage.completedAtEpoch ?? null,
    updatedAtEpoch,
  };
}

function eventLineFromRow(row: EventRow): string {
  const event = EventRecordSchema.parse({
    id: row.id,
    seq: row.seq,
    schemaVersion: row.schema_version,
    runId: row.run_id,
    pageId: row.page_id,
    t_mono: row.t_mono,
    ...(row.t_epoch === null ? {} : { t_epoch: row.t_epoch }),
    kind: row.kind,
    payload: parseJson(row.payload_json),
    ...(row.prev_hash === null ? {} : { prevHash: row.prev_hash }),
    hash: row.hash,
  });

  return `${JSON.stringify(event)}\n`;
}

function parseJson(text: string): unknown {
  return JSON.parse(text) as unknown;
}

function stageFromRow(row: StageRow): StageRecord {
  return {
    runId: row.run_id,
    name: row.name,
    status: row.status,
    ...(row.cache_key === null ? {} : { cacheKey: row.cache_key }),
    ...(row.manifest_path === null ? {} : { manifestPath: row.manifest_path }),
    ...(row.completed_at_epoch === null
      ? {}
      : { completedAtEpoch: row.completed_at_epoch }),
    updatedAtEpoch: row.updated_at_epoch,
  };
}
