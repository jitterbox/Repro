import { createServer } from 'node:http';
createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  res.setHeader('Content-Type', 'text/html');
  res.end(
    `<!doctype html><title>Repro acceptance fixture</title><style>body{font:24px sans-serif;margin:80px}button{position:relative;margin-left:${Number(u.searchParams.get('dx') ?? 0)}px;width:180px;height:60px}#obstruction{position:absolute;left:80px;top:80px;width:180px;height:60px;opacity:0;z-index:10}</style><button id="checkout">Checkout</button>${u.searchParams.has('fixed') ? '' : '<div id="obstruction"></div>'}<h1>Cart</h1><script>document.querySelector('button').onclick=()=>document.querySelector('h1').textContent='Checkout';</script>`,
  );
}).listen(3198, '127.0.0.1');
