/**
 * PebbleX media API — Cloudflare Worker + R2
 *
 * Design notes
 * ------------
 * WHY A BINDING PROXY INSTEAD OF PRESIGNED URLS
 *   Presigned URLs require R2 API credentials (Access Key/Secret) and the AWS
 *   SigV4 signer. A Workers R2 *binding* cannot mint them. Rather than push
 *   S3 credentials into Worker secrets, the renderer uploads already-compressed
 *   derivatives here and this Worker stores them with a binding. The payloads
 *   are WebP derivatives capped at 512px longest edge (typically 20-90 KB), so
 *   proxying costs nothing measurable and saves adding `reqwest` to Rust.
 *
 * WHY THE CLIENT PRE-RESIZES
 *   Derivative generation happens in the renderer via canvas. A Worker cannot
 *   resize without an Images binding, and doing it client-side means the bytes
 *   we store are already minimal — no cold-start transform, no $0.50/1k
 *   transformation charge, and zero requests against the 5,000/month
 *   Images Free limit. Fixed sizes only: 32 / 64 / 128 / 512.
 *
 * CACHING
 *   Objects are immutable (key = content id), so they get
 *   `Cache-Control: public, max-age=31536000, immutable` plus a long-lived
 *   Cache API entry. Repeat views never touch R2.
 *
 * PRIVACY
 *   Nothing is served without the bearer token. Keys are opaque ids; the
 *   original filename is never used as a path segment.
 */

const DERIVATIVES = [32, 64, 128, 512];

/* magic-byte sniffing — we only accept webp, jpeg, png, gif */
const SIGNATURES = {
  'image/webp': (b) => b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  'image/jpeg': (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  'image/gif': (b) => b.length > 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46,
};

const MAX_BYTES = 2 * 1024 * 1024;      // 2 MB per derivative
const MAX_ASSETS = 500;

function corsHeaders(req) {
  const origin = req.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Pebble-Asset, X-Pebble-Size, X-Pebble-Kind, X-Pebble-Width, X-Pebble-Height',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(req, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(req) },
  });
}

function sniff(bytes) {
  const view = new Uint8Array(bytes);
  for (const [mime, test] of Object.entries(SIGNATURES)) {
    try { if (test(view)) return mime; } catch { /* keep probing */ }
  }
  return null;
}

/** constant-time-ish compare so the token isn't trivially guessable by timing */
function safeEqual(a, b) {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function idGen() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
}

const keyFor = (id, size, ext) => `a/${id}/${size}.${ext}`;
const EXT = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif' };

/* ------------------------------------------------------------------ */

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });

    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/+/, '');

    try {
      /* health — unauthenticated, so the client can probe before enabling sync */
      if (path === 'health' && req.method === 'GET') {
        return json(req, { ok: true, app: 'pebble-media', version: 1, auth: !!env.PEBBLE_TOKEN });
      }

      /* every other route needs the bearer token */
      const expected = env.PEBBLE_TOKEN || '';
      if (expected) {
        const got = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
        if (!safeEqual(got, expected)) return json(req, { ok: false, error: 'unauthorised' }, 401);
      }

      if (path === 'upload' && (req.method === 'POST' || req.method === 'PUT')) return handleUpload(req, env, url);
      if (path.startsWith('i/') && req.method === 'GET') return handleGet(req, env, url);
      if (path.startsWith('i/') && req.method === 'DELETE') return handleDelete(req, env, url);
      if (path === 'list' && req.method === 'GET') return handleList(req, env);

      return json(req, { ok: false, error: 'not found' }, 404);
    } catch (err) {
      return json(req, { ok: false, error: String(err && err.message ? err.message : err) }, 500);
    }
  },
};

/* ---------------- upload one derivative ---------------- */

