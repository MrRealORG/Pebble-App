const fs = require('fs'); const path = require('path'); const http = require('http');
const { spawn } = require('child_process'); const WebSocket = require('ws');
const ROOT = path.join(__dirname, '..'); const WEB = path.join(ROOT, 'dist', 'web');
const PORT = 8132, CDP = 9342;
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
  await send('Page.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html?ai=1#/login` });
  await new Promise(r => setTimeout(r, 1500));
  await ev(`NX.store.set('session',{authed:true,at:Date.now()}); NX.store.set('onboarded', true); undefined`);
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html?ai=2#/ai` });
  await new Promise(r => setTimeout(r, 1800));
  await ev(`document.querySelector('#ai-input').value = 'What are my open tasks today?'; undefined`);
  await ev(`document.querySelector('#ai-send').click(); undefined`);
  await new Promise(r => setTimeout(r, 25000));
  const bubbles = await ev(`Array.from(document.querySelectorAll('.ai-msg.ai .am-bubble')).map(b=>b.textContent.slice(0,400))`);
  const pill = await ev(`document.querySelector('#ai-state') ? document.querySelector('#ai-state').textContent : 'gone'`);
  console.log('STATE PILL:', pill);
  console.log('LAST AI BUBBLE:', Array.isArray(bubbles) ? bubbles[bubbles.length-1] : bubbles);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('/home/z/my-project/shots32/ai-live-answer.png', Buffer.from(shot.result.data, 'base64'));
  ws.close(); chrome.kill('SIGKILL'); server.close(); process.exit(0);
})().catch(e => { console.error('CRASH', e); process.exit(1); });
