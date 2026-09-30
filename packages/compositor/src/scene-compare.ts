import type { ScenePlan } from '@jitterbox/repro-contracts';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { runSceneWorker } from './scene-process.js';
import { createHash } from 'node:crypto';
import { captureComposition } from './scene-render.js';
import { withFileLock } from '@jitterbox/repro-core';

export interface ComparisonBeat {
  id: string;
  startMs: number;
  durationMs: number;
}
export interface ComparisonPane {
  encoding?: ScenePlan['encoding'];
  label: string;
  width: number;
  height: number;
  composition: string;
  assets: { url: string; path: string; sha256: string }[];
  beats: ComparisonBeat[];
}
export function alignSceneBeats(a: ComparisonBeat[], b: ComparisonBeat[]) {
  if (
    !a.length ||
    a.length !== b.length ||
    a.some((beat, i) => beat.id !== b[i]?.id)
  )
    throw new Error(
      'Scene comparison requires matching ordered semantic beats',
    );
  let time = 0;
  return a.map((left, i) => {
    const right = b[i];
    if (!right) throw new Error('Missing comparison beat');
    const durationMs = Math.max(left.durationMs, right.durationMs);
    const interval = {
      id: left.id,
      startMs: time,
      durationMs,
      a: left,
      b: right,
    };
    time += durationMs;
    return interval;
  });
}
export function comparisonFrameMap(a: ComparisonBeat[], b: ComparisonBeat[]) {
  const beats = alignSceneBeats(a, b),
    last = beats.at(-1);
  if (!last) throw new Error('No comparison beats');
  return Array.from(
    { length: Math.ceil(((last.startMs + last.durationMs) * 30) / 1000) },
    (_, frame) => {
      const outputMs = (frame * 1000) / 30;
      const beat =
        beats.find(
          (s) => outputMs >= s.startMs && outputMs < s.startMs + s.durationMs,
        ) ?? last;
      const elapsed = outputMs - beat.startMs;
      const pane = (s: ComparisonBeat) => {
        const firstFrame = Math.ceil((s.startMs * 30) / 1000 - 1e-9);
        const lastFrame =
          Math.ceil(((s.startMs + s.durationMs) * 30) / 1000 - 1e-9) - 1;
        if (lastFrame < firstFrame)
          throw new Error(`Comparison beat has no output frame: ${s.id}`);
        return {
          outputFrame: Math.max(
            firstFrame,
            Math.min(
              lastFrame,
              Math.floor(((s.startMs + elapsed) * 30) / 1000 + 1e-9),
            ),
          ),
          held: elapsed >= s.durationMs,
        };
      };
      return {
        frame,
        outputMs,
        beat: beat.id,
        a: pane(beat.a),
        b: pane(beat.b),
      };
    },
  );
}
export interface SceneComparisonInput {
  a: ComparisonPane;
  b: ComparisonPane;
  mode: 'verified' | 'observational';
  outDir: string;
  signal?: AbortSignal;
}