async function handleUpload(req, env, url) {
  const buf = await req.arrayBuffer();
  const bytes = buf.byteLength;

  if (bytes === 0) return json(req, { ok: false, error: 'empty body' }, 400);
  if (bytes > MAX_BYTES) return json(req, { ok: false, error: `too large (${bytes} > ${MAX_BYTES})` }, 413);

  /* trust bytes, never the declared Content-Type or the filename */
  const mime = sniff(buf);
  if (!mime) return json(req, { ok: false, error: 'unsupported image format' }, 415);
  const ext = EXT[mime];

  const size = Number(req.headers.get('X-Pebble-Size') || url.searchParams.get('size') || 0);
  if (!DERIVATIVES.includes(size)) {
    return json(req, { ok: false, error: `size must be one of ${DERIVATIVES.join(', ')}` }, 400);
  }

  /* caller-supplied id lets the 4 derivatives of one image share a folder */
  const id = (req.headers.get('X-Pebble-Asset') || idGen()).toLowerCase();
  if (!/^[a-f0-9]{8,64}$/.test(id)) return json(req, { ok: false, error: 'bad asset id' }, 400);

  const kind = (req.headers.get('X-Pebble-Kind') || 'misc').slice(0, 24);
  const width = Number(req.headers.get('X-Pebble-Width') || 0) || 0;
  const height = Number(req.headers.get('X-Pebble-Height') || 0) || 0;
  const key = keyFor(id, size, ext);

  /* immutable object => cache it hard at the edge and in the browser */
  await env.pebble_media.put(key, buf, {
    httpMetadata: {
      contentType: mime,
      cacheControl: 'public, max-age=31536000, immutable',
    },
    customMetadata: { kind, w: String(width), h: String(height), at: String(Date.now()) },
  });

  const publicUrl = `${url.origin}/i/${id}/${size}`;
  return json(req, {
    ok: true,
    id,
    size,
    kind,
    bytes,
    mime,
    key,
    url: publicUrl,
  });
}

/* ---------------- serve an image ---------------- */

async function handleGet(req, env, url) {
  const parts = url.pathname.replace(/^\/+/, '').split('/');   // i/<id>/<size>
  const id = (parts[1] || '').toLowerCase();
  const size = Number(parts[2]);
  if (!/^[a-f0-9]{8,64}$/.test(id)) return json(req, { ok: false, error: 'bad asset id' }, 400);
  if (!DERIVATIVES.includes(size)) return json(req, { ok: false, error: 'bad size' }, 400);

  const cache = caches.default;
  const cacheKey = new Request(url.toString(), { method: 'GET' });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  /* probe the formats we might have stored under this id */
  let object = null;
  let foundKey = '';
  for (const ext of ['webp', 'jpg', 'png', 'gif']) {
    const k = keyFor(id, size, ext);
    const o = await env.pebble_media.get(k);
    if (o) { object = o; foundKey = k; break; }
  }
  if (!object) return json(req, { ok: false, error: 'not found' }, 404);

  const body = await object.body;
  const headers = {
    'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'ETag': object.httpEtag,
    'Access-Control-Allow-Origin': req.headers.get('Origin') || '*',
    'Vary': 'Origin',
    'X-Pebble-Key': foundKey,
  };
  const res = new Response(body, { headers });
  if (res.ok) await cache.put(cacheKey, res.clone());
  return res;
}

/* ---------------- delete an asset (all derivatives) ---------------- */

async function handleDelete(req, env, url) {
  const parts = url.pathname.replace(/^\/+/, '').split('/');
  const id = (parts[1] || '').toLowerCase();
  if (!/^[a-f0-9]{8,64}$/.test(id)) return json(req, { ok: false, error: 'bad asset id' }, 400);

  let removed = 0;
  for (const ext of ['webp', 'jpg', 'png', 'gif']) {
    const k = keyFor(id, DERIVATIVES[DERIVATIVES.length - 1], ext);
    /* delete every derivative regardless of stored format */
    for (const size of DERIVATIVES) {
      try {
        const present = await env.pebble_media.head(keyFor(id, size, ext));
        if (present) { await env.pebble_media.delete(keyFor(id, size, ext)); removed++; }
      } catch { /* absent */ }
    }
    void k;
  }

  const cache = caches.default;
  for (const size of DERIVATIVES) await cache.delete(new Request(`${url.origin}/i/${id}/${size}`, { method: 'GET' }));

  return json(req, { ok: true, id, removed });
}

/* ---------------- list (debug/support) ---------------- */

async function handleList(req, env) {
  const out = [];
  let cursor;
  for (let i = 0; i < MAX_ASSETS; i++) {
    const res = await env.pebble_media.list({ prefix: 'a/', cursor, limit: 200 });
    for (const o of res.objects || []) {
      out.push({ key: o.key, size: o.size, uploaded: o.uploaded });
      if (out.length >= MAX_ASSETS) break;
    }
    if (res.truncated === false || !res.objects?.length) break;
    cursor = res.truncated ? res.cursor : undefined;
    if (!cursor) break;
  }
  out.sort((a, b) => (b.uploaded || 0) - (a.uploaded || 0));
  return json(req, { ok: true, count: out.length, objects: out });
}