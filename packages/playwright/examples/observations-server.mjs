import { createServer } from 'node:http';
createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:3191');
  if (url.pathname === '/checkout') {
    res.writeHead(url.searchParams.has('fixed') ? 200 : 503);
    return res.end('result');
  }
  res.setHeader('Content-Type', 'text/html');
  res.end(`<!doctype html><link rel="icon" href="data:,"><style>body{font:24px sans-serif;padding:48px}</style>
  <h1>Cart</h1><button id="load">Checkout</button><button id="hide">Hide status</button><button id="duplicate">Duplicate status</button><button id="remove">Remove status</button>
  <script>
  load.onclick=async()=>{
    const response=await fetch('/checkout?secret=PRIVATE_NETWORK_CANARY${url.searchParams.has('fixed') ? '&fixed=1' : ''}');
    const status=document.createElement('p');status.className='status';status.textContent=response.ok?'Checkout ready':'Checkout failed';document.body.append(status);
  };
  hide.onclick=()=>document.querySelectorAll('.status').forEach(e=>e.hidden=true);
  duplicate.onclick=()=>document.body.append(document.querySelector('.status').cloneNode(true));
  remove.onclick=()=>document.querySelectorAll('.status').forEach(e=>e.remove());
  </script>`);
}).listen(3191, '127.0.0.1');
