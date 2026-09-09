import { createServer } from 'node:http';
createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1:3197');
  if (url.pathname === '/disconnect') return request.socket.destroy();
  if (url.pathname === '/failure') {
    response.writeHead(503);
    return response.end('Unavailable');
  }
  const fixed = url.searchParams.has('fixed');
  response.setHeader('Content-Type', 'text/html');
  response.end(`<!doctype html><link rel="icon" href="data:,"><style>body{font:32px sans-serif;padding:60px}</style><h1>Cart</h1><button>Checkout</button><script>
    document.querySelector('button').onclick=async()=>{
      ${
        fixed
          ? "document.querySelector('h1').textContent='Checkout';"
          : `
        console.error('Checkout failed for private@example.com');
        await Promise.allSettled([fetch('/failure?token=PRIVATE_QUERY_CANARY'),fetch('/disconnect?token=PRIVATE_QUERY_CANARY')]);
        document.querySelector('h1').textContent='Checkout unavailable';
        throw new Error('Checkout background error');
      `
      }
    };
  </script>`);
}).listen(3197, '127.0.0.1');
