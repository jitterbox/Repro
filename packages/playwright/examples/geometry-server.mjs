import { createServer } from 'node:http';
createServer((request, response) => {
  const fixed = new URL(request.url, 'http://127.0.0.1:3194').searchParams.has(
    'fixed',
  );
  response.setHeader('Content-Type', 'text/html');
  response.end(
    `<!doctype html><link rel="icon" href="data:,"><style>body{font:30px sans-serif;padding:40px}#content{width:400px;height:200px;background:#008000}</style><h1>Ready</h1><button>Load</button><div id="content">Content</div><script>document.querySelector('button').onclick=()=>{document.querySelector('#content').style.marginLeft='${fixed ? 0 : 12}px';document.querySelector('h1').textContent='Loaded'};</script>`,
  );
}).listen(3194, '127.0.0.1');
