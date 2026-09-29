import { it, expect } from 'vitest';
import { observeWebMcp } from './webmcp-observer.js';
import type { CaptureEventInput } from './events.js';
it('observes metadata and results without invoking a tool', async () => {
  const commands: string[] = [],
    handlers = new Map<string, (payload: unknown) => void>(),
    events: CaptureEventInput[] = [];
  const observer = await observeWebMcp(
    {
      send(method) {
        commands.push(method);
        return Promise.resolve({});
      },
      on(e, h) {
        handlers.set(e, h);
      },
      off(e) {
        handlers.delete(e);
      },
    },
    'page',
    {
      emitEvent: (e) => {
        events.push(e);
      },
    },
    () => 'https://qa.example',
  );
  const value = { tools: [{ name: 'storeState', frameId: 'frame' }] };
  handlers.get('WebMCP.toolsAdded')?.(value);
  const first=value.tools[0];if(!first)throw new Error('Missing test tool');first.name='mutated';
  expect(commands).toEqual(['WebMCP.enable']);
  expect(JSON.stringify(events)).toContain('storeState');
  expect(JSON.stringify(events)).not.toContain('mutated');
  observer.dispose();
  expect(handlers.size).toBe(0);
});
it('reports unsupported protocol without manufacturing tool values', async () => {
  const events: CaptureEventInput[] = [];
  await observeWebMcp(
    {
      send: () => Promise.reject(new Error('Unknown method')),
      on: () => undefined,
      off: () => undefined,
    },
    'page',
    {
      emitEvent: (e) => {
        events.push(e);
      },
    },
    () => 'null',
  );
  expect(events).toHaveLength(1);
  expect(events[0]?.payload).toMatchObject({ status: 'unsupported' });
});
