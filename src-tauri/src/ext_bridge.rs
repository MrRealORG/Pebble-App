//! Local HTTP bridge (127.0.0.1:47615) for the Pebble Timeless Chrome
//! extension — v3.1 surface:
//!   GET  /api/health    → { ok, app, version }
//!   POST /api/timelens  → { sessions: [...] } queued for the renderer
//!   GET  /api/timelens  → today's extension sessions (for dashboards)
//!   POST /api/tasks     → { title, note }            → Tasks
//!   POST /api/notes     → { title, body }            → Notes
//!   POST /api/message   → { text, channel }          → Chat
//!   GET  /api/status    → { connected, lastSeen, queued }
//!   GET  /              → mini dashboard (openable from Chrome anywhere)
//! Queued items are drained by the renderer via drain_ext_queue().
//! The bridge also remembers exe paths seen in the foreground so real
//! app icons can be extracted later.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpListener;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{LazyLock, Mutex};

use tauri::Manager;

static QUEUE: Mutex<Vec<serde_json::Value>> = Mutex::new(Vec::new());
static SEEN_SESSIONS: Mutex<Vec<serde_json::Value>> = Mutex::new(Vec::new());
static LAST_SEEN: AtomicU64 = AtomicU64::new(0);
static EXT_SESSIONS_TODAY: AtomicUsize = AtomicUsize::new(0);
static EXT_DAY: AtomicU64 = AtomicU64::new(0);
static EXE_MAP: LazyLock<Mutex<HashMap<String, String>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static APP: Mutex<Option<tauri::AppHandle>> = Mutex::new(None);

pub fn set_app(handle: tauri::AppHandle) {
    if let Ok(mut g) = APP.lock() {
        *g = Some(handle);
    }
}

fn show_main_window() {
    if let Ok(g) = APP.lock() {
        if let Some(app) = g.as_ref() {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }
    }
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn today_stamp() -> u64 {
    now_secs() / 86400
}

pub fn remember_exe(name: String, path: String) {
    if let Ok(mut m) = EXE_MAP.lock() {
        m.insert(name.to_lowercase(), path);
        if m.len() > 400 {
            m.clear(); // cheap bound; rebuilt quickly from live usage
        }
    }
}

pub fn lookup_exe(name: &str) -> Option<String> {
    EXE_MAP
        .lock()
        .ok()?
        .get(&name.trim().to_lowercase())
        .cloned()
}

pub fn drain() -> Vec<serde_json::Value> {
    match QUEUE.lock() {
        Ok(mut q) => std::mem::take(&mut *q),
        Err(_) => Vec::new(),
    }
}

pub fn last_seen() -> u64 {
    LAST_SEEN.load(Ordering::Relaxed)
}

pub fn queued() -> usize {
    QUEUE.lock().map(|q| q.len()).unwrap_or(0)
}

pub fn ext_sessions_today() -> usize {
    if EXT_DAY.load(Ordering::Relaxed) != today_stamp() {
        EXT_DAY.store(today_stamp(), Ordering::Relaxed);
        EXT_SESSIONS_TODAY.store(0, Ordering::Relaxed);
    }
    EXT_SESSIONS_TODAY.load(Ordering::Relaxed)
}

fn touch() {
    LAST_SEEN.store(now_secs(), Ordering::Relaxed);
}

fn push_queue(v: serde_json::Value) {
    if let Ok(mut q) = QUEUE.lock() {
        q.push(v);
        let len = q.len();
        if len > 600 {
            q.drain(0..len - 600);
        }
    }
}

fn remember_sessions(sessions: &[serde_json::Value]) {
    if let Ok(mut seen) = SEEN_SESSIONS.lock() {
        for s in sessions {
            if let Some(id) = s.get("id").and_then(|v| v.as_str()) {
                if !seen.iter().any(|x| x.get("id").and_then(|v| v.as_str()) == Some(id)) {
                    seen.push(s.clone());
                }
            }
        }
        let len = seen.len();
        if len > 800 {
            seen.drain(0..len - 800);
        }
    }
    EXT_SESSIONS_TODAY.fetch_add(sessions.len(), Ordering::Relaxed);
}

fn json_response(body: String) -> Vec<u8> {
    format!(
        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: content-type, authorization\r\nConnection: close\r\nContent-Length: {}\r\n\r\n",
        body.len()
    )
    .into_bytes()
}

fn html_response(body: String) -> Vec<u8> {
    format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\nContent-Length: {}\r\n\r\n",
        body.len()
    )
    .into_bytes()
}

