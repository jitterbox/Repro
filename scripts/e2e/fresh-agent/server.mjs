/** Held-out UI corpus. Evaluation agents inspect the running app, not this source. */
import { createServer } from 'node:http';
const port = Number(process.env.PORT ?? 3219);
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  if (url.pathname === '/api/search') {
    const term = url.searchParams.get('q');
    await new Promise((resolve) =>
      setTimeout(resolve, term === 'oak' ? 650 : 80),
    );
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        term,
        result: term === 'oak' ? 'Oak desk' : 'Pine desk',
      }),
    );
    return;
  }
  const [, id, variant] = url.pathname.split('/');
  const fixed = variant === 'after';
  let content = '',
    script = '';
  if (id === 'FA-01') {
    content = `<h1>Shipment approval</h1><p>Approve the prepared shipment.</p><div class="action-wrap"><button id="approve">Approve shipment</button><div class="shield" aria-label="Sync layer" style="pointer-events:${fixed ? 'none' : 'auto'}"></div></div><p role="status">Awaiting approval</p>`;
    script = `document.querySelector('#approve').onclick=()=>document.querySelector('[role=status]').textContent='Shipment approved';`;
  } else if (id === 'FA-02') {
    content = `<h1>Workspace settings</h1><a href="#help">Help</a><button id="open">Edit display name</button><dialog><h2>Edit display name</h2><label>Display name <input value="Sample workspace"></label><button id="close">Cancel</button></dialog><p id="help">Keyboard shortcuts are available.</p>`;
    script = `const opener=document.querySelector('#open'), dialog=document.querySelector('dialog');opener.onclick=()=>dialog.showModal();document.querySelector('#close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>${fixed ? 'opener' : "document.querySelector('a')"}.focus());`;
  } else if (id === 'FA-03') {
    content = `<h1>Inventory search</h1><label>Search inventory <input id="query"></label><button id="search">Search</button><p role="status">No search yet</p><output aria-label="Search result">No results</output>`;
    script = `let sequence=0;document.querySelector('#search').onclick=async()=>{const token=++sequence,q=document.querySelector('#query').value;document.querySelector('[role=status]').textContent='Searching '+q;const data=await fetch('/api/search?q='+encodeURIComponent(q)).then(r=>r.json());if(${fixed ? 'token===sequence' : 'true'}){document.querySelector('output').textContent=data.result;document.querySelector('[role=status]').textContent='Results for '+data.term}};`;
  } else if (id === 'FA-04') {
    content = `<h1>Report download</h1><button id="download">Prepare report</button><p role="status">Ready</p><div id="notice" aria-live="polite">Report service available</div>`;
    script = `document.querySelector('#download').onclick=()=>{const n=document.querySelector('#notice');document.querySelector('[role=status]').textContent='Preparing';${fixed ? "n.textContent='Preparing report';n.style.background='#2457d6';" : "n.textContent='Download failed';n.style.background='#c42020';"}setTimeout(()=>{n.textContent='Report ready';n.style.background='#1b7f4a';document.querySelector('[role=status]').textContent='Ready to download'},450)};`;
  } else if (id === 'FA-05') {
    content = `<h1>Billing summary</h1><label>Account label <input id="label" value="Acme"></label><button id="apply">Apply label</button><div class="billing"><div id="reference">Invoice reference edge</div><div id="total" aria-label="Invoice total"><strong>Total due</strong> $84.50</div><p id="account">Acme</p></div>`;
    script = `document.querySelector('#apply').onclick=()=>{const value=document.querySelector('#label').value;document.querySelector('#account').textContent=value;document.querySelector('#total').style.marginLeft=(${fixed ? '0' : 'value.length>25?12:0'})+'px'};`;
  } else if (id === 'FA-06') {
    content = `<h1>Attach receipt</h1><label>Choose receipt <input type="file" accept="image/*"></label><p>The reported issue concerns the operating system's file selection dialog.</p>`;
  } else {
    res.writeHead(404);
    res.end('Unknown evaluation page');
    return;
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><html lang="en"><head><title>Operations console</title><style>
    *{box-sizing:border-box}body{font:18px Arial,sans-serif;margin:0;background:#eef2f6;color:#182533}
    main{margin:110px auto 150px;padding:32px;width:900px;background:white;border:1px solid #a9b6c2;border-radius:8px}
    h1{margin:0 0 24px}button,input{font:inherit;padding:12px;margin:8px}button{background:#e4ecff;border:1px solid #526787;border-radius:4px;cursor:pointer}
    :focus-visible{outline:4px solid #bd5500;outline-offset:3px}a{display:inline-block;margin:16px}dialog{padding:30px;border:2px solid #526787}
    .action-wrap{position:relative;display:inline-block}.shield{position:absolute;inset:0;background:transparent}
    #notice{margin-top:28px;padding:18px;color:white;background:#2457d6;min-height:60px}output{display:block;margin:24px;padding:20px;border:2px solid #2457d6}
    .billing{margin-top:24px;padding:16px}#reference{border-left:3px solid #60758a;padding:10px}#total{width:400px;border:2px solid #2457d6;padding:14px}#account{max-width:650px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .private{font-size:14px;margin-top:30px;color:#576675}
  </style></head><body><main>${content}<p class="private">Account contact: <span data-private>heldout-canary@example.invalid</span></p></main><script>${script}</script></body></html>`);
});
server.listen(port, '127.0.0.1', () =>
  console.log(`Fresh-agent corpus http://127.0.0.1:${server.address().port}`),
);
