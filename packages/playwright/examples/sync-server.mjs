import { createServer } from 'node:http';
createServer((request, response) => {
  const fixed = new URL(request.url, 'http://localhost').searchParams.has(
    'fixed',
  );
  response.setHeader('Content-Type', 'text/html');
  response.end(`<!doctype html><title>Uneven sequence</title>
<style>body{margin:24px;font:24px sans-serif}button{font:20px sans-serif;margin-right:12px}#state{position:absolute;left:0;top:160px;width:1280px;height:480px;background:rgb(255,0,0)}</style>
<h1>Pending</h1><button data-color="blue">Begin</button><button data-color="green">Continue</button><button data-color="red">Finish</button><div id="state" data-testid="state"></div>
<script>const delays=${JSON.stringify(fixed ? { blue: 950, green: 180, red: 600 } : { blue: 160, green: 1100, red: 220 })};
const colors={blue:'rgb(0,0,255)',green:'rgb(0,255,0)',red:'rgb(255,0,0)'};
for(const button of document.querySelectorAll('button'))button.onclick=()=>{
  const color=button.dataset.color;
  setTimeout(()=>{document.querySelector('#state').style.background=colors[color];
    if(color==='red'&&${String(fixed)})document.querySelector('h1').textContent='Complete';
  },delays[color]);
};</script>`);
}).listen(3195, '127.0.0.1');
