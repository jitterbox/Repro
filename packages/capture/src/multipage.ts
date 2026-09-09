import type { BrowserContext, Page } from 'playwright';

import type { CaptureEventSink } from './events.js';

export type EditorialCutPriority = 'action-owning' | 'focused' | 'primary';
export type PageRole = 'page' | 'popup' | 'primary';

export interface PageRegistration {
  readonly page: Page;
  readonly pageId: string;
  readonly role: PageRole;
}

export interface EditorialCut {
  readonly pageId: string;
  readonly priority: EditorialCutPriority;
  readonly reason: string;
}

export interface MultiPageTrackerOptions {
  readonly context: BrowserContext;
  readonly onPage?: (registration: PageRegistration) => Promise<void> | void;
  readonly primaryPage: Page;
  readonly sink: CaptureEventSink;
}

export class MultiPageTracker {
  readonly #context: BrowserContext;
  readonly #ids = new WeakMap<Page, string>();
  readonly #onContextPage: (page: Page) => void;
  readonly #onPage:
    ((registration: PageRegistration) => Promise<void> | void) | undefined;
  readonly #pages = new Map<string, PageRegistration>();
  readonly #primaryPage: Page;
  readonly #sink: CaptureEventSink;
  #actionOwningId: string | undefined;
  #counter = 0;
  readonly #pending = new Set<Promise<void>>();
  readonly #errors: unknown[] = [];
  #focusedId: string | undefined;
  #primaryId: string | undefined;

  constructor(options: MultiPageTrackerOptions) {
    this.#context = options.context;
    this.#onPage = options.onPage;
    this.#primaryPage = options.primaryPage;
    this.#sink = options.sink;
    this.#onContextPage = (page) => {
      this.registerPage(page, 'page');
    };
  }

  start(): void {
    this.registerPage(this.#primaryPage, 'primary');

    for (const page of this.#context.pages()) {
      this.registerPage(page, page === this.#primaryPage ? 'primary' : 'page');
    }

    this.#context.on('page', this.#onContextPage);
  }

  async ready(): Promise<void> {
    while (this.#pending.size) await Promise.all(this.#pending);
    if (this.#errors.length)
      throw new AggregateError(
        this.#errors,
        'Page capture registration failed',
      );
  }

  stop(): void {
    this.#context.off('page', this.#onContextPage);
  }

  pages(): readonly PageRegistration[] {
    return [...this.#pages.values()];
  }

  pageIdFor(page: Page): string {
    return this.registerPage(page, 'page').pageId;
  }

  registerPage(page: Page, role: PageRole): PageRegistration {
    const existingId = this.#ids.get(page);

    if (existingId !== undefined) {
      return this.#pages.get(existingId) ?? this.#newRegistration(page, role);
    }

    return this.#newRegistration(page, role);
  }

  markActionOwningPage(page: Page): void {
    this.#actionOwningId = this.pageIdFor(page);
  }

  markFocusedPage(page: Page): void {
    this.#focusedId = this.pageIdFor(page);
  }

  clearActionOwningPage(): void {
    this.#actionOwningId = undefined;
  }

  emitEditorialCut(reason: string): EditorialCut {
    const cut = this.#selectCut(reason);

    this.#sink.emitEvent({
      kind: 'editorial.cut',
      pageId: cut.pageId,
      payload: {
        pageId: cut.pageId,
        priority: cut.priority,
        reason: cut.reason,
      },
    });

    return cut;
  }

  #newRegistration(page: Page, role: PageRole): PageRegistration {
    const pageId = `page-${String(++this.#counter)}`;
    const registration = { page, pageId, role };

    this.#ids.set(page, pageId);
    this.#pages.set(pageId, registration);
    this.#primaryId ??= pageId;

    if (role === 'primary') {
      this.#primaryId = pageId;
    }

    this.#wirePage(page, pageId);
    this.#emitPageOpen(registration);
    this.#notifyPage(registration);
    return registration;
  }

  #wirePage(page: Page, pageId: string): void {
    page.on('popup', (popup) => {
      this.registerPage(popup, 'popup');
    });
    page.on('close', () => {
      this.#pages.delete(pageId);
    });
  }

  #emitPageOpen(registration: PageRegistration): void {
    this.#sink.emitEvent({
      kind: 'page.open',
      pageId: registration.pageId,
      payload: {
        role: registration.role,
        url: registration.page.url(),
      },
    });
  }

  #notifyPage(registration: PageRegistration): void {
    if (this.#onPage === undefined) {
      return;
    }

    const pending = Promise.resolve()
      .then(() => this.#onPage?.(registration))
      .catch((error: unknown) => {
        this.#errors.push(error);
        this.#sink.emitEvent({
          kind: 'capture.pageRegistrationError',
          pageId: registration.pageId,
          payload: { message: errorMessage(error) },
        });
      })
      .finally(() => this.#pending.delete(pending));
    this.#pending.add(pending);
  }

  #selectCut(reason: string): EditorialCut {
    const actionOwning = this.#pageCut(this.#actionOwningId, reason);

    if (actionOwning !== undefined) {
      return { ...actionOwning, priority: 'action-owning' };
    }

    const focused = this.#pageCut(this.#focusedId, reason);
    if (focused !== undefined) {
      return { ...focused, priority: 'focused' };
    }

    return {
      pageId: this.#primaryId ?? this.pageIdFor(this.#primaryPage),
      priority: 'primary',
      reason,
    };
  }

  #pageCut(
    pageId: string | undefined,
    reason: string,
  ): Omit<EditorialCut, 'priority'> | undefined {
    if (pageId === undefined || !this.#pages.has(pageId)) {
      return undefined;
    }

    return { pageId, reason };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