export async function renderSceneComparisonInProcess(
  input: SceneComparisonInput,
) {
  if (input.a.width !== input.b.width)
    throw new Error('Comparison requires equal pane scale and crop');
  const frames = comparisonFrameMap(input.a.beats, input.b.beats);
  const width = input.a.width * 2 + 24,
    height = Math.max(input.a.height, input.b.height) + 64;
  const assets = new Map<string, Buffer>();
  for (const [key, pane] of [
    ['a', input.a],
    ['b', input.b],
  ] as const) {
    assets.set(`/${key}/index.html`, Buffer.from(pane.composition));
    for (const asset of pane.assets) {
      const bytes = await readFile(asset.path);
      if (createHash('sha256').update(bytes).digest('hex') !== asset.sha256)
        throw new Error('Corrupt comparison source');
      assets.set(`/${key}/${asset.url}`, bytes);
    }
  }
  const json = (value: unknown) =>
    JSON.stringify(value).replaceAll('<', '\\u003c');
  // Child views use the exact shipped scene runtime, fonts, pixels, and layout.
  const html = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'"><style>html,body{margin:0;background:#101721;color:#edf3f8}main{position:relative;width:${width}px;height:${height}px;background:#101721}iframe{position:absolute;top:64px;border:0;width:${input.a.width}px;height:${Math.max(input.a.height, input.b.height)}px}#a{left:0}#b{left:${input.a.width + 24}px}.label{position:absolute;top:18px;font:20px system-ui}#la{left:24px}#lb{left:${input.a.width + 48}px}</style><main><div class="label" id="la"></div><div class="label" id="lb"></div><iframe id="a" src="a/index.html"></iframe><iframe id="b" src="b/index.html"></iframe></main><script>
  const mapping=${json(frames)},labels=${json([input.a.label, input.b.label])},mode=${json(input.mode)};
  const panes=['a','b'].map(id=>document.getElementById(id));let pending=Promise.resolve();
  Promise.all(panes.map(p=>new Promise(resolve=>p.addEventListener('load',async()=>{await p.contentDocument.fonts.ready;p.contentWindow.__reproLayout();resolve();},{once:true})))).then(()=>{
    window.__hf={duration:mapping.length/30,seek(time){const f=mapping[Math.min(mapping.length-1,Math.max(0,Math.round(time*30)))];pending=Promise.all(panes.map(async(p,i)=>{const cursor=i?f.b:f.a;document.getElementById(i?'lb':'la').textContent=labels[i]+' · '+(mode==='verified'?'Controlled comparison':'Observational playback')+(cursor.held?' · Held at checkpoint':'');p.contentWindow.__hf.seek(cursor.outputFrame/30);await p.contentWindow.__hfWaitForSeekCompletion();})).then(()=>{const left=panes[0].contentDocument,right=panes[1].contentDocument;for(const group of right.querySelectorAll('[data-kind=data-panel],[data-kind=marker],[data-kind=step],[data-kind=callout],[data-kind=alignment],[data-kind=highlight],[data-kind=title]')){const card=group.querySelector('.card');const peerGroup=Array.from(left.querySelectorAll('[data-cue]')).find(g=>g.dataset.cue===group.dataset.cue);const peer=peerGroup?.querySelector('.card');if(!card||!peer)continue;const text=c=>Array.from(c.children).filter(n=>!n.classList.contains('eyebrow')).map(n=>n.textContent).join(' ');const common=Number(peerGroup.style.opacity)>0 && text(card)===text(peer) && group.dataset.comparisonKey===peerGroup.dataset.comparisonKey;for(const c of [card,peer]){const label=c.querySelector('.eyebrow');if(label && group.dataset.kind!=='title')label.textContent=common?'SHARED · BOTH VIEWS':'DIFFERENCE · '+(c===card?labels[1]:labels[0]);}card.style.visibility=common?'hidden':'visible';for(const leader of group.querySelectorAll('.leader'))leader.style.visibility=common?'hidden':'visible';card.setAttribute('aria-label',common?'Common observations shown on left':'Different observation in this view');}});}};
    window.__hfWaitForSeekCompletion=()=>pending;
    window.__reproValidate=()=>panes.forEach(p=>p.contentWindow.__reproValidate());window.__hf.seek(0);
  });</script>`;
  await mkdir(input.outDir, { recursive: true });
  await writeFile(join(input.outDir, 'comparison.html'), html);
  await writeFile(
    join(input.outDir, 'comparison-frame-map.json'),
    JSON.stringify(frames, null, 2),
  );
  const result = await captureComposition({
    html,
    assets,
    width,
    height,
    ...(input.a.encoding ? { encoding: input.a.encoding } : {}),
    count: frames.length,
    duration: (frames.length * 1000) / 30,
    outDir: input.outDir,
    metadata: {
      mode: input.mode,
      paneScale: 1,
      semanticBeats: alignSceneBeats(input.a.beats, input.b.beats),
    },
    ...(input.signal ? { signal: input.signal } : {}),
  });
  return { ...result, frames };
}
export async function renderSceneComparison(
  input: SceneComparisonInput,
): Promise<Awaited<ReturnType<typeof renderSceneComparisonInProcess>>> {
  await mkdir(input.outDir, { recursive: true });
  return withFileLock(join(input.outDir, 'scene.lock'), async () => {
    const request = join(input.outDir, 'render-request.json');
    await writeFile(
      request,
      JSON.stringify({ ...input, signal: undefined, comparison: true }),
    );
    await runSceneWorker(request, input.signal);
    return JSON.parse(
      await readFile(join(input.outDir, 'render-result.json'), 'utf8'),
    ) as Awaited<ReturnType<typeof renderSceneComparisonInProcess>>;
  });
}
