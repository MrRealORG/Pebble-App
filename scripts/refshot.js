const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const WebSocket = require('ws');
const PORT = 9555;
const getJSON = u => new Promise((res, rej) => http.get(u, r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>{try{res(JSON.parse(d))}catch(e){rej(e)}}); }).on('error', rej));
(async () => {
  const chrome = spawn('chromium', ['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--hide-scrollbars',
    '--window-size=1600,1000', `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 3500));
  const list = await getJSON(`http://127.0.0.1:${PORT}/json/list`);
  const page = list.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 300*1024*1024 });
  await new Promise(r => ws.on('open', r));
  let id = 0; const pending = new Map();
  ws.on('message', raw => { let m; try { m = JSON.parse(raw); } catch(e){return;} if (m.id && pending.has(m.id)) { const {res,rej}=pending.get(m.id); pending.delete(m.id); m.error?rej(new Error(JSON.stringify(m.error))):res(m.result); } });
  const cdp = (method, params) => new Promise((res,rej)=>{ const i=++id; pending.set(i,{res,rej}); ws.send(JSON.stringify({id:i,method,params:params||{}})); setTimeout(()=>{if(pending.has(i)){pending.delete(i);rej(new Error('timeout '+method))}},45000); });
  await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 2, mobile: false });
  for (const [name, url] of [['ref-dash', 'https://nazday-elera.vercel.app/dashboard'], ['ref-root', 'https://nazday-elera.vercel.app/'], ['ref-login', 'https://nazday-elera.vercel.app/login']]) {
    try {
      await cdp('Page.navigate', { url });
      await new Promise(r => setTimeout(r, 6000));
      const shot = await cdp('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(require('path').join(__dirname, '..', 'docs', 'ref', name + '.png'), Buffer.from(shot.data, 'base64'));
      console.log('shot', name);
    } catch (e) { console.log('fail', name, e.message.slice(0,80)); }
  }
  ws.close(); chrome.kill('SIGKILL'); process.exit(0);
})();
