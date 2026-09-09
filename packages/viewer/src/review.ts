import type { RunManifest, LowConfidenceSpan } from '@repro/contracts';
import { overlayTheme, hitTestOutline } from '@repro/contracts';
import { mapComparisonTime } from './sync-time.js';
import type { SyncKnot } from './sync-time.js';
export interface ReviewPane {
  run: RunManifest;
  prefix: string;
  originalDurationMs?: number;
}
export interface ReviewDocument {
  before: ReviewPane;
  after?: ReviewPane;
  knots?: readonly SyncKnot[];
  alignment?: {
    verified: boolean;
    matchedCheckpoints: number;
    imageMatches?: readonly {
      id: string;
      afterCheckpoint: string;
      changedPixelRatio: number;
    }[];
    scenarioSource?: string;
    unmatched: readonly { role: string; checkpoint: string }[];
    lowConfidenceSpans: readonly LowConfidenceSpan[];
  };
}
/** Shared local/portable review shell. All untrusted labels are inserted as text. */
export function reviewDocumentHtml(model: ReviewDocument): string {
  const outlines = [
    model.before,
    ...(model.after ? [model.after] : []),
  ].flatMap((pane) =>
    pane.run.observations.flatMap((o) => {
      const outline = hitTestOutline(o);
      return outline ? [outline] : [];
    }),
  );
  const outlinePayload = JSON.stringify(outlines).replaceAll('<', '\\u003c');
  const payload = JSON.stringify(model).replaceAll('<', '\\u003c');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Repro evidence review</title><style>
 :root{color-scheme:dark}body{font:18px system-ui;color:#f4f4f4;background:#11151b;margin:24px}button,select,input{font:inherit}button,a{color:#afdaff}button{background:#202733;border:1px solid #8090a8;border-radius:4px;padding:6px 12px}button:focus-visible,a:focus-visible{outline:3px solid #fff}nav,.controls{display:flex;flex-wrap:wrap;gap:12px;margin:16px 0}.panes{display:flex;gap:24px}.pane{flex:1;min-width:0}.surface{position:relative;overflow:hidden;background:#000}.surface img,.surface video{width:100%;display:block}.box{position:absolute;border:3px solid ${overlayTheme.colors['repro-info'].hex};box-sizing:border-box;pointer-events:none}.diagnostic{border-style:dashed;border-color:#ffa04d}.box span{position:absolute;top:100%;left:0;background:#111;color:#fff;font:12px system-ui;white-space:nowrap;padding:2px}.surface.focus img{width:auto;max-width:none}.surface video{display:none}pre{white-space:pre-wrap;font-size:14px}.panes.onion,.panes.wipe,.panes.difference{display:block;position:relative}.panes.onion .pane:last-child,.panes.wipe .pane:last-child,.panes.difference .pane:last-child{position:absolute;inset:0}.panes.onion .pane:last-child{opacity:.5}.panes.wipe .pane:last-child{clip-path:inset(0 0 0 50%)}.panes.difference .pane:last-child{mix-blend-mode:difference}.panes.edge img,.panes.edge video{filter:url(#edge-filter)}.contrast{filter:contrast(1.5)}h2{font-size:20px}@media(max-width:800px){.panes{display:block}}
 </style><svg width="0" height="0" aria-hidden="true"><filter id="edge-filter"><feColorMatrix type="saturate" values="0"/><feConvolveMatrix order="3" kernelMatrix="-1 -1 -1 -1 8 -1 -1 -1 -1" preserveAlpha="true"/></filter></svg><h1 id="title"></h1><p id="summary"></p><p id="alignment" role="status"></p><ul id="alignment-notes"></ul><p id="timing" aria-live="off"></p><p id="checkpoint-timing"></p><nav id="steps" aria-label="Scenario steps"></nav><nav id="diagnostic-samples" aria-label="Hit-test sample images"></nav><nav id="segments" aria-label="Proof segments"></nav><nav id="checkpoints" aria-label="Checkpoints"></nav><div class="controls"><button id="context">Context / focused crop</button><button id="outlines">Measured outlines</button><button id="play">Play / pause recording</button><label><input id="original" type="checkbox">Original timing</label><label>Layout <select id="layout"><option value="">Side by side</option><option value="onion">Onion</option><option value="wipe">Wipe</option><option value="difference">Difference</option><option value="edge">Edges</option></select></label><button id="contrast">High contrast</button></div><main id="panes" class="panes"></main><details><summary>Assertions, diagnostics, console and failed requests</summary><pre id="details"></pre></details><details open><summary>Browser console and request diagnostics</summary><p>Times are host receipt times with unknown delivery latency. Step associations describe timing, not causality. URLs omit credentials, queries and fragments.</p><ul id="browser-diagnostics"></ul></details><script>
 const diagnosticOutlines=${outlinePayload};const mapComparisonTime=${mapComparisonTime.toString()};const model=${payload};const panes=[model.before,...(model.after?[model.after]:[])];let selected;let focused=false;let outlines=true;let playback=false;
 const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
 document.title=model.before.run.scenario.title;document.querySelector('#title').textContent=model.before.run.scenario.title;
 document.querySelector('#summary').textContent=panes.map(p=>p.run.variant.label+': '+p.run.scenarioOutcome+' · '+(Number.isFinite(p.originalDurationMs)?(p.originalDurationMs/1000).toFixed(2)+' seconds original':'recording duration unavailable')).join(' | ');
 for(const step of model.before.run.steps){const button=el('button',step.index+'. '+step.title);button.onclick=()=>{for(const pane of panes){const match=pane.run.steps.find(s=>s.id===step.id);if(match)pane.video.currentTime=Math.max(0,(match.startMs-Number(pane.run.environment.recordingStartMs||0))/1000);}showVideo();};document.querySelector('#steps').append(button);}
 for(const pane of panes){const section=el('section');section.className='pane';section.append(el('h2',pane.run.variant.label));const surface=el('div');surface.className='surface';pane.surface=surface;pane.image=el('img');pane.video=el('video');pane.video.controls=true;pane.video.preload='metadata';pane.video.onloadedmetadata=()=>{pane.originalDurationMs=pane.video.duration*1000;updateTiming();};const recording=pane.run.artifacts.find(a=>a.kind==='recording');if(recording)pane.video.src=pane.prefix+'/'+recording.path;surface.append(pane.image,pane.video);section.append(surface);document.querySelector('#panes').append(section);}
 for(const pane of panes){for(const diagnostic of pane.run.diagnostics||[]){const row=el('li');const time=el('button',pane.run.variant.label+' '+(diagnostic.timeMs/1000).toFixed(2)+' s');time.onclick=()=>{for(const p of panes)p.video.pause();original.checked=true;timingMode();pane.video.currentTime=Math.max(0,(diagnostic.timeMs-Number(pane.run.environment.recordingStartMs||0))/1000);showVideo();updateTiming();};row.append(time,el('span',' '+diagnostic.kind+': '+diagnostic.message+' · '+(diagnostic.stepId?'step '+diagnostic.stepId:'outside a unique step')+' · page '+diagnostic.pageId+(diagnostic.url?' · '+diagnostic.url:'')+(diagnostic.requestStartedMs!==undefined?' · request started '+(diagnostic.requestStartedMs/1000).toFixed(2)+' s':'')));row.dataset.eventId=diagnostic.eventId;document.querySelector('#browser-diagnostics').append(row);}}
 for(const pane of panes){for(const segment of pane.run.segments||[]){const button=el('button',pane.run.variant.label+' · '+segment.title);button.onclick=()=>{for(const p of panes)p.video.pause();original.checked=true;timingMode();pane.video.currentTime=Math.max(0,(segment.startMs-Number(pane.run.environment.recordingStartMs||0))/1000);showVideo();};document.querySelector('#segments').append(button);}}
 for(const pane of panes){for(const observation of pane.run.observations.filter(o=>o.kind==='hit-test'&&o.artifact)){const button=el('button',pane.run.variant.label+' · Hit-test sample '+observation.target);button.onclick=()=>{playback=false;for(const p of panes)p.video.pause();pane.video.style.display='none';pane.image.style.cssText='display:block;width:100%;transform:none';pane.image.src=pane.prefix+'/'+observation.artifact;pane.image.alt='Hit-test sample context: '+observation.id;pane.surface.style.height='auto';pane.surface.querySelectorAll('.box').forEach(n=>n.remove());const diagnostic=diagnosticOutlines.find(d=>d.observationId===observation.id);if(diagnostic){const b=diagnostic.bounds,v=pane.run.environment.viewport,box=el('div');box.className='box diagnostic';Object.assign(box.style,{left:b.x/v.width*100+'%',top:b.y/v.height*100+'%',width:b.width/v.width*100+'%',height:b.height/v.height*100+'%'});box.append(el('span',diagnostic.label));box.title=observation.id;pane.surface.append(box);}document.querySelector('#checkpoint-timing').hidden=false;document.querySelector('#timing').hidden=true;document.querySelector('#checkpoint-timing').textContent=diagnostic?'Bracketed diagnostic sample '+diagnostic.frame.timeMs.toFixed(1)+' ms; uncertainty '+diagnostic.frame.uncertaintyMs.toFixed(1)+' ms. Point sample and measured element bounds, not an entire hitbox.':'Diagnostic geometry changed during acquisition; aligned outline unavailable.';document.querySelector('#details').textContent=JSON.stringify(observation,null,2);};document.querySelector('#diagnostic-samples').append(button);}}
 const ids=[...new Set(panes.flatMap(p=>p.run.observations.filter(o=>o.kind==='screenshot').map(o=>o.checkpoint)))];
 for(const id of ids){const button=el('button',id);button.onclick=()=>showCheckpoint(id);document.querySelector('#checkpoints').append(button);}
 function showCheckpoint(id){document.querySelector('#checkpoint-timing').hidden=false;document.querySelector('#timing').hidden=true;selected=id;playback=false;for(const pane of panes){pane.video.pause();pane.video.style.display='none';pane.image.style.display='block';pane.surface.querySelectorAll('.box').forEach(n=>n.remove());const shot=pane.run.observations.find(o=>o.checkpoint===id&&o.kind==='screenshot');if(!shot){pane.image.removeAttribute('src');pane.image.alt='Unmatched checkpoint: '+id;continue;}pane.image.src=pane.prefix+'/'+shot.artifact;pane.image.alt=pane.run.variant.label+' — '+id+' at '+shot.timeMs.toFixed(1)+' ms';const bounds=pane.run.observations.filter(o=>o.checkpoint===id&&o.kind==='bounds'&&o.status==='passed'&&o.bounds);const viewport=pane.run.environment.viewport;pane.image.style.cssText='display:block;width:100%;transform:none';pane.surface.style.height='auto';
 if(focused&&bounds.length){const all=panes.flatMap(p=>p.run.observations.filter(o=>o.checkpoint===id&&o.kind==='bounds'&&o.status==='passed'&&o.bounds).map(o=>o.bounds));const x=Math.max(0,Math.min(...all.map(b=>b.x))-24),y=Math.max(0,Math.min(...all.map(b=>b.y))-24),right=Math.min(viewport.width,Math.max(...all.map(b=>b.x+b.width))+24),bottom=Math.min(viewport.height,Math.max(...all.map(b=>b.y+b.height))+24);const scale=pane.surface.clientWidth/(right-x);pane.image.style.width=viewport.width*scale+'px';pane.image.style.transform='translate('+(-x*scale)+'px,'+(-y*scale)+'px)';pane.surface.style.height=(bottom-y)*scale+'px';}
 if(outlines&&!focused){for(const obs of bounds){const box=el('div');box.className='box';const b=obs.bounds;Object.assign(box.style,{left:b.x/viewport.width*100+'%',top:b.y/viewport.height*100+'%',width:b.width/viewport.width*100+'%',height:b.height/viewport.height*100+'%'});box.append(el('span','Measured: '+obs.target));box.title=obs.id;pane.surface.append(box);}}
 }document.querySelector('#checkpoint-timing').textContent=panes.map(p=>{const shot=p.run.observations.find(o=>o.checkpoint===id&&o.kind==='screenshot');return p.run.variant.label+': '+(shot?(shot.data?.selection==='event-linked'?'event-linked captured frame ':'screenshot acquired ')+shot.timeMs.toFixed(1)+'–'+(shot.endMs??shot.timeMs).toFixed(1)+' ms from run start; uncertainty '+Math.max(shot.data?.uncertaintyMs??0,(shot.endMs??shot.timeMs)-shot.timeMs).toFixed(1)+' ms':'checkpoint missing');}).join(' | ');document.querySelector('#details').textContent=JSON.stringify(panes.map(p=>({variant:p.run.variant.label,observations:p.run.observations.filter(o=>o.checkpoint===id),errors:p.run.errors})),null,2);}
 function showVideo(){document.querySelector('#checkpoint-timing').hidden=true;document.querySelector('#timing').hidden=false;playback=true;for(const p of panes){p.image.style.display='none';p.video.style.display='block';p.surface.style.height='auto';p.surface.querySelectorAll('.box').forEach(n=>n.remove());}}
 document.querySelector('#context').onclick=()=>{focused=!focused;showCheckpoint(selected);};document.querySelector('#outlines').onclick=()=>{outlines=!outlines;showCheckpoint(selected);};document.querySelector('#layout').onchange=e=>{document.querySelector('#panes').className='panes '+e.target.value;};document.querySelector('#contrast').onclick=()=>document.body.classList.toggle('contrast');
 document.querySelector('#play').onclick=()=>{showVideo();const paused=panes[0].video.paused;for(const p of panes){if(paused)void p.video.play();else p.video.pause();}};
 function interpolate(t,from,to){return mapComparisonTime(t,model.knots||[],from,to);}
 function synchronize(){
 if(panes[1]&&playback&&!document.querySelector('#original').checked){
  const lead=panes[0].video,follow=panes[1].video,t=lead.currentTime*1000;
  const mapped=interpolate(t,0,1)/1000;
  const slope=(interpolate(t+1,0,1)-interpolate(t,0,1));
  follow.playbackRate=Math.max(.0625,Math.min(16,slope));
  if(Math.abs(follow.currentTime-mapped)>1/30)follow.currentTime=mapped;
 }
 requestAnimationFrame(synchronize);
 }

 const original=document.querySelector('#original');
 const alignment=model.alignment;
 const spans=alignment?.lowConfidenceSpans||[];
 const unpaired=alignment?.unmatched||[];
 const canSynchronize=panes.length===2&&(model.knots?.length||0)>=2&&(!alignment||alignment.matchedCheckpoints>0);
 original.checked=!canSynchronize||spans.length>0||unpaired.length>0||alignment?.scenarioSource==='unknown';
 original.disabled=!canSynchronize;
 document.querySelector('#alignment').textContent=alignment?(alignment.verified?'Comparison proof verified.':'Comparison proof not verified.')+(spans.length||unpaired.length?' Alignment is uncertain; original timing is the default. Synchronized playback remains an inspection aid.':''):canSynchronize?'Alignment available.':'Original timing; no measured comparison alignment.';
 for(const missing of unpaired)document.querySelector('#alignment-notes').append(el('li','Unmatched '+missing.role+' checkpoint: '+missing.checkpoint));
 if(alignment?.scenarioSource==='unknown')document.querySelector('#alignment-notes').append(el('li','Scenario source identity is unknown in an older run. Recapture both variants with the same committed test to verify proof.'));
 for(const match of alignment?.imageMatches||[])document.querySelector('#alignment-notes').append(el('li','Estimated image alignment: '+match.id+' → '+match.afterCheckpoint+' · '+(match.changedPixelRatio*100).toFixed(2)+'% changed pixels. This does not establish matching scenario meaning.'));
 for(const span of spans){const row=el('li');const button=el('button','Inspect uncertain alignment '+(span.outStartMs/1000).toFixed(2)+'–'+(span.outEndMs/1000).toFixed(2)+' s');button.onclick=()=>{for(const [index,pane] of panes.entries()){pane.video.pause();pane.video.currentTime=interpolate(span.outStartMs,2,index)/1000;}showVideo();updateTiming();};row.append(button,el('span',' · confidence '+Math.round(span.confidence*100)+'%'));document.querySelector('#alignment-notes').append(row);}
 function updateTiming(){const t=panes[0].video.currentTime*1000;const out=interpolate(t,0,2);const uncertain=spans.some(s=>out+1000/30>=s.outStartMs&&out-1000/30<=s.outEndMs);document.querySelector('#timing').textContent=(original.checked?'Original timing':uncertain?'Synchronized inspection — uncertain alignment':'Synchronized timing')+' | '+panes.map(p=>p.run.variant.label+' '+p.video.currentTime.toFixed(2)+' / '+(Number.isFinite(p.video.duration)?p.video.duration.toFixed(2):'unknown')+' s').join(' | ');}
 function timingMode(){for(const [index,p] of panes.entries()){p.video.playbackRate=1;p.video.controls=index===0||original.checked;}updateTiming();}original.onchange=timingMode;timingMode();
 for(const p of panes){p.video.addEventListener('timeupdate',updateTiming);p.video.addEventListener('seeked',updateTiming);}
 panes[0].video.addEventListener('pause',()=>{if(!original.checked)panes[1]?.video.pause();});
 panes[0].video.addEventListener('play',()=>{if(!original.checked&&panes[1])void panes[1].video.play();});
 updateTiming();

 synchronize();
 if(ids.length)showCheckpoint(ids[0]);
 </script></html>`;
}
