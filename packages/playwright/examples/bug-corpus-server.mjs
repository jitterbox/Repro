import { createServer } from 'node:http';

// Deliberately broken application fixtures. No annotation is painted into capture pixels.
const definitions = {
  gestures: [
    'Interaction diagnostics',
    `<article id="target" data-position="1" style="height:180px;user-select:none;touch-action:none"><h2>Drag to reorder</h2><p>Item remains in position 1</p><span id="counter">No actions yet</span></article>`,
    `#target{background:#e4eef9}`,
    `state={valid:target.dataset.position==='2',position:Number(target.dataset.position),expectedPosition:2};`,
  ],
  overflow: [
    'Sales dashboard',
    `<div class="metrics"><article>Net sales<strong>$25,180</strong></article><article id="reference">Big Four Fry<strong id="target">100.00<span>%</span></strong></article><article>Checks<strong>381</strong></article><article>Labor<strong>28%</strong></article></div><p>Store 104 · September report</p>`,
    `#target{white-space:nowrap;font-size:28px}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.metrics article{min-width:0;padding:8px}.metrics strong{display:block;margin-top:12px}`,
    `document.querySelector('#target').style.fontSize=fixed?'14px':'28px'; state={valid:target.scrollWidth<=target.clientWidth,cardWidth:reference.clientWidth,valueWidth:target.scrollWidth};`,
  ],
  clipping: [
    'Day schedule',
    `<p>09:00 — 09:30</p><article id="target">Manager feedback · September 28, 2026</article><p>30-minute event</p><button id="reference">My schedule</button>`,
    `#target{width:220px;height:25px;white-space:nowrap;overflow:hidden}#reference{width:90px;white-space:nowrap;overflow:hidden}`,
    `target.style.width=fixed?'100%':'220px';state={valid:target.scrollWidth<=target.clientWidth,visibleWidth:target.clientWidth,textWidth:target.scrollWidth};`,
  ],
  overlap: [
    'Schedule event',
    `<article id="reference"><label>Description</label><div id="target">Complete the opening checks and review responsibilities.</div></article>`,
    `#reference{position:relative;height:120px;font-size:20px}#target{position:absolute;top:8px;left:16px;right:16px}label{font-weight:700}`,
    `document.querySelector('.app').style.zoom='1.5';target.style.top=fixed?'42px':'8px';state={valid:target.getBoundingClientRect().top>=document.querySelector('label').getBoundingClientRect().bottom,zoom:'150%',descriptionTop:Math.round(target.getBoundingClientRect().top),labelBottom:Math.round(document.querySelector('label').getBoundingClientRect().bottom)};`,
  ],
  alignment: [
    'DM Schedule',
    `<article><div id="reference" class="segment">Shift Teams · Responsibilities</div></article><article><small>Event detail</small><div id="target" class="segment">Shift Teams · Responsibilities</div></article>`,
    `.segment{width:270px;margin:12px auto;padding:12px;background:#e0eafa;border-radius:8px}`,
    `target.style.transform=fixed?'none':'translateX(-12px)';state={valid:target.getBoundingClientRect().left===reference.getBoundingClientRect().left,gapCssPx:Math.round(reference.getBoundingClientRect().left-target.getBoundingClientRect().left)};`,
  ],
  sticky: [
    'Store summary',
    `<div id="scroll" class="scroll"><table><thead><tr><th id="target">Store</th><th>Sales</th></tr></thead><tbody>${Array.from({ length: 30 }, (_, i) => `<tr><td>Store ${100 + i}</td><td>$${1600 + i * 3}</td></tr>`).join('')}</tbody></table></div>`,
    `th{position:sticky;top:2px;background:#dce6f3}table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:16px}tr:nth-child(odd){background:#faad79}.scroll{height:350px;overflow:auto;border:1px solid #74849a}`,
    `target.style.top=fixed?'0px':'2px';state={valid:getComputedStyle(target).top==='0px',stickyInset:getComputedStyle(target).top,scrollTop:document.querySelector('#scroll').scrollTop};`,
  ],
  footer: [
    'Checks history',
    `<div id="scroll" class="scroll">${Array.from({ length: 16 }, (_, i) => `<article ${i === 15 ? 'id="target"' : ''}>Week ${i + 1} · Opening check</article>`).join('')}<div id="space"></div></div><div id="reference" class="footer">History &nbsp; · &nbsp; Scores <span class="fab">＋</span></div>`,
    `.scroll{height:380px;overflow:auto}.footer{position:absolute;bottom:0;left:0;right:0;height:60px;background:#193b63;color:white;padding:20px}.fab{position:absolute;right:16px;top:-22px;background:#3778d5;padding:16px;border-radius:50%}.app{position:relative}`,
    `document.querySelector('#space').style.height=fixed?'80px':'0';state={valid:target.getBoundingClientRect().bottom<=reference.getBoundingClientRect().top,coveredCssPx:Math.max(0,Math.round(target.getBoundingClientRect().bottom-reference.getBoundingClientRect().top)),footerHeight:60,reservedBottomSpace:fixed?80:0};`,
  ],
  chrome: [
    'Create check',
    `<div id="scroll" class="scroll"><div id="wizard-chrome"><h2>Select a check</h2><input id="target" placeholder="Search checks"></div>${Array.from({ length: 6 }, (_, i) => `<article>Check ${i + 1} · Store operations</article>`).join('')}</div><div class="cover">Operations · Create check</div>`,
    `.scroll{height:480px;overflow:auto}.cover{position:absolute;top:0;left:0;right:0;background:#17385e;color:white;padding:20px;z-index:2}.app{position:relative}#wizard-chrome{padding-top:50px}`,
    `const chrome=document.querySelector('#wizard-chrome');chrome.style.position=fixed?'sticky':'static';chrome.style.top='0';state={valid:target.getBoundingClientRect().top>=document.querySelector('.cover').getBoundingClientRect().bottom,headerPosition:getComputedStyle(chrome).position,searchTop:Math.round(target.getBoundingClientRect().top),searchHeight:target.getBoundingClientRect().height,visibleHeight:Math.max(0,target.getBoundingClientRect().bottom-document.querySelector('.cover').getBoundingClientRect().bottom),chromeBottom:Math.round(document.querySelector('.cover').getBoundingClientRect().bottom),scrollTop:document.querySelector('#scroll').scrollTop};`,
  ],
  scroll: [
    'Store summary → dashboard',
    `<div id="target"><h2>Store performance</h2><input placeholder="Focus store filter"><div id="rows">${Array.from({ length: 25 }, (_, i) => `<article>Store ${i + 1}</article>`).join('')}</div></div>`,
    `#target{height:1600px}#finish{position:fixed;right:12px;bottom:12px;z-index:4}`,
    `state={valid:fixed||window.scrollY===0,documentScrollY:window.scrollY,expectedScrollY:0};if(fixed)window.scrollTo(0,0);`,
  ],
  layers: [
    'Report settings',
    `<div class="sheet first"><h2>View controls</h2><p>Choose the report columns.</p></div><div id="target" class="sheet second"><h2>Settings</h2><button id="blocked">Apply settings</button></div>`,
    `.app{height:450px;position:relative}.sheet{position:absolute;top:40px;padding:24px;width:260px;height:300px;border:1px solid #adbccc;box-shadow:0 8px 24px #172a3b22;background:#f4f8ff}.first{right:10px;z-index:3}.second{right:80px;z-index:2}`,
    `target.style.zIndex=fixed?'4':'2';const r=document.querySelector('#blocked').getBoundingClientRect();state={valid:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.id==='blocked',settingsLayer:getComputedStyle(target).zIndex,viewControlsLayer:3};`,
  ],
  dark: [
    'Check summary',
    `<article id="target">✓ All required questions answered</article><p>Ready for manager review.</p>`,
    `#target{background:#dcfce7;color:#166534}body.dark{background:#111b29;color:#ecf5ed}body.dark #target{color:#d5f5dc}body.dark .app{background:#1b2b3e}`,
    `document.body.classList.add('dark');target.style.background=fixed?'#163d2a':'#dcfce7';state={valid:getComputedStyle(target).backgroundColor==='rgb(22, 61, 42)'&&getComputedStyle(target).color==='rgb(213, 245, 220)',background:getComputedStyle(target).backgroundColor,text:getComputedStyle(target).color};`,
  ],
  flash: [
    'Check question list',
    `<article><h2 id="target">Choose a check</h2><p id="progress">Question list ready</p></article>`,
    `#target{min-height:40px}`,
    `target.textContent=fixed?'QFC Check':'DM Check';state={valid:target.textContent==='QFC Check',paintedTitle:target.textContent};setTimeout(()=>{target.textContent='QFC Check';state.paintedTitle='QFC Check';document.querySelector('#progress').textContent='QFC questions loaded'},180);`,
  ],
  typing: [
    'Thermometer validation',
    `<label>Associate feedback</label><textarea id="target" placeholder="Enter feedback"></textarea><button id="submit" style="background:#a4acb6">Submit</button><p id="reference">Ready to type</p>`,
    `textarea{display:block;width:90%;height:80px;margin-top:12px}`,
    `state={valid:getComputedStyle(target).transform==='none'&&getComputedStyle(document.querySelector('#submit')).backgroundColor==='rgb(40, 105, 191)',value:target.value,fieldTransform:getComputedStyle(target).transform,buttonPaint:document.querySelector('#submit').style.background,canSubmit:target.value.length>0};`,
  ],
  orientation: [
    'Periodic schedule',
    `<article id="target">Store 104 <span id="caret">⌄</span></article><p>Responsibilities and store meetings</p>`,
    `#caret{float:right;font-size:28px}@media(min-width:768px),(orientation:landscape){#caret{display:none}}`,
    `document.querySelector('#caret').style.visibility=fixed?'hidden':'visible';state={valid:getComputedStyle(document.querySelector('#caret')).visibility==='hidden'||getComputedStyle(document.querySelector('#caret')).display==='none',caretVisible:getComputedStyle(document.querySelector('#caret')).display!=='none',width:innerWidth,height:innerHeight};`,
  ],
  gallery: [
    'Check photos',
    `<article id="target" class="photo"><div id="photo">01</div><p>Opening check · Photo 1 of 10</p></article><input id="search" placeholder="Search associates"><aside id="reference">Associate details</aside>`,
    `.photo{height:240px;background:linear-gradient(135deg,#244572,#8cb8bd);color:white;text-align:center;touch-action:none}#photo{font-size:96px}aside{padding:20px;background:#e1e9f2}`,
    `state={valid:document.querySelector('#photo').textContent==='02'&&document.querySelector('#reference').style.display!=='none',imageIndex:Number(document.querySelector('#photo').textContent),sideColumnVisible:document.querySelector('#reference').style.display!=='none'};`,
  ],
};
function html(kind, fixed) {
  const [title, body, css, measure] = definitions[kind] ?? definitions.overflow;
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>*{box-sizing:border-box}body{margin:0;background:#edf2f7;color:#203449;font:16px system-ui}header{padding:20px;background:#193b63;color:white}h1{font-size:22px;margin:0}nav{padding:14px;display:flex;gap:8px;flex-wrap:wrap}button,input,textarea{font:inherit;padding:10px;border:1px solid #8da4bc;border-radius:6px}button{background:#e5eef9;color:#173653;cursor:pointer}button:active{background:#bcd9f6}.app{margin:16px;padding:16px;background:#fff;border-radius:10px;min-height:300px}article{padding:16px;border:1px solid #bdcddd;border-radius:6px;margin-bottom:12px}small{color:#566d84}h2{font-size:20px}p{line-height:1.5}${css}</style><header><h1>${title}</h1></header><nav><button id="open">Open report</button><button id="action">${kind === 'dark' ? 'Dark mode' : kind === 'flash' ? 'Open QFC check' : 'Show detail'}</button><button id="finish">${kind === 'scroll' ? 'Back to dashboard' : 'Inspect result'}</button></nav><main class="app">${body}</main><script>
const fixed=${fixed},kind=${JSON.stringify(kind)};let state={valid:true,phase:'ready'};const target=document.querySelector('#target'),reference=document.querySelector('#reference');window.fixture=()=>JSON.parse(JSON.stringify(state));window.measure=()=>{${measure};return state};
document.querySelector('#open').onclick=()=>{state.phase='opened';console.info('Report opened');};
document.querySelector('#action').onclick=()=>{window.measure();console.info('Detail action started');};
document.querySelector('#finish').onclick=()=>{if(kind==='scroll'){document.querySelector('#rows').innerHTML='<article>Dashboard overview</article>';if(fixed)window.scrollTo(0,0)}window.measure();};
if(kind==='gestures'){let count=0;for(const type of ['click','dblclick','contextmenu','pointerup'])target.addEventListener(type,e=>{e.preventDefault();document.querySelector('#counter').textContent=type+' · '+(++count);window.measure()})}
if(kind==='typing'){target.addEventListener('input',()=>{if(!fixed)target.style.transform='translateY('+(target.value.length%3)*5+'px)';if(fixed)document.querySelector('#submit').style.background='#2869bf';window.measure()});target.addEventListener('blur',()=>document.querySelector('#submit').style.background='#2869bf');document.querySelector('#submit').onpointerdown=()=>{state.submitted=true;document.querySelector('#reference').textContent='Submitted successfully';console.info('Submit accepted before blur')}}
if(kind==='gallery'){target.onpointerdown=()=>{target.style.transform='translateX(-6px)';setTimeout(()=>target.style.transform='none',120)};target.onpointerup=()=>{if(fixed)document.querySelector('#photo').textContent='02';window.measure()};document.querySelector('#search').oninput=()=>{if(!fixed)document.querySelector('#reference').style.display='none';window.measure()}}
</script>`;
}
createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('Content-Type', 'text/html');
  res.end(html(url.pathname.slice(1), url.searchParams.has('fixed')));
}).listen(3208, '127.0.0.1');