fn dashboard_html(status: &serde_json::Value) -> String {
    let queued = status.get("queued").and_then(|v| v.as_u64()).unwrap_or(0);
    let sessions = status.get("extSessions").and_then(|v| v.as_u64()).unwrap_or(0);
    let connected = status.get("connected").and_then(|v| v.as_bool()).unwrap_or(false);
    let (dot, label) = if connected { ("#4caf7d", "connected") } else { ("#9aa0a6", "waiting for the browser") };
    let seen = SEEN_SESSIONS
        .lock()
        .map(|s| {
            s.iter()
                .rev()
                .take(12)
                .map(|x| {
                    let app = x.get("app").and_then(|v| v.as_str()).unwrap_or("?");
                    let secs = x.get("secs").and_then(|v| v.as_f64()).unwrap_or(0.0);
                    format!("<li><b>{}</b> — {}s</li>", html_esc(app), secs as u64)
                })
                .collect::<String>()
        })
        .unwrap_or_default();
    format!(
        "<!doctype html><html><head><meta charset='utf-8'><title>Pebble — Timeless bridge</title>\
<style>body{{font-family:Segoe UI,system-ui,sans-serif;background:#f4f2ee;color:#1d1c1a;display:flex;justify-content:center;padding:48px 16px;margin:0}}\
.card{{background:#fff;border-radius:20px;box-shadow:0 6px 24px rgba(29,28,26,.08);padding:28px 30px;max-width:560px;width:100%}}\
h1{{margin:0 0 4px;font-size:22px}}.sub{{color:#6d6a64;font-size:13px;margin-bottom:18px}}\
.row{{display:flex;align-items:center;gap:10px;margin:10px 0}}.dot{{width:10px;height:10px;border-radius:99px;background:{dot}}}\
.stat{{background:#f6f5f3;border-radius:14px;padding:14px 16px;margin:8px 0}}b.stat-n{{font-size:20px}}\
ul{{margin:8px 0 0;padding-left:18px;font-size:13px;color:#454239}}a{{color:#4a8f3c}}</style></head><body><div class='card'>\
<h1>⏱ PebbleX Timeless</h1><div class='sub'>local bridge on 127.0.0.1:47615 · v{ver}</div>\
<div class='row'><span class='dot'></span> {label}</div>\
<div class='stat'><b class='stat-n'>{sessions}</b> sessions streamed from the browser today</div>\
<div class='stat'><b class='stat-n'>{queued}</b> items waiting to sync into the app (tasks, notes, messages)</div>\
<div style='font-size:13px;color:#6d6a64;margin-top:10px'>Recent browser activity:</div><ul>{seen}</ul>\
<div style='margin-top:16px;font-size:13px;color:#6d6a64'>Open the full PebbleX app to see the complete Timeless dashboard.</div>\
</div></body></html>",
        dot = dot,
        label = label,
        ver = env!("CARGO_PKG_VERSION"),
        sessions = sessions,
        queued = queued,
        seen = seen
    )
}

fn html_esc(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
}

