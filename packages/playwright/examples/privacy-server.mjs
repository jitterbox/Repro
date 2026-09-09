import { createServer } from 'node:http';

createServer((request, response) => {
  const popup = new URL(request.url, 'http://localhost').searchParams.has(
    'popup',
  );
  response.setHeader('Content-Type', 'text/html');
  response.end(`<!doctype html><title>Moving privacy reference</title>
<style>body{margin:0;height:2000px;background:white;font:24px sans-serif}
#secret{position:absolute;left:${popup ? 100 : 80}px;top:${popup ? 260 : 200}px;width:600px;height:64px;box-sizing:border-box;font:32px sans-serif;background:white;color:black;border:2px solid black}
nav{position:fixed;left:24px;top:100px}button,a{font:20px sans-serif;margin:8px}</style>
<input id="secret" aria-label="Private contact" value="moving.canary@example.test" readonly>
${
  popup
    ? ''
    : `<nav><button id="move">Move field</button><button id="scroll">Scroll field</button><a href="/?popup=1" target="_blank">Open popup</a></nav>
<script>const field=document.querySelector('#secret');
document.querySelector('#move').onclick=()=>{const start=performance.now();function move(now){const progress=Math.min(1,(now-start)/700);field.style.left=(80+420*progress)+'px';field.style.top=(200+130*progress)+'px';if(progress<1)requestAnimationFrame(move)}requestAnimationFrame(move)};
document.querySelector('#scroll').onclick=()=>{field.style.top='1260px';window.scrollTo(0,1000)};</script>`
}`);
}).listen(3196, '127.0.0.1');
