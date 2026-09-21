#!/usr/bin/env node
/** Tiny static server for the web build:  npm run web  ->  http://localhost:8080 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'dist', 'web');
const PORT = process.env.PORT || 8080;
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.txt': 'text/plain', '.md': 'text/markdown' };

if (!fs.existsSync(ROOT)) {
  console.error('\n  dist/web not found. Run:  npm run build\n');
  process.exit(1);
}

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('404 — not found');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => {
  console.log(`\n  NexaDesk web build  ->  http://localhost:${PORT}\n  (Ctrl+C to stop)\n`);
});
