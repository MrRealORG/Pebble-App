const fs = require('fs'); const path = require('path'); const http = require('http');
const { spawn } = require('child_process'); const WebSocket = require('ws');
const ROOT = path.join(__dirname, '..'); const WEB = path.join(ROOT, 'dist', 'web');
const PORT = 8131, CDP = 9341;
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css' };
const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
  const f = path.join(WEB, p);
  if (!fs.existsSync(f)) { res.writeHead(404); res.end('x'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
(async () => {
  await new Promise(r => server.listen(PORT, r));
  const chrome = spawn('/home/z/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
    ['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',`--remote-debugging-port=${CDP}`,'--window-size=1600,1000','about:blank'], { stdio:'ignore' });
  let targets = null;
  for (let i = 0; i < 40; i++) { await new Promise(r => setTimeout(r, 250));
    try { targets = JSON.parse(await new Promise((res,rej)=>{http.get(`http://127.0.0.1:${CDP}/json`,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(d));}).on('error',rej);})); if (targets.some(t=>t.type==='page')) break; } catch(e){} }
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 64*1024*1024 });
  await new Promise(r => ws.on('open', r));
  let id = 0; const pend = new Map();
  ws.on('message', m => { const d = JSON.parse(m); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } });
  const send = (method, params={}) => new Promise(res => { const i=++id; pend.set(i,res); ws.send(JSON.stringify({id:i,method,params})); });
  const ev = async (e) => { const r = await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true}); return r.result && r.result.result ? r.result.result.value : undefined; };
  const logs = [];
  await send('Runtime.enable');
  ws.on('message', m => { const d = JSON.parse(m);
    if (d.method === 'Runtime.consoleAPICalled' && (d.params.type === 'error' || d.params.type === 'warning'))
      logs.push(d.params.type + ': ' + d.params.args.map(a => a.value || a.description || '').join(' ').slice(0, 300));
    if (d.method === 'Runtime.exceptionThrown')
      logs.push('EXC: ' + (d.params.exceptionDetails.exception ? d.params.exceptionDetails.exception.description : d.params.exceptionDetails.text).slice(0, 300));
  });
  await send('Page.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html#/dashboard` });
  await new Promise(r => setTimeout(r, 2200));
  console.log('onboarded:', await ev(`NX.store.get('onboarded')`));
  console.log('ob-backdrop:', await ev(`!!document.querySelector('.ob-backdrop')`));
  console.log('start type:', await ev(`typeof NX.onboarding.start`));
  console.log('manual start:', await ev(`(function(){ try { NX.onboarding.start(); return 'ok:'+!!document.querySelector('.ob-card'); } catch(e){ return 'ERR: '+e.message; } })()`));
  console.log('console logs:', logs.slice(0,6).join('\n') || 'none');
  ws.close(); chrome.kill('SIGKILL'); server.close(); process.exit(0);
})().catch(e => { console.error('CRASH', e); process.exit(1); });
