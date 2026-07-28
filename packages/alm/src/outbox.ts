import { canonicalJson, sha256 } from '@repro/core';

export type OutboxStatus = 'pending' | 'sent' | 'failed';

export interface OutboxKeyInput {
  readonly destination: string;
  readonly issue: string;
  readonly digest: string;
  readonly role: string;
}

export interface OutboxItem extends OutboxKeyInput {
  readonly idempotencyKey: string;
  readonly status: OutboxStatus;
  readonly attempts: number;
  readonly createdAtEpoch: number;
  readonly updatedAtEpoch: number;
  readonly lastError?: string;
}

export interface EnqueueOutboxInput extends OutboxKeyInput {
  readonly nowEpoch?: number;
}

export class InMemoryOutbox {
  readonly #items = new Map<string, OutboxItem>();

  enqueue(input: EnqueueOutboxInput): OutboxItem {
    const key = outboxIdempotencyKey(input);
    const current = this.#items.get(key);

    if (current !== undefined) {
      return current;
    }

    const now = input.nowEpoch ?? Date.now();
    const item: OutboxItem = {
      attempts: 0,
      createdAtEpoch: now,
      destination: input.destination,
      digest: input.digest,
      idempotencyKey: key,
      issue: input.issue,
      role: input.role,
      status: 'pending',
      updatedAtEpoch: now,
    };

    this.#items.set(key, item);
    return item;
  }

  markSent(key: string, nowEpoch = Date.now()): OutboxItem {
    return this.#update(key, { status: 'sent', updatedAtEpoch: nowEpoch });
  }

  markFailed(input: {
    readonly key: string;
    readonly error: string;
    readonly nowEpoch?: number;
  }): OutboxItem {
    const current = this.#required(input.key);
    const next: OutboxItem = {
      ...current,
      attempts: current.attempts + 1,
      lastError: input.error,
      status: 'failed',
      updatedAtEpoch: input.nowEpoch ?? Date.now(),
    };

    this.#items.set(input.key, next);
    return next;
  }

  pending(): readonly OutboxItem[] {
    return [...this.#items.values()].filter(
      (item) => item.status === 'pending',
    );
  }

  get(key: string): OutboxItem | null {
    return this.#items.get(key) ?? null;
  }

  #update(
    key: string,
    patch: Pick<OutboxItem, 'status' | 'updatedAtEpoch'>,
  ): OutboxItem {
    const next = { ...this.#required(key), ...patch };
    this.#items.set(key, next);

    return next;
  }

  #required(key: string): OutboxItem {
    const current = this.#items.get(key);

    if (current === undefined) {
      throw new Error(`outbox item ${key} was not found`);
    }

    return current;
  }
}

export function outboxIdempotencyKey(input: OutboxKeyInput): string {
  return sha256(
    canonicalJson({
      destination: input.destination,
      digest: input.digest,
      issue: input.issue,
      role: input.role,
    }),
  );
}