pub fn spawn_bridge() {
    std::thread::spawn(|| {
        let listener = match TcpListener::bind("127.0.0.1:47615") {
            Ok(l) => l,
            Err(_) => return, // port busy → another Pebble instance owns the bridge
        };
        for stream in listener.incoming() {
            let Ok(mut stream) = stream else { continue };
            std::thread::spawn(move || {
                let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(3)));
                let _ = stream.set_write_timeout(Some(std::time::Duration::from_secs(3)));
                let mut reader = BufReader::new(match stream.try_clone() {
                    Ok(s) => s,
                    Err(_) => return,
                });
                let mut line = String::new();
                if reader.read_line(&mut line).is_err() {
                    return;
                }
                if line.starts_with("OPTIONS") {
                    let resp = "HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: content-type, authorization\r\nConnection: close\r\n\r\n";
                    let _ = stream.write_all(resp.as_bytes());
                    return;
                }
                // headers
                let mut content_len = 0usize;
                loop {
                    let mut h = String::new();
                    if reader.read_line(&mut h).is_err() || h.trim().is_empty() {
                        break;
                    }
                    let lower = h.to_lowercase();
                    if lower.starts_with("content-length:") {
                        content_len = lower
                            .split(':')
                            .nth(1)
                            .and_then(|v| v.trim().parse().ok())
                            .unwrap_or(0);
                    }
                }
                let mut body = vec![0u8; content_len.min(256 * 1024)];
                if content_len > 0 && reader.read_exact(&mut body).is_err() {
                    return;
                }

            // any /api call counts as a heartbeat from the extension
            if line.contains("/api/") {
                touch();
            }

            if line.starts_with("GET /api/health") {
                let b = serde_json::json!({ "ok": true, "app": "PebbleX", "version": env!("CARGO_PKG_VERSION") });
                let _ = stream.write_all(&json_response(b.to_string()));
                return;
            }

            // second-instance / extension → bring PebbleX to the front
            if line.starts_with("GET /api/show") {
                show_main_window();
                let _ = stream.write_all(&json_response("{\"ok\":true}".into()));
                return;
            }

            if line.starts_with("GET /api/status") {
                let now = now_secs();
                let last = last_seen();
                let b = serde_json::json!({
                    "connected": now.saturating_sub(last) < 300,
                    "lastSeen": last,
                    "queued": queued(),
                    "extSessions": ext_sessions_today(),
                    "app": "PebbleX"
                });
                let _ = stream.write_all(&json_response(b.to_string()));
                return;
            }

            if line.starts_with("POST /api/timelens") {
                if let Ok(v) = serde_json::from_slice::<serde_json::Value>(&body) {
                    let sessions = v
                        .get("sessions")
                        .and_then(|s| s.as_array())
                        .cloned()
                        .unwrap_or_default();
                    remember_sessions(&sessions);
                    push_queue(serde_json::json!({ "kind": "session", "sessions": sessions }));
                }
                let _ = stream.write_all(&json_response("{\"ok\":true}".into()));
                return;
            }

            if line.starts_with("GET /api/timelens") {
                let seen = SEEN_SESSIONS
                    .lock()
                    .map(|s| serde_json::Value::Array(s.clone()))
                    .unwrap_or(serde_json::Value::Array(vec![]));
                let b = serde_json::json!({ "ok": true, "sessions": seen });
                let _ = stream.write_all(&json_response(b.to_string()));
                return;
            }

            if line.starts_with("POST /api/tasks") {
                if let Ok(v) = serde_json::from_slice::<serde_json::Value>(&body) {
                    push_queue(serde_json::json!({
                        "kind": "task",
                        "payload": { "title": v.get("title").cloned().unwrap_or(serde_json::json!("Task from browser")).as_str().unwrap_or("Task").to_string(), "note": v.get("note").and_then(|x| x.as_str()).unwrap_or("").to_string() }
                    }));
                }
                let _ = stream.write_all(&json_response("{\"ok\":true}".into()));
                return;
            }

            if line.starts_with("POST /api/notes") {
                if let Ok(v) = serde_json::from_slice::<serde_json::Value>(&body) {
                    push_queue(serde_json::json!({
                        "kind": "note",
                        "payload": {
                            "title": v.get("title").and_then(|x| x.as_str()).unwrap_or("Quick note").to_string(),
                            "body": v.get("body").and_then(|x| x.as_str()).unwrap_or("").to_string()
                        }
                    }));
                }
                let _ = stream.write_all(&json_response("{\"ok\":true}".into()));
                return;
            }

            if line.starts_with("POST /api/prompts") {
                if let Ok(v) = serde_json::from_slice::<serde_json::Value>(&body) {
                    push_queue(serde_json::json!({
                        "kind": "prompt",
                        "payload": {
                            "title": v.get("title").and_then(|x| x.as_str()).unwrap_or("Prompt").to_string(),
                            "body": v.get("body").and_then(|x| x.as_str()).unwrap_or("").to_string()
                        }
                    }));
                }
                let _ = stream.write_all(&json_response("{\"ok\":true}".into()));
                return;
            }

            if line.starts_with("POST /api/message") {
                if let Ok(v) = serde_json::from_slice::<serde_json::Value>(&body) {
                    push_queue(serde_json::json!({
                        "kind": "message",
                        "payload": {
                            "text": v.get("text").and_then(|x| x.as_str()).unwrap_or("").to_string(),
                            "channel": v.get("channel").and_then(|x| x.as_str()).unwrap_or("general").to_string()
                        }
                    }));
                }
                let _ = stream.write_all(&json_response("{\"ok\":true}".into()));
                return;
            }

            if line.starts_with("GET / ") || line.starts_with("GET /index") || line.starts_with("GET /dashboard") {
                let status = serde_json::json!({
                    "queued": queued(),
                    "extSessions": ext_sessions_today(),
                    "connected": now_secs().saturating_sub(last_seen()) < 300
                });
                let _ = stream.write_all(&html_response(dashboard_html(&status)));
                return;
            }

            let resp = "HTTP/1.1 404 Not Found\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\nContent-Length: 0\r\n\r\n";
            let _ = stream.write_all(resp.as_bytes());
            });
        }
    });
}
