import { createServer } from 'node:http';
createServer((request, response) => {
  const fixed = new URL(request.url, 'http://127.0.0.1:3196').searchParams.has(
    'fixed',
  );
  response.setHeader('Content-Type', 'text/html');
  response.end(`<!doctype html><link rel="icon" href="data:,"><style>body{font:30px sans-serif;padding:40px}#content{width:400px;height:200px;background:#008000}</style><h1>Ready</h1><button>Load</button><div id="content">Content</div><script>
    window.hadFlash=false;
    document.querySelector('button').onclick=()=>{
      const start=performance.now();
      function draw(now){const elapsed=now-start;document.querySelector('h1').textContent='Loading '+Math.round(elapsed);if(elapsed<300){${fixed ? '' : "window.hadFlash=true;document.querySelector('#content').style.background='#ff0000';"}requestAnimationFrame(draw)}else{document.querySelector('#content').style.background='#008000';document.querySelector('h1').textContent='Loaded'}}
      requestAnimationFrame(draw);
    };
  </script>`);
}).listen(3196, '127.0.0.1');
