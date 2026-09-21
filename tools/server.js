#!/usr/bin/env node
/**
 * Pebble Server — real backend for auth + multi-device sync.
 *
 *   node tools/server.js [port]
 *
 * Features
 *   • POST /api/register   { user, pass }            -> { token }
 *   • POST /api/login      { user, pass }            -> { token }
 *   • GET  /api/me                                   -> { user }
 *   • GET  /api/sync                                 -> { data, rev, at }
 *   • POST /api/sync       { data }                  -> { rev, at }
 *   • WS   /ws?token=…     live push to every other device of the same user
 *   • GET  /api/health                               -> { ok, users, revs }
 *
 * Storage: JSON files under ./pebble-server-data/ (users.json + data/<user>.json)
 * Passwords: salted SHA-256 (crypto, no deps). Tokens: random 256-bit.
 * Zero npm dependencies — plain node:http + node:crypto.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.argv[2] || process.env.PORT || 8787);
const ROOT = path.join(__dirname, '..', 'pebble-server-data');
const USERS = path.join(ROOT, 'users.json');
const DATA = path.join(ROOT, 'data');

fs.mkdirSync(DATA, { recursive: true });
if (!fs.existsSync(USERS)) fs.writeFileSync(USERS, JSON.stringify({ users: {} }, null, 2));

const readJSON = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fb; } };
const writeJSON = (p, v) => { const t = p + '.tmp'; fs.writeFileSync(t, JSON.stringify(v, null, 2)); fs.renameSync(t, p); };

const hash = (pass, salt) => crypto.createHash('sha256').update(salt + ':' + pass).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('hex');

/* token -> { user, at } */
const sessions = new Map();

/* ---------------- websocket (tiny, dependency-free) ---------------- */
const sockets = new Set();   // { socket, user, send }
function attachWs(req, socket, head) {
  const url = new URL(req.url, 'http://x');
  if (url.pathname !== '/ws') return;
  const key = req.headers['sec-websocket-key'];
  const token = url.searchParams.get('token') || '';
  const sess = sessions.get(token);
  const magic = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
  const accept = crypto.createHash('sha1').update(key + magic).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  const conn = { socket, user: sess ? sess.user : null, send: obj => wsSend(socket, JSON.stringify(obj)) };
  sockets.add(conn);
  socket.on('data', buf => {
    // parse client frames (text only, masked)
    let i = 0;
    while (i < buf.length) {
      const b0 = buf[i], b1 = buf[i + 1];
      const op = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f; let off = i + 2;
      if (len === 126) { len = buf.readUInt16BE(off); off += 2; }
      else if (len === 127) { len = Number(buf.readBigUInt64BE(off)); off += 8; }
      let mask = null;
      if (masked) { mask = buf.slice(off, off + 4); off += 4; }
      let payload = buf.slice(off, off + len);
      if (mask) payload = Buffer.from(payload.map((b, k) => b ^ mask[k % 4]));
      if (op === 0x8) { socket.end(); sockets.delete(conn); return; }
      if (op === 0x1) {
        let msg; try { msg = JSON.parse(payload.toString()); } catch (e) { msg = null; }
        if (msg && msg.type === 'ping') conn.send({ type: 'pong' });
        if (msg && msg.type === 'sync' && conn.user) broadcast(conn.user, { type: 'sync-available', from: 'server', rev: msg.rev }, conn);
      }
      i = off + len;
    }
  });
  socket.on('close', () => sockets.delete(conn));
  socket.on('error', () => sockets.delete(conn));
}
function wsSend(socket, text) {
  const payload = Buffer.from(text);
  let header;
  if (payload.length < 126) header = Buffer.from([0x81, payload.length]);
  else if (payload.length < 65536) { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 126; header.writeUInt16BE(payload.length, 2); }
  else { header = Buffer.alloc(10); header[0] = 0x81; header[1] = 127; header.writeBigUInt64BE(BigInt(payload.length), 2); }
  try { socket.write(Buffer.concat([header, payload])); } catch (e) {}
}
function broadcast(user, obj, except) {
  for (const c of sockets) if (c !== except && c.user === user) c.send(obj);
}

/* ---------------- http ---------------- */
function body(req) {
  return new Promise(res => {
    let d = '';
    req.on('data', c => { d += c; if (d.length > 64 * 1024 * 1024) req.destroy(); });
    req.on('end', () => { try { res(JSON.parse(d || '{}')); } catch (e) { res({}); } });
  });
}
const send = (res, code, obj) => {
  const s = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  });
  res.end(s);
};
const authOf = req => {
  const h = req.headers['authorization'] || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  return sessions.get(t) || null;
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  if (req.method === 'OPTIONS') return send(res, 204, {});

  if (p === '/api/health') return send(res, 200, { ok: true, name: 'Pebble Server', version: '1.0.0', users: Object.keys(readJSON(USERS, { users: {} }).users).length, online: sockets.size });

  if (p === '/api/register' && req.method === 'POST') {
    const b = await body(req);
    const user = String(b.user || '').trim().toLowerCase();
    if (!user || !b.pass) return send(res, 400, { error: 'user and pass required' });
    const db = readJSON(USERS, { users: {} });
    if (db.users[user]) return send(res, 409, { error: 'user exists — log in instead' });
    const salt = crypto.randomBytes(8).toString('hex');
    db.users[user] = { salt, hash: hash(b.pass, salt), created: Date.now() };
    writeJSON(USERS, db);
    const token = newToken();
    sessions.set(token, { user, at: Date.now() });
    return send(res, 200, { token, user });
  }

  if (p === '/api/login' && req.method === 'POST') {
    const b = await body(req);
    const user = String(b.user || '').trim().toLowerCase();
    const db = readJSON(USERS, { users: {} });
    const rec = db.users[user];
    if (!rec || rec.hash !== hash(String(b.pass || ''), rec.salt)) return send(res, 401, { error: 'bad credentials' });
    const token = newToken();
    sessions.set(token, { user, at: Date.now() });
    return send(res, 200, { token, user });
  }

  if (p === '/api/me') {
    const s = authOf(req);
    if (!s) return send(res, 401, { error: 'not authenticated' });
    return send(res, 200, { user: s.user });
  }

  if (p === '/api/sync') {
    const s = authOf(req);
    if (!s) return send(res, 401, { error: 'not authenticated' });
    const file = path.join(DATA, s.user.replace(/[^a-z0-9_-]/g, '') + '.json');
    if (req.method === 'GET') {
      const cur = readJSON(file, null);
      return send(res, 200, cur || { data: null, rev: 0, at: 0 });
    }
    const b = await body(req);
    if (!b.data || typeof b.data !== 'object') return send(res, 400, { error: 'data object required' });
    const cur = readJSON(file, { rev: 0 });
    const next = { data: b.data, rev: (cur.rev || 0) + 1, at: Date.now(), user: s.user };
    writeJSON(file, next);
    broadcast(s.user, { type: 'sync-available', rev: next.rev });
    return send(res, 200, { rev: next.rev, at: next.at });
  }

  return send(res, 404, { error: 'not found' });
});
server.on('upgrade', attachWs);

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n  Pebble Server listening on http://0.0.0.0:' + PORT);
  console.log('  data dir : ' + ROOT);
  console.log('  connect  : Settings → Account & updates → Server URL = http://<this-machine>:' + PORT + '\n');
});
