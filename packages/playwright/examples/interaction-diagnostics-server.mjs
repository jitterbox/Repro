import { createServer } from 'node:http';
createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1:3193');
  response.setHeader('Content-Type', 'text/html');
  if (url.pathname === '/child') {
    response.end(
      '<style>body{margin:20px}button{width:180px;height:60px}</style><button id="checkout">Checkout</button><script>document.querySelector("button").onclick=()=>parent.document.querySelector("h1").textContent="Checkout"</script>',
    );
    return;
  }
  const mode = url.searchParams.get('case');
  response.end(
    `<!doctype html><title>Interaction diagnostics</title><link rel="icon" href="data:,"><style>body{font:24px sans-serif;margin:80px}${mode === 'scroll' ? 'main{margin-top:1400px}' : ''}button{width:180px;height:60px}#overlay{position:absolute;left:80px;top:80px;width:180px;height:60px;opacity:0;pointer-events:none;z-index:10}iframe{width:400px;height:180px}</style><main>${mode === 'absent' ? '' : mode === 'frame' ? '<iframe src="/child" title="Checkout frame"></iframe>' : '<button id="checkout">Checkout</button>'}${mode === 'passthrough' ? '<div id="overlay"></div>' : ''}<h1>Cart</h1></main><script>const button=document.querySelector('button');if(button)button.onclick=()=>document.querySelector('h1').textContent='Checkout';</script>`,
  );
}).listen(3193, '127.0.0.1');
