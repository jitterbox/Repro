import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
const root = resolve('.repro/bug-corpus'),
  results = JSON.parse(await readFile(join(root, 'results.json'), 'utf8'));
const comparisons = JSON.parse(
  await readFile(join(root, 'comparisons.json'), 'utf8').catch(() => '[]'),
);
const receipts = JSON.parse(
  await readFile(join(root, 'final-acceptance.json'), 'utf8').catch(() => '[]'),
);
const webDash = JSON.parse(
  await readFile(join(root, 'web-dash/results.json'), 'utf8').catch(() => '[]'),
).filter((r) => r.status === 'recorded-and-audited');
const escape = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
for (const r of results)
  await copyFile(
    join(
      r.rendered.directory,
      r.kind === 'gestures' ? 'sequence.png' : 'result.png',
    ),
    join(root, `${r.kind}-${r.role}.png`),
  );
// Create a decoder only when requested. Even preload=none leaves a growing
// collection of media elements in long galleries; release the previous player.
function player(src, title, poster) {
  return `<div class="player" data-src="${escape(src)}" data-title="${escape(title)}"><button class="play-video" type="button" aria-label="Play ${escape(title)}">${poster ? `<img loading="lazy" src="${escape(poster)}" alt="${escape(title)} preview">` : ''}<span>▶ Play recording</span></button></div>`;
}
function card(r) {
  const name = `${r.kind}-${r.role}`,
    receipt = receipts.find((p) => p.name === name && p.run === r.run);
  return `<article><div class="meta">${escape(r.issues)} · ${r.width} × ${r.height}</div><h2>${escape(r.title)}</h2>${player(`${name}.mp4`, `${r.title} — ${r.role}`, `${name}.png`)}<footer><span class="tag">${r.role === 'before' ? 'Reproduced defect' : 'Independent corrected recording'}</span>${receipt ? `<a href="${escape(relative(root, receipt.strictExport))}/viewer/public/index.html">Audited evidence bundle ↗</a>` : ''}</footer></article>`;
}
const webDashSection = webDash.length
  ? `<section id="web-dash"><h3>Real application · Web-Dash</h3><p>Recorded directly from the existing application and its configured API. These are standalone walkthroughs, with measured UI targets and synchronized diagnostics.</p><div class="grid">${webDash.map((r) => `<article><div class="meta">${escape(r.role)} · ${r.viewport.width} × ${r.viewport.height} · Live application</div><h2>${escape(r.title)}</h2>${player(`web-dash/${r.name}.mp4`, r.title, `web-dash/${r.name}.png`)}<footer><span class="tag">Recorded walkthrough</span><a href="web-dash/bundles/${escape(r.name)}/viewer/public/index.html">Audited evidence bundle ↗</a></footer></article>`).join('')}</div></section>`
  : '';
await writeFile(
  join(root, 'index.html'),
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Repro · professional bug evidence</title><style>*{box-sizing:border-box}body{margin:clamp(16px,3vw,40px);background:#101721;color:#edf3f8;font:17px/1.5 system-ui}header{max-width:980px;margin-bottom:32px}.eyebrow{color:#8cbdd4;letter-spacing:2px;text-transform:uppercase;font-size:12px}h1{font-size:clamp(28px,4vw,42px);line-height:1.12;margin:12px 0}h2{font-size:20px;line-height:1.3;margin:8px 0 18px}h3{font-size:24px;margin-top:48px}p{color:#b9cad7}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,460px),1fr));gap:24px}article{min-width:0;background:#1c2734;padding:20px;border:1px solid #34485b;border-radius:12px}video{display:block;width:100%;max-height:76vh;background:#101721;border-radius:6px}.play-video{display:block;position:relative;width:100%;min-height:190px;padding:0;overflow:hidden;border:0;border-radius:6px;background:#101721;color:#edf3f8;cursor:pointer}.play-video img{display:block;width:100%;max-height:76vh;object-fit:contain}.play-video span{position:absolute;bottom:16px;left:50%;transform:translateX(-50%);white-space:nowrap;padding:8px 16px;border:1px solid #7999ab;border-radius:24px;background:#101721ed;font:600 14px system-ui}.play-video:hover span,.play-video:focus-visible span{background:#30475a}.meta{font-size:12px;color:#a9becf}footer{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:16px;font-size:13px}.tag{border:1px solid #566e80;border-radius:20px;padding:3px 10px;color:#b9d4e3}a{color:#a0dcec;text-underline-offset:3px}.comparison{grid-column:1/-1}</style><header><div class="eyebrow">Repro / visual acceptance corpus</div><h1>Clear evidence. Precise explanations.</h1><p>${webDash.length ? `${webDash.length} recordings from the real Web-Dash app, alongside fourteen simulated application defects and an interaction showcase.` : 'Fourteen simulated application defects and an interaction showcase.'} Most examples stand alone. Critical findings use a distinct amber treatment; ordinary instructions stay neutral.</p><p>${results.length + webDash.length} standalone recordings · ${comparisons.length} optional comparisons · Mobile, tablet, and desktop</p></header><main>${webDashSection}${webDash.length ? '<h3>Simulated defect corpus</h3>' : ''}<div class="grid">${results
    .filter((r) => r.role === 'before')
    .map(card)
    .join(
      '',
    )}</div><h3>Corrected behavior, recorded separately</h3><p>These recordings can be created and shared independently of the original repro.</p><div class="grid">${results
    .filter((r) => r.role === 'after')
    .map(card)
    .join(
      '',
    )}</div><h3>Optional comparisons</h3><p>Differences are labeled in each view. Shared explanations appear only on the left.</p><div class="grid">${comparisons.map((c) => `<article class="comparison"><h2>${escape(c.kind === 'dark' ? 'Dark theme: expected and actual colors' : 'Navigation: a measured alignment difference')}</h2>${player(`${c.kind}-comparison.mp4`, `${c.kind} comparison`)}</article>`).join('')}</div></main><script>const previews=new Map([...document.querySelectorAll('.player')].map(p=>[p,p.innerHTML]));document.addEventListener('click',event=>{const button=event.target.closest('.play-video');if(!button)return;const player=button.closest('.player');for(const video of document.querySelectorAll('video')){const previous=video.closest('.player');video.pause();video.removeAttribute('src');video.load();previous.innerHTML=previews.get(previous);}const video=document.createElement('video');video.controls=true;video.playsInline=true;video.setAttribute('aria-label',player.dataset.title);video.src=player.dataset.src;player.replaceChildren(video);video.play().catch(()=>{});});</script></html>`,
);
console.log(join(root, 'index.html'));
