import type {
  Page,
  ConsoleMessage,
  Request,
  Response,
  Frame,
} from 'playwright';
import type { CaptureEventSink } from './events.js';

/** Passive public Playwright events; no debugger, extra network calls or response bodies. */
export function startBrowserDiagnostics(
  page: Page,
  pageId: string,
  sink: CaptureEventSink,
) {
  let sequence = 0;
  const requests = new WeakMap<Request, string>();
  const requestId = (request: Request) => {
    let id = requests.get(request);
    if (!id) {
      id = `${pageId}-request-${++sequence}`;
      requests.set(request, id);
    }
    return id;
  };
  const emit = (
    kind: string,
    payload: Record<string, string | number | null>,
  ) => {
    sink.emitEvent({
      pageId,
      kind,
      payload: {
        ...payload,
        source: 'playwright',
        timing: 'host-receipt',
        uncertaintyMs: null,
      },
    });
  };
  const requestData = (request: Request) => ({
    requestId: requestId(request),
    url: diagnosticUrl(request.url()),
    method: request.method(),
    resourceType: request.resourceType(),
  });
  const consoleMessage = (message: ConsoleMessage) => {
    emit('browser.console', {
      level: message.type(),
      message: message.text().slice(0, 4000),
      url: diagnosticUrl(message.location().url),
      line: message.location().lineNumber,
    });
  };
  const pageError = (error: Error) => {
    emit('browser.exception', {
      level: 'error',
      message: error.message.slice(0, 4000),
    });
  };
  const requested = (request: Request) => {
    emit('browser.request', requestData(request));
  };
  const failed = (request: Request) => {
    emit('browser.request-failure', {
      ...requestData(request),
      message: request.failure()?.errorText ?? 'Request failed',
    });
  };
  const response = (response: Response) => {
    emit('browser.response', {
      ...requestData(response.request()),
      status: response.status(),
    });
    if (response.status() >= 400)
      emit('browser.http-error', {
        ...requestData(response.request()),
        status: response.status(),
        message: `HTTP ${response.status()}`,
      });
  };
  const frames = new WeakMap<Frame, string>();
  let frameCount = 0;
  const frameEvent = (phase: string) => (frame: Frame) => {
    let frameId = frames.get(frame);
    if (!frameId) {
      frameId = `${pageId}-frame-${++frameCount}`;
      frames.set(frame, frameId);
    }
    emit('browser.frame', {
      phase,
      frameId,
      url: diagnosticUrl(frame.url()),
      name: frame.name(),
      main: frame.parentFrame() === null ? 1 : 0,
    });
  };
  const attached = frameEvent('attached'),
    navigated = frameEvent('navigated'),
    detached = frameEvent('detached');
  const loaded = () => {
    emit('browser.lifecycle', {
      phase: 'load',
      url: diagnosticUrl(page.url()),
    });
  };
  const finished = (request: Request) => {
    emit('browser.request-end', {
      ...requestData(request),
      responseEndMs: request.timing().responseEnd,
    });
  };
  page.on('frameattached', attached);
  page.on('framenavigated', navigated);
  page.on('framedetached', detached);
  page.on('load', loaded);
  page.on('requestfinished', finished);
  page.on('console', consoleMessage);
  page.on('pageerror', pageError);
  page.on('request', requested);
  page.on('requestfailed', failed);
  page.on('response', response);
  return {
    dispose: () => {
      page.off('frameattached', attached);
      page.off('framenavigated', navigated);
      page.off('framedetached', detached);
      page.off('load', loaded);
      page.off('requestfinished', finished);
      page.off('console', consoleMessage);
      page.off('pageerror', pageError);
      page.off('request', requested);
      page.off('requestfailed', failed);
      page.off('response', response);
      return Promise.resolve();
    },
  };
}

export function diagnosticUrl(value: string) {
  if (!value) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
      return '[unavailable URL]';
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return '[unavailable URL]';
  }
}
