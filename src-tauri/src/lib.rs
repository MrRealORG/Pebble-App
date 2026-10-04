//! PebbleX v0.1 — Tauri backend
//! Whole-doc storage, bulletproof login→main handoff (close login = quit),
//! single-instance guard, native notifications, screenshots (xcap),
//! clipboard (+image), active-window tracking with real app-icon
//! extraction (Win32), REAL notes vault (.md files + folders on disk),
//! .md import picker, desktop widget, crash logs, and the local HTTP
//! bridge for the Chrome extension (Timeless + tasks/notes/messages).

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::fs;
use std::io::Write as _;
use std::path::PathBuf;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

mod assets;
mod ext_bridge;
mod sysctl;

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
static AUTHED: AtomicBool = AtomicBool::new(false);

/* ----------------------------------------------------------
   single-instance guard — second launch focuses the first
---------------------------------------------------------- */

#[cfg(windows)]
fn single_instance_guard() -> bool {
    use windows_sys::Win32::Foundation::{GetLastError, ERROR_ALREADY_EXISTS};
    use windows_sys::Win32::System::Threading::CreateMutexW;
    unsafe {
        let mut name: Vec<u16> = "Local\\PebbleX_App_Instance_Mutex".encode_utf16().collect();
        name.push(0);
        let handle = CreateMutexW(std::ptr::null(), 0, name.as_ptr());
        if (handle as usize) == 0 {
            return true;
        }
        if GetLastError() == ERROR_ALREADY_EXISTS {
            return false;
        }
        std::mem::forget(handle);
        true
    }
}

#[cfg(not(windows))]
fn single_instance_guard() -> bool {
    use std::net::TcpListener;
    match TcpListener::bind("127.0.0.1:47816") {
        Ok(l) => {
            // hold the port open for the lifetime of the process
            std::mem::forget(l);
            true
        }
        Err(_) => false,
    }
}

fn poke_first_instance() {
    use std::io::Write as _;
    if let Ok(mut s) = std::net::TcpStream::connect("127.0.0.1:47615") {
        let _ = s.write_all(
            b"GET /api/show HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n",
        );
        let _ = s.flush();
    }
}

/* ----------------------------------------------------------
   data dir helpers
---------------------------------------------------------- */

pub(crate) fn data_dir() -> PathBuf {
    dirs::data_dir()
        .or_else(dirs::home_dir)
        .unwrap_or_else(|| PathBuf::from("."))
        .join("pebble")
}

fn workspace_file() -> PathBuf {
    data_dir().join("workspace.json")
}

fn settings_file() -> PathBuf {
    data_dir().join("settings.json")
}

fn crash_dir() -> PathBuf {
    data_dir().join("crashes")
}

fn icons_dir() -> PathBuf {
    data_dir().join("icons")
}

fn atomic_write(path: &PathBuf, bytes: &[u8]) {
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    // Every window (main, login, widget) mirrors the workspace independently, so
    // a single shared temp filename had them clobbering each other: one window
    // could rename another's half-written file into place, and the Windows
    // copy-fallback could read a truncated temp. Give each write its own name so
    // the rename is the only thing that touches the real file.
    static SEQ: AtomicU64 = AtomicU64::new(0);
    let seq = SEQ.fetch_add(1, Ordering::Relaxed);
    let tmp = path.with_extension(format!("tmp.{}.{}", std::process::id(), seq));
    if let Ok(mut f) = fs::File::create(&tmp) {
        let _ = f.write_all(bytes);
        let _ = f.sync_all();
    } else {
        return;
    }
    if fs::rename(&tmp, path).is_err() {
        // Fallback for Windows file locks
        if fs::copy(&tmp, path).is_ok() {
            let _ = fs::remove_file(&tmp);
        } else {
            let _ = fs::remove_file(&tmp);
        }
    }
}

/* ----------------------------------------------------------
   storage backend (whole-doc JSON, v10 store shape)
---------------------------------------------------------- */

fn read_doc(path: &PathBuf) -> Option<serde_json::Value> {
    let raw = fs::read_to_string(path).ok()?;
    serde_json::from_str::<serde_json::Value>(&raw).ok()
}

/// Read the whole workspace back.
///
/// Async because every window calls this during boot — main, login and widget
/// all boot at once — and a sync command parses the document on the UI thread,
/// delaying the first paint of each one.
#[tauri::command]
async fn load_workspace() -> String {
    match read_doc(&workspace_file()) {
        Some(v) => {
            // migrate v3.0 key-value store: { workspace: {doc}, settings: {...} }
            let is_doc = v.get("notes").is_some() || v.get("chat").is_some() || v.get("timelens").is_some();
            if !is_doc {
                if let Some(ws) = v.get("workspace") {
                    if ws.get("notes").is_some() || ws.get("chat").is_some() {
                        return serde_json::to_string(ws).unwrap_or_else(|_| "null".into());
                    }
                }
                return "null".into();
            }
            serde_json::to_string(&v).unwrap_or_else(|_| "null".into())
        }
        None => "null".into(),
    }
}

/// Persist the whole workspace.
///
/// This MUST stay `async`. A synchronous tauri command runs on the UI thread,
/// so every mirror write blocked the window while the file was written. The
/// renderer debounces to one write per burst, but the payload is the entire
/// workspace, so a sync command here was enough to hang every window at once
/// (Windows reported it as AppHangB1 / "not responding").
#[tauri::command]
async fn save_workspace(data: String) -> bool {
    atomic_write(&workspace_file(), data.as_bytes());
    true
}

#[tauri::command]
fn load_settings() -> String {
    match read_doc(&settings_file()) {
        Some(v) => serde_json::to_string(&v).unwrap_or_else(|_| "null".into()),
        None => "null".into(),
    }
}

#[tauri::command]
fn save_settings(data: String) -> bool {
    atomic_write(&settings_file(), data.as_bytes());
    true
}

fn local_setting_bool(key: &str, default: bool) -> bool {
    match read_doc(&settings_file()) {
        Some(v) => v.get(key).and_then(|b| b.as_bool()).unwrap_or(default),
        None => default,
    }
}

#[tauri::command]
fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/* ----------------------------------------------------------
   crash logs (crash tracking)
---------------------------------------------------------- */

fn install_panic_hook() {
    std::panic::set_hook(Box::new(move |info| {
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let file = crash_dir().join(format!("crash-{}.log", ts));
        let msg = format!(
            "Pebble crashed (panic)\nTime: {}\nThread: {:?}\nMessage: {}\nLocation: {}\nVersion: {}\n",
            chrono_now(),
            std::thread::current().name().unwrap_or("<unnamed>"),
            info.payload()
                .downcast_ref::<&str>()
                .map(|s| s.to_string())
                .or_else(|| info.payload().downcast_ref::<String>().cloned())
                .unwrap_or_else(|| "unknown panic".into()),
            info.location()
                .map(|l| format!("{}:{}", l.file(), l.line()))
                .unwrap_or_else(|| "?".into()),
            env!("CARGO_PKG_VERSION"),
        );
        if let Some(parent) = file.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let _ = fs::write(&file, msg);
        // keep only the newest 30 crash logs
        if let Ok(entries) = fs::read_dir(crash_dir()) {
            let mut files: Vec<_> = entries.filter_map(|e| e.ok()).map(|e| e.path()).collect();
            files.sort();
            if files.len() > 30 {
                for f in files.drain(..files.len() - 30) {
                    let _ = fs::remove_file(f);
                }
            }
        }
    }));
}

fn chrono_now() -> String {
    let d = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // simple UTC-ish formatting without extra crates
    let days = d / 86400;
    let secs = d % 86400;
    let (y, mo, da) = civil_from_days(days as i64);
    format!(
        "{:04}-{:02}-{:02} {:02}:{:02}:{:02} UTC",
        y, mo, da, secs / 3600, (secs % 3600) / 60, secs % 60
    )
}

fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

#[derive(Serialize)]
struct CrashEntry {
    file: String,
    content: String,
}

#[tauri::command]
fn read_crash_logs() -> Vec<CrashEntry> {
    let mut out = Vec::new();
    if let Ok(entries) = fs::read_dir(crash_dir()) {
        let mut paths: Vec<_> = entries.filter_map(|e| e.ok()).map(|e| e.path()).filter(|p| p.extension().map(|x| x == "log").unwrap_or(false)).collect();
        paths.sort();
        paths.reverse();
        for p in paths.into_iter().take(20) {
            if let Ok(content) = fs::read_to_string(&p) {
                out.push(CrashEntry { file: p.file_name().map(|f| f.to_string_lossy().to_string()).unwrap_or_default(), content });
            }
        }
    }
    out
}

#[tauri::command]
fn clear_crash_logs() -> bool {
    if let Ok(entries) = fs::read_dir(crash_dir()) {
        for e in entries.filter_map(|e| e.ok()) {
            let _ = fs::remove_file(e.path());
        }
    }
    true
}

/* ----------------------------------------------------------
   notifications (native, with Pebble icon)
---------------------------------------------------------- */

#[tauri::command(rename_all = "snake_case")]
fn notify(app: AppHandle, title: String, body: String, silent: bool) -> bool {
    let _ = &app;
    let mut attempt = notify_rust::Notification::new();
    attempt
        .appname("Pebble")
        .summary(&title)
        .body(&body)
        .timeout(notify_rust::Timeout::Milliseconds(6500));
    if silent {
        attempt.urgency(notify_rust::Urgency::Low);
    }
    attempt.show().is_ok()
}

/* ----------------------------------------------------------
   active window tracking (Windows) — name + exe + path + url guess
---------------------------------------------------------- */

pub const BROWSERS: &[&str] = &[
    "chrome", "msedge", "edge", "firefox", "brave", "opera", "vivaldi", "arc", "safari", "chromium",
];

/// Pull a bare hostname out of whatever a browser put in the title.
///
/// WHY THIS EXISTS: the old code returned everything before the
/// " - Chrome" separator — which is the PAGE TITLE, not the site. So a
/// window titled "How to install Rust — Google Chrome" produced
/// `url = "How to install Rust"`, the icon key became that string, and
/// every favicon lookup failed. That is why sites so often showed a
/// bare letter instead of a logo.
///
/// Browsers are inconsistent about what they put in the title bar, so we
/// try, in order:
///   1. a real URL, if the title happens to contain one,
///   2. a leading hostname-ish token (`github.com`, `docs.google.com`),
///   3. a leading @handle (a social app),
///   4. nothing — the caller degrades to a letter tile.
fn hostname_from_title(title: &str) -> Option<String> {
    let t = title.trim();
    if t.is_empty() {
        return None;
    }

    // 1. an embedded http(s) URL anywhere in the string
    if let Some(pos) = t.find("http://").or_else(|| t.find("https://")) {
        let rest = &t[pos..];
        let rest = rest.split_whitespace().next().unwrap_or(rest);
        let host = rest
            .split("://")
            .nth(1)
            .unwrap_or(rest)
            .split(['/', '?', '#'])
            .next()
            .unwrap_or("");
        let host = host.split('@').next_back().unwrap_or(host); // strip creds
        /* strip an explicit port: a favicon lookup against "host:8080"
           never resolves */
        let host = host.rsplit_once(':').map(|(h, p)| {
            if p.chars().all(|c| c.is_ascii_digit()) { h } else { host }
        }).unwrap_or(host);
        if host.contains('.') && !host.contains(' ') {
            return Some(host.to_ascii_lowercase());
        }
    }

    // 2. a leading token that looks like a hostname
    let first = t.split_whitespace().next().unwrap_or(t);
    let candidate = first
        .split(['/', '?', '#'])
        .next()
        .unwrap_or(first)
        .trim_matches(|c: char| !c.is_ascii_alphanumeric() && c != '.' && c != '-' && c != ':');
    if candidate.contains('.') {
        let bare = candidate.rsplit_once(':').map(|(h, p)| {
            if p.chars().all(|c| c.is_ascii_digit()) { h } else { candidate }
        }).unwrap_or(candidate);
        // require a plausible TLD so "Version 1.2" or "Node.js" tips do not
        // get mistaken for hosts
        let tld = bare.rsplit('.').next().unwrap_or("");
        if tld.len() >= 2 && tld.chars().all(|c| c.is_ascii_alphanumeric()) {
            return Some(bare.to_ascii_lowercase());
        }
    }

    // 3. an @handle (social apps put this first)
    if let Some(rest) = t.strip_prefix('@') {
        let handle: String = rest.chars().take_while(|c| c.is_ascii_alphanumeric() || *c == '_').collect();
        if handle.len() >= 2 {
            return Some(format!("x.com/{}", handle.to_ascii_lowercase()));
        }
    }

    None
}

/// Keep the full page title for display, but hand the renderer a
/// hostname it can actually resolve an icon for.
fn browser_site_from_title(title: &str) -> Option<String> {
    // Browsers do not agree on the dash they put before their own name. Chrome,
    // Edge, Brave and Opera use " - Name", Firefox uses an em dash, and Brave in
    // particular commonly uses an EN DASH (U+2013) that matched nothing here —
    // so a Brave window never resolved to a site and the raw tab title was
    // recorded instead. Normalise every dash variant before matching.
    let norm: String = title
        .chars()
        .map(|c| match c {
            '\u{2010}' | '\u{2011}' | '\u{2012}' | '\u{2013}' | '\u{2014}' | '\u{2015}' => '\u{2014}',
            _ => c,
        })
        .collect();

    // The resolvable hostname is what the icon engine needs.
    if let Some(host) = hostname_from_title(&norm) {
        return Some(host);
    }

    // Nothing resolvable — keep the page title so the row is still
    // readable. iconHTML() will show a letter tile rather than guess.
    for sep in [" \u{2014} ", " - "] {
        if let Some(pos) = norm.find(sep) {
            let site = norm[..pos].trim();
            if !site.is_empty() && site.len() < 120 {
                return Some(site.to_string());
            }
        }
    }
    None
}

#[cfg(windows)]
fn active_window_impl() -> Option<serde_json::Value> {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowTextLengthW, GetWindowTextW,
    };

    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.is_null() {
            return None;
        }
        let len = GetWindowTextLengthW(hwnd);
        let title = if len > 0 {
            let mut buf = vec![0u16; (len + 1) as usize];
            GetWindowTextW(hwnd, buf.as_mut_ptr(), len + 1);
            String::from_utf16_lossy(&buf[..len as usize])
        } else {
            String::new()
        };

        let mut pid: u32 = 0;
        windows_sys::Win32::UI::WindowsAndMessaging::GetWindowThreadProcessId(hwnd, &mut pid);
        let mut full_path = String::new();
        if pid != 0 {
            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if !handle.is_null() {
                let mut size: u32 = 1024;
                let mut pbuf = vec![0u16; 1024];
                if QueryFullProcessImageNameW(
                    handle,
                    PROCESS_NAME_WIN32,
                    pbuf.as_mut_ptr(),
                    &mut size,
                ) != 0
                {
                    full_path = String::from_utf16_lossy(&pbuf[..size as usize]);
                }
                CloseHandle(handle);
            }
        }
        let exe_name = full_path
            .rsplit(|c| c == '\\' || c == '/')
            .next()
            .unwrap_or("")
            .to_string();
        if exe_name.is_empty() {
            return None;
        }
        let raw_name = exe_name.trim_end_matches(".exe").trim_end_matches(".EXE").to_string();
        let lower = raw_name.to_lowercase();
        let name = match lower.as_str() {
            "antigravity" => "Antigravity".to_string(),
            "brave" => "Brave Browser".to_string(),
            "explorer" => "File Explorer".to_string(),
            "code" => "Visual Studio Code".to_string(),
            "chrome" => "Google Chrome".to_string(),
            "msedge" => "Microsoft Edge".to_string(),
            "firefox" => "Firefox".to_string(),
            "windowsterminal" => "Windows Terminal".to_string(),
            "powershell" => "PowerShell".to_string(),
            "cmd" => "Command Prompt".to_string(),
            "taskmgr" => "Task Manager".to_string(),
            "slack" => "Slack".to_string(),
            "discord" => "Discord".to_string(),
            "spotify" => "Spotify".to_string(),
            "notion" => "Notion".to_string(),
            _ => {
                let mut c = raw_name.chars();
                match c.next() {
                    None => raw_name.clone(),
                    Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
                }
            }
        };

        let url = if BROWSERS.iter().any(|b| lower.contains(b)) {
            browser_site_from_title(&title).unwrap_or_default()
        } else {
            String::new()
        };
        // record name -> path for icon extraction
        if !full_path.is_empty() {
            ext_bridge::remember_exe(name.clone(), full_path.clone());
            ext_bridge::remember_exe(raw_name.clone(), full_path.clone());
            ext_bridge::remember_exe(lower.clone(), full_path.clone());
        }
        Some(serde_json::json!({
            "name": name, "rawName": raw_name, "exe": exe_name, "path": full_path,
            "title": title, "url": url, "pid": pid
        }))
    }
}

#[cfg(not(windows))]
fn active_window_impl() -> Option<serde_json::Value> {
    None
}

#[tauri::command]
fn get_active_window() -> Option<serde_json::Value> {
    active_window_impl()
}

/* ----------------------------------------------------------
   real app icon extraction (Win32 → PNG cache → asset URL)
---------------------------------------------------------- */

#[cfg(windows)]
fn extract_icon_png(exe_path: &str) -> Option<PathBuf> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::UI::Shell::{
        SHGetFileInfoW, SHGFI_ICON, SHGFI_LARGEICON, SHFILEINFOW,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{DestroyIcon, GetIconInfo, ICONINFO};
    use windows_sys::Win32::Graphics::Gdi::{
        CreateCompatibleDC, DeleteDC, DeleteObject, GetDIBits, BITMAPINFO,
        BITMAPINFOHEADER, DIB_RGB_COLORS,
    };

    let meta = fs::metadata(exe_path).ok()?;
    let key = format!(
        "{:x}-{:x}",
        md5ish(exe_path.as_bytes()),
        meta.len()
    );
    let out = icons_dir().join(format!("{}.png", key));
    if out.exists() {
        return Some(out);
    }

    let wide: Vec<u16> = std::ffi::OsStr::new(exe_path)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    unsafe {
        let mut sfi: SHFILEINFOW = std::mem::zeroed();
        let ok = SHGetFileInfoW(
            wide.as_ptr(),
            0,
            &mut sfi,
            std::mem::size_of::<SHFILEINFOW>() as u32,
            SHGFI_ICON | SHGFI_LARGEICON,
        );
        if ok == 0 || sfi.hIcon.is_null() {
            return None;
        }
        let mut ii: ICONINFO = std::mem::zeroed();
        if GetIconInfo(sfi.hIcon, &mut ii) == 0 {
            let _ = DestroyIcon(sfi.hIcon);
            return None;
        }
        let hdc = CreateCompatibleDC(std::ptr::null_mut());
        let mut result: Option<PathBuf> = None;
        if !hdc.is_null() && !ii.hbmColor.is_null() {
            let mut bmi: BITMAPINFO = std::mem::zeroed();
            bmi.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
            // first call: fill dimensions
            if GetDIBits(hdc, ii.hbmColor, 0, 0, std::ptr::null_mut(), &mut bmi, DIB_RGB_COLORS) != 0 {
                let w = bmi.bmiHeader.biWidth;
                let h = bmi.bmiHeader.biHeight.unsigned_abs();
                if w > 0 && h > 0 && w <= 512 && h <= 512 {
                    bmi.bmiHeader.biBitCount = 32;
                    bmi.bmiHeader.biCompression = DIB_RGB_COLORS;
                    bmi.bmiHeader.biHeight = -((h) as i32); // top-down
                    let mut buf = vec![0u8; (w as usize * h as usize * 4) as usize];
                    if GetDIBits(hdc, ii.hbmColor, 0, h, buf.as_mut_ptr() as *mut _, &mut bmi, DIB_RGB_COLORS) != 0 {
                        // BGRA → RGBA
                        for px in buf.chunks_exact_mut(4) {
                            px.swap(0, 2);
                        }
                        let img = image::RgbaImage::from_raw(w as u32, h as u32, buf)
                            .map(|i| image::DynamicImage::ImageRgba8(i));
                        if let Some(dyn_img) = img {
                            let small = dyn_img.resize_exact(64, 64, image::imageops::FilterType::Lanczos3);
                            let mut png = Vec::new();
                            let enc = image::codecs::png::PngEncoder::new(std::io::Cursor::new(&mut png));
                            use image::ImageEncoder as _;
                            if enc
                                .write_image(
                                    small.to_rgba8().as_raw(),
                                    small.width(),
                                    small.height(),
                                    image::ExtendedColorType::Rgba8,
                                )
                                .is_ok()
                            {
                                if let Some(parent) = out.parent() {
                                    let _ = fs::create_dir_all(parent);
                                }
                                if fs::write(&out, &png).is_ok() {
                                    result = Some(out.clone());
                                }
                            }
                        }
                    }
                }
            }
        }
        if !hdc.is_null() {
            let _ = DeleteDC(hdc);
        }
        if !ii.hbmColor.is_null() {
            let _ = DeleteObject(ii.hbmColor);
        }
        if !ii.hbmMask.is_null() {
            let _ = DeleteObject(ii.hbmMask);
        }
        let _ = DestroyIcon(sfi.hIcon);
        result
    }
}

#[cfg(not(windows))]
fn extract_icon_png(_exe_path: &str) -> Option<PathBuf> {
    None
}

fn md5ish(bytes: &[u8]) -> u64 {
    // tiny FNV-1a — just a cache key, not crypto
    let mut hash: u64 = 0xcbf29ce484222325;
    for b in bytes {
        hash ^= *b as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

#[derive(Serialize)]
struct IconResult {
    ok: bool,
    url: Option<String>,
}

#[tauri::command(rename_all = "snake_case")]
fn app_icon(exe: String, name: String) -> IconResult {
    let mut path = exe.trim().to_string();
    if path.is_empty() || !path.to_lowercase().ends_with(".exe") || !path.contains('\\') {
        // resolve by app name via the live exe map
        if let Some(p) = ext_bridge::lookup_exe(name.trim()) {
            path = p;
        } else if !path.contains('\\') && path.to_lowercase().ends_with(".exe") {
            // Check direct Windows system paths without recursive disk crawling
            let test_paths = [
                format!("C:\\Windows\\System32\\{}", path),
                format!("C:\\Windows\\{}", path),
                "C:\\Windows\\explorer.exe".to_string(),
            ];
            for tp in test_paths {
                if PathBuf::from(&tp).exists() {
                    path = tp;
                    break;
                }
            }
        }
    }
    if path.is_empty() || !PathBuf::from(&path).exists() {
        return IconResult { ok: false, url: None };
    }
    match extract_icon_png(&path) {
        Some(p) => {
            match fs::read(&p) {
                Ok(bytes) => {
                    use base64::Engine;
                    let b64 = base64::prelude::BASE64_STANDARD.encode(&bytes);
                    IconResult { ok: true, url: Some(format!("data:image/png;base64,{}", b64)) }
                }
                Err(_) => {
                    let enc = urlencoding_lite(&p.to_string_lossy());
                    IconResult { ok: true, url: Some(format!("http://asset.localhost/{}", enc)) }
                }
            }
        }
        None => IconResult { ok: false, url: None },
    }
}

fn urlencoding_lite(s: &str) -> String {
    let mut out = String::new();
    for b in s.as_bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' | b'/' => out.push(*b as char),
            other => out.push_str(&format!("%{:02X}", other)),
        }
    }
    out
}

/* ----------------------------------------------------------
   screenshots (xcap) + monitors
---------------------------------------------------------- */

#[tauri::command(rename_all = "snake_case")]
fn capture_monitor(hide_self: bool, app: AppHandle) -> Result<String, String> {
    if hide_self {
        if let Some(win) = app.get_webview_window("main") {
            let _ = win.hide();
        }
        std::thread::sleep(Duration::from_millis(280));
    }
    let result = (|| -> Result<String, String> {
        let monitors = xcap::Monitor::all().map_err(|e| e.to_string())?;
        let mon = monitors.first().ok_or_else(|| "no monitor found".to_string())?;
        let img = mon.capture_image().map_err(|e| e.to_string())?;
        let dyn_img = image::DynamicImage::ImageRgba8(img);
        let mut png = Vec::new();
        let enc = image::codecs::png::PngEncoder::new(std::io::Cursor::new(&mut png));
        use image::ImageEncoder as _;
        enc.write_image(
            dyn_img.to_rgba8().as_raw(),
            dyn_img.width(),
            dyn_img.height(),
            image::ExtendedColorType::Rgba8,
        )
        .map_err(|e| e.to_string())?;
        Ok(format!(
            "data:image/png;base64,{}",
            base64::Engine::encode(&base64::engine::general_purpose::STANDARD, png)
        ))
    })();
    if hide_self {
        if let Some(win) = app.get_webview_window("main") {
            let _ = win.show();
            let _ = win.set_focus();
        }
    }
    result
}

#[tauri::command]
fn list_monitors() -> Vec<serde_json::Value> {
    xcap::Monitor::all()
        .map(|ms| {
            ms.iter()
                .map(|m| {
                    serde_json::json!({
                        "id": m.id().unwrap_or(0),
                        "name": m.name().unwrap_or_default(),
                        "width": m.width().unwrap_or(0),
                        "height": m.height().unwrap_or(0)
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

/* ----------------------------------------------------------
   clipboard (arboard) — text + image
---------------------------------------------------------- */

#[tauri::command]
fn read_clipboard() -> Option<String> {
    let mut cb = arboard::Clipboard::new().ok()?;
    cb.get_text().ok()
}

#[tauri::command(rename_all = "snake_case")]
fn write_clipboard(text: String) -> bool {
    match arboard::Clipboard::new() {
        Ok(mut cb) => cb.set_text(text).is_ok(),
        Err(_) => false,
    }
}

#[derive(Serialize)]
struct ClipImgResult {
    ok: bool,
    data: Option<String>,
}

#[tauri::command]
fn read_clipboard_image() -> ClipImgResult {
    match arboard::Clipboard::new() {
        Ok(mut cb) => match cb.get_image() {
            Ok(img) => {
                let buf: Vec<u8> = img.bytes.into_owned();
                let mut rgba = Vec::with_capacity(buf.len());
                // arboard gives RGBA already
                rgba.extend_from_slice(&buf);
                let dyn_img = image::DynamicImage::ImageRgba8(
                    image::RgbaImage::from_raw(img.width as u32, img.height as u32, rgba)
                        .unwrap_or_else(|| image::RgbaImage::new(1, 1)),
                );
                let mut png = Vec::new();
                let enc = image::codecs::png::PngEncoder::new(std::io::Cursor::new(&mut png));
                use image::ImageEncoder as _;
                if enc
                    .write_image(dyn_img.to_rgba8().as_raw(), dyn_img.width(), dyn_img.height(), image::ExtendedColorType::Rgba8)
                    .is_ok()
                {
                    return ClipImgResult {
                        ok: true,
                        data: Some(format!(
                            "data:image/png;base64,{}",
                            base64::Engine::encode(&base64::engine::general_purpose::STANDARD, png)
                        )),
                    };
                }
                ClipImgResult { ok: false, data: None }
            }
            Err(_) => ClipImgResult { ok: false, data: None },
        },
        Err(_) => ClipImgResult { ok: false, data: None },
    }
}

/* ----------------------------------------------------------
   REAL notes vault — folders + .md files on disk
---------------------------------------------------------- */

pub(crate) fn notes_vault_root() -> PathBuf {
    dirs::document_dir()
        .or_else(dirs::home_dir)
        .unwrap_or_else(data_dir)
        .join("PebbleX Notes")
}

fn sanitize_rel(rel: &str) -> Option<PathBuf> {
    let mut out = PathBuf::new();
    let mut any = false;
    for seg in rel.split(['\\', '/']) {
        let seg = seg.trim();
        if seg.is_empty() || seg == "." || seg == ".." {
            continue;
        }
        let clean: String = seg
            .chars()
            .map(|c| {
                if c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' || c == '.' || c == '(' || c == ')' {
                    c
                } else {
                    '_'
                }
            })
            .collect();
        if clean == "." || clean == ".." {
            continue;
        }
        out.push(clean);
        any = true;
    }
    if any { Some(out) } else { None }
}

#[derive(Serialize)]
struct VaultFile {
    rel: String,
    name: String,
    size: u64,
    modified: u64,
}

#[derive(Serialize)]
struct VaultStatus {
    ok: bool,
    root: String,
    files: Vec<VaultFile>,
    folders: Vec<String>,
}

fn vault_walk(dir: &PathBuf, prefix: &str, depth: u32, files: &mut Vec<VaultFile>, folders: &mut Vec<String>) {
    if depth > 8 || files.len() > 5000 {
        return;
    }
    if let Ok(entries) = fs::read_dir(dir) {
        for e in entries.filter_map(|e| e.ok()) {
            let p = e.path();
            let fname = e.file_name().to_string_lossy().to_string();
            if fname.starts_with('.') {
                continue;
            }
            if p.is_dir() {
                let rel = if prefix.is_empty() { fname.clone() } else { format!("{}/{}", prefix, fname) };
                folders.push(rel.clone());
                vault_walk(&p, &rel, depth + 1, files, folders);
            } else if fname.to_lowercase().ends_with(".md") || fname.to_lowercase().ends_with(".txt") {
                let rel = if prefix.is_empty() { fname.clone() } else { format!("{}/{}", prefix, fname) };
                let meta = e.metadata().ok();
                files.push(VaultFile {
                    rel: rel.clone(),
                    name: fname,
                    size: meta.as_ref().map(|m| m.len()).unwrap_or(0),
                    modified: meta
                        .and_then(|m| m.modified().ok())
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_secs())
                        .unwrap_or(0),
                });
            }
        }
    }
}

#[tauri::command]
fn note_vault_status() -> VaultStatus {
    let root = notes_vault_root();
    let _ = fs::create_dir_all(&root);
    let mut files = Vec::new();
    let mut folders = Vec::new();
    vault_walk(&root, "", 0, &mut files, &mut folders);
    files.sort_by(|a, b| b.rel.cmp(&a.rel));
    VaultStatus {
        ok: true,
        root: root.to_string_lossy().to_string(),
        files,
        folders,
    }
}

#[derive(Serialize)]
struct NoteWriteResult {
    ok: bool,
    path: String,
    rel: String,
    error: String,
}

#[tauri::command(rename_all = "snake_case")]
fn note_write_file(rel: String, content: String) -> NoteWriteResult {
    let rel_clean = sanitize_rel(&rel).unwrap_or_else(|| PathBuf::from("Notes.md"));
    let has_ext = rel_clean
        .to_string_lossy()
        .to_lowercase()
        .ends_with(".md")
        || rel_clean
            .to_string_lossy()
            .to_lowercase()
            .ends_with(".txt");
    let mut rel_final = rel_clean;
    if !has_ext {
        rel_final.as_mut_os_string().push(".md");
    }
    let path = notes_vault_root().join(&rel_final);
    match fs::create_dir_all(path.parent().unwrap_or(&notes_vault_root()))
        .and_then(|_| fs::write(&path, content.as_bytes()))
    {
        Ok(_) => NoteWriteResult {
            ok: true,
            path: path.to_string_lossy().to_string(),
            rel: rel_final.to_string_lossy().replace('\\', "/"),
            error: String::new(),
        },
        Err(e) => NoteWriteResult {
            ok: false,
            path: path.to_string_lossy().to_string(),
            rel: rel_final.to_string_lossy().replace('\\', "/"),
            error: e.to_string(),
        },
    }
}

#[tauri::command(rename_all = "snake_case")]
fn note_read_file(rel: String) -> ReadTextResult {
    let rel_clean = sanitize_rel(&rel).unwrap_or_default();
    let path = notes_vault_root().join(rel_clean);
    match fs::read_to_string(&path) {
        Ok(text) => ReadTextResult { ok: true, text, error: String::new() },
        Err(e) => ReadTextResult { ok: false, text: String::new(), error: e.to_string() },
    }
}

#[tauri::command(rename_all = "snake_case")]
fn note_delete_file(rel: String) -> TrashResult {
    let rel_clean = sanitize_rel(&rel).unwrap_or_default();
    let path = notes_vault_root().join(rel_clean);
    trash_path(path.to_string_lossy().to_string())
}

#[derive(Serialize)]
struct PickedFile {
    name: String,
    path: String,
    content: String,
}

#[tauri::command]
fn pick_text_files() -> Vec<PickedFile> {
    #[cfg(windows)]
    {
        let ps = "Add-Type -AssemblyName System.Windows.Forms; \
            $dlg = New-Object System.Windows.Forms.OpenFileDialog; \
            $dlg.Filter = 'Markdown & text files (*.md;*.txt)|*.md;*.txt|All files (*.*)|*.*'; \
            $dlg.Multiselect = $true; $dlg.Title = 'Import notes into PebbleX'; \
            if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $dlg.FileNames }";
        let out = std::process::Command::new("powershell.exe")
            .args(["-NoProfile", "-NonInteractive", "-STA", "-Command", ps])
            .creation_flags(0x08000000)
            .output();
        let mut picked = Vec::new();
        if let Ok(o) = out {
            let text = String::from_utf8_lossy(&o.stdout);
            for line in text.lines() {
                let p = line.trim();
                if p.len() > 3 && p.contains('\\') && p.contains(':') {
                    let name = p.rsplit('\\').next().unwrap_or(p).to_string();
                    let content = fs::read_to_string(p).unwrap_or_default();
                    picked.push(PickedFile { name, path: p.to_string(), content });
                }
            }
        }
        picked
    }
    #[cfg(not(windows))]
    {
        Vec::new()
    }
}

/* ----------------------------------------------------------
   files: silent save / read / trash / open
---------------------------------------------------------- */

#[derive(Serialize)]
struct SaveFileResult {
    ok: bool,
    path: Option<String>,
}

pub(crate) fn safe_name(name: &str) -> String {
    let base = name.rsplit(['\\', '/']).next().unwrap_or(name);
    let cleaned: String = base
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '.' || c == '-' || c == '_' || c == ' ' { c } else { '_' })
        .collect();
    if cleaned.is_empty() { "pebble-export.bin".into() } else { cleaned }
}

#[tauri::command(rename_all = "snake_case")]
fn save_file(name: String, content: String, base64: bool) -> SaveFileResult {
    let fname = safe_name(&name);
    let downloads = dirs::download_dir()
        .or_else(dirs::home_dir)
        .unwrap_or_else(|| PathBuf::from("."));
    let dir = downloads.join("Pebble");
    let _ = fs::create_dir_all(&dir);
    let path = dir.join(&fname);
    let bytes = if base64 {
        base64::Engine::decode(&base64::engine::general_purpose::STANDARD, content.trim()).unwrap_or_default()
    } else {
        content.into_bytes()
    };
    match fs::write(&path, &bytes) {
        Ok(_) => SaveFileResult { ok: true, path: Some(path.to_string_lossy().to_string()) },
        Err(_) => SaveFileResult { ok: false, path: None },
    }
}

#[derive(Serialize)]
struct ReadTextResult {
    ok: bool,
    text: String,
    error: String,
}

/* ----------------------------------------------------------
   user image assets (see assets.rs for the security model)
---------------------------------------------------------- */

#[tauri::command]
fn asset_import(data_url: String, name: String, kind: String) -> assets::AssetResult {
    assets::import(data_url, name, kind)
}

#[tauri::command]
fn asset_list(kind: Option<String>) -> Vec<assets::AssetMeta> {
    assets::list_assets(kind)
}

#[tauri::command]
fn asset_delete(id: String) -> bool {
    assets::delete(id)
}

#[tauri::command]
fn asset_export(id: String, dest: String) -> SaveFileResult {
    match assets::export(id, dest) {
        Some(p) => SaveFileResult { ok: true, path: Some(p) },
        None => SaveFileResult { ok: false, path: None },
    }
}

#[derive(Serialize)]
struct AssetUsage {
    bytes: u64,
    count: usize,
    dir: String,
}

#[tauri::command]
fn asset_usage() -> AssetUsage {
    AssetUsage {
        bytes: assets::library_bytes(),
        count: assets::list_assets(None).len(),
        dir: assets::assets_dir().to_string_lossy().to_string(),
    }
}

#[tauri::command]
fn asset_prune() -> usize {
    assets::prune_to_budget()
}

/* ----------------------------------------------------------
   local league — a shared JSON file so a family PC or a synced
   folder can act as a real (small) leaderboard with no server.
   Values are re-clamped on read by the renderer, so a hand-edited
   league file cannot manufacture a top rank.
---------------------------------------------------------- */

fn league_file() -> PathBuf {
    data_dir().join("league.json")
}

#[tauri::command]
async fn league_read() -> String {
    match fs::read_to_string(league_file()) {
        Ok(s) => s,
        Err(_) => "[]".to_string(),
    }
}

#[tauri::command]
async fn league_merge(entry: String) -> bool {
    let incoming: serde_json::Value = match serde_json::from_str(&entry) {
        Ok(v) => v,
        Err(_) => return false,
    };
    let pid = incoming.get("pid").and_then(|v| v.as_str()).unwrap_or("").to_string();
    if pid.is_empty() {
        return false;
    }

    let mut members: Vec<serde_json::Value> = fs::read_to_string(league_file())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| Vec::new());

    // upsert by pid, and hard-cap the roster so a corrupt file cannot grow
    // the list without bound
    members.retain(|m| m.get("pid").and_then(|v| v.as_str()).unwrap_or("") != pid);
    members.push(incoming);
    members.truncate(500);

    let body = serde_json::to_string(&members).unwrap_or_else(|_| "[]".to_string());
    atomic_write(&league_file(), body.as_bytes());
    true
}

#[tauri::command]
fn league_path() -> String {
    league_file().to_string_lossy().to_string()
}

#[tauri::command]
fn read_text_file(path: String) -> ReadTextResult {
    match fs::read_to_string(&path) {
        Ok(text) => ReadTextResult { ok: true, text, error: String::new() },
        Err(e) => ReadTextResult { ok: false, text: String::new(), error: e.to_string() },
    }
}

#[tauri::command]
fn open_external(url: String) -> bool {
    #[cfg(windows)]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &url])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .spawn()
            .is_ok()
    }
    #[cfg(not(windows))]
    {
        let _ = url;
        false
    }
}

#[tauri::command]
fn show_item(path: String) -> bool {
    #[cfg(windows)]
    {
        std::process::Command::new("explorer")
            .arg(format!("/select,{}", path))
            .spawn()
            .is_ok()
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        false
    }
}

#[tauri::command]
fn open_path(path: String) -> bool {
    #[cfg(windows)]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &path])
            .creation_flags(0x08000000)
            .spawn()
            .is_ok()
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        false
    }
}

#[derive(Serialize)]
struct TrashResult {
    ok: bool,
}

#[tauri::command]
fn trash_path(path: String) -> TrashResult {
    // safe-delete into our own .trash folder (no destructive rm)
    let dst_dir = data_dir().join(".trash");
    let _ = fs::create_dir_all(&dst_dir);
    let src = PathBuf::from(&path);
    let fname = src.file_name().map(|f| f.to_string_lossy().to_string()).unwrap_or_else(|| format!("item-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)));
    let dst = dst_dir.join(format!("{}-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0), fname));
    match fs::rename(&src, &dst) {
        Ok(_) => TrashResult { ok: true },
        Err(_) => match fs::copy(&src, &dst) {
            Ok(_) => TrashResult { ok: true },
            Err(_) => TrashResult { ok: false },
        },
    }
}

#[derive(Serialize)]
struct PathsResult {
    userData: String,
    downloads: String,
    pictures: String,
    documents: String,
    dataFile: String,
    version: String,
    platform: String,
}

#[tauri::command]
fn app_paths() -> PathsResult {
    PathsResult {
        userData: data_dir().to_string_lossy().to_string(),
        downloads: dirs::download_dir().map(|d| d.to_string_lossy().to_string()).unwrap_or_default(),
        pictures: dirs::picture_dir().map(|d| d.to_string_lossy().to_string()).unwrap_or_default(),
        documents: dirs::document_dir().map(|d| d.to_string_lossy().to_string()).unwrap_or_default(),
        dataFile: workspace_file().to_string_lossy().to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        platform: "win32".into(),
    }
}

/* ----------------------------------------------------------
   window ops
---------------------------------------------------------- */

#[tauri::command]
fn win_min(app: AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.minimize();
    }
}

#[tauri::command]
fn win_max(app: AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        if w.is_maximized().unwrap_or(false) {
            let _ = w.unmaximize();
        } else {
            let _ = w.maximize();
        }
    }
}

#[tauri::command]
fn win_close(app: AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.close();
    }
}

#[tauri::command(rename_all = "snake_case")]
fn set_login_item(on: bool) -> bool {
    #[cfg(windows)]
    {
        let exe = std::env::current_exe().map(|p| p.to_string_lossy().to_string()).unwrap_or_default();
        if on && !exe.is_empty() {
            std::process::Command::new("reg")
                .args(["add", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", "/v", "Pebble", "/t", "REG_SZ", "/d", &exe, "/f"])
                .creation_flags(0x08000000)
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false)
        } else {
            std::process::Command::new("reg")
                .args(["delete", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", "/v", "Pebble", "/f"])
                .creation_flags(0x08000000)
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false)
        }
    }
    #[cfg(not(windows))]
    {
        let _ = on;
        false
    }
}

#[tauri::command(rename_all = "snake_case")]
fn taskbar_progress(mode: String, value: f64) -> bool {
    let _ = (mode, value);
    true // visual taskbar progress arrives in a later build
}

#[tauri::command(rename_all = "snake_case")]
fn asr_record(timeout_ms: u32) -> Result<String, String> {
    #[cfg(windows)]
    {
        let ms = timeout_ms.min(60000);
        let ps = format!(
            "Add-Type -AssemblyName System.Speech; $rec = New-Object System.Speech.Recognition.SpeechRecognitionEngine; $rec.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar)); $rec.SetInputToDefaultAudioDevice(); $rec.InitialSilenceTimeout = [TimeSpan]::FromMilliseconds({}); $result = $rec.Recognize(); if ($result) {{ $result.Text }} else {{ '' }}",
            ms
        );
        let out = std::process::Command::new("powershell.exe")
            .args(["-NoProfile", "-NonInteractive", "-Command", &ps])
            .creation_flags(0x08000000)
            .output()
            .map_err(|e| format!("asr failed: {}", e))?;
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
    }
    #[cfg(not(windows))]
    {
        Err("native-asr-unavailable".into())
    }
}

/* ----------------------------------------------------------
   widget + login flow
---------------------------------------------------------- */

/// Show/hide the desktop widget.
///
/// MUST be async, and the window MUST be built on a background thread.
/// This used to be a sync command that called `builder.build()` directly, which
/// runs on the UI thread — and creating a WebView2 window from inside a command
/// that occupies the UI thread deadlocks, because initialising the new webview
/// needs that same thread to pump its messages. The app then froze solid
/// (AppHangB1): the login window stopped responding, the main window never
/// painted (blank white), and the half-built widget showed "not responding".
#[tauri::command(rename_all = "snake_case")]
async fn widget_toggle(app: AppHandle, show: Option<bool>) -> Result<(), String> {
    let want = show.unwrap_or_else(|| {
        app.get_webview_window("widget")
            .and_then(|w| w.is_visible().ok())
            .map(|vis| !vis)
            .unwrap_or(true)
    });
    if want {
        if let Some(w) = app.get_webview_window("widget") {
            let _ = w.show();
            let _ = w.set_focus();
            return Ok(());
        }
        let app2 = app.clone();
        std::thread::spawn(move || {
            // let the UI thread finish whatever it is doing first
            std::thread::sleep(Duration::from_millis(80));
            let mut builder = WebviewWindowBuilder::new(
                &app2,
                "widget",
                WebviewUrl::App("index.html".into()),
            )
            .initialization_script("window.__PEBBLE_WINDOW__ = 'widget';")
            .title("Pebble Widget")
            .inner_size(320.0, 490.0)
            .resizable(true)
            .decorations(false)
            .skip_taskbar(true)
            .always_on_top(true)
            .shadow(true)
            .transparent(true);
            if let Ok(Some(m)) = app2.primary_monitor() {
                let sz = m.size();
                let sf = m.scale_factor().max(1.0);
                builder = builder.position(
                    (sz.width as f64 - 330.0) / sf,
                    (sz.height as f64 - 550.0) / sf,
                );
            }
            let _ = builder.build();
        });
    } else if let Some(w) = app.get_webview_window("widget") {
        let _ = w.hide();
    }
    Ok(())
}

/// Finish login: hand off from the login window to the main window.
///
/// Async for the same reason as `widget_toggle` — this calls show/set_focus/
/// emit, and doing that from a sync command occupies the UI thread while the
/// main window's webview needs it, so the handoff wedged and the login button
/// stayed stuck on "Welcome, ..." forever.
/// Resize the widget window between its full and compact heights.
///
/// Toggling mini mode only changed the contents, so the 320x490 window stayed
/// the same size and looked like nothing had happened. Async for the same
/// reason as `widget_toggle` — resizing must not occupy the UI thread.
#[tauri::command(rename_all = "snake_case")]
async fn widget_size(app: AppHandle, mini: bool) -> bool {
    let Some(w) = app.get_webview_window("widget") else {
        return false;
    };
    let mon = w.current_monitor().ok().flatten();
    /* Monitor is not Copy, so read the size and scale in one pass rather than
       consuming the Option twice. */
    let (mw, mh, scale) = match mon {
        Some(m) => {
            let s = m.size();
            (s.width as f64, s.height as f64, m.scale_factor().max(1.0))
        }
        None => (1920.0, 1080.0, 1.0),
    };

    // full: the authored 320x490. compact: just the header + mini bar.
    let (w_px, h_px) = if mini { (320.0_f64, 96.0_f64) } else { (320.0_f64, 490.0_f64) };
    let _ = w.set_size(tauri::PhysicalSize::new(w_px, h_px));

    // keep it on screen after shrinking
    if let Ok(pos) = w.outer_position() {
        let size = w.outer_size().ok();
        let (sw, sh) = (size.map(|s| s.width as f64).unwrap_or(w_px),
                        size.map(|s| s.height as f64).unwrap_or(h_px));
        let max_x = mw - sw - 12.0;
        let max_y = mh - sh - 12.0;
        let (mut x, mut y) = (pos.x as f64 / scale, pos.y as f64 / scale);
        if x > max_x { x = max_x; }
        if y > max_y { y = max_y; }
        if x < 0.0 { x = 0.0; }
        if y < 0.0 { y = 0.0; }
        if x != pos.x as f64 / scale || y != pos.y as f64 / scale {
            let _ = w.set_position(tauri::PhysicalPosition::new(
                (x * scale) as i32,
                (y * scale) as i32,
            ));
        }
    }
    true
}

#[tauri::command(rename_all = "snake_case")]
async fn start_dragging(window: tauri::WebviewWindow) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
async fn login_done(app: AppHandle, name: String) -> bool {
    // mark authed FIRST so the login window's close event doesn't quit the app
    AUTHED.store(true, Ordering::Relaxed);
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.unminimize();
        let _ = main.show();
        let _ = main.set_focus();
        let _ = main.emit("profile-ready", name);
    }
let app_handle = app.clone();
    std::thread::spawn(move || {
        // Give the main window time to subscribe before the login window is
        // torn down. 150ms was not always enough on a cold start, which is
        // why the profile sometimes arrived as "You".
        std::thread::sleep(Duration::from_millis(400));
        if let Some(login) = app_handle.get_webview_window("login") {
            let _ = login.close();
        }
    });
    true
}

/// Read a boolean out of the workspace document the renderer wrote. Used for
/// `ui:skipLogin` so Rust can decide whether to show the login window at all.
fn workspace_bool(key: &str) -> bool {
    read_doc(&workspace_file())
        .and_then(|d| d.get(key).cloned())
        .and_then(|v| match v {
            serde_json::Value::Bool(b) => Some(b),
            // the renderer stores { on: true, name } rather than a bare bool
            serde_json::Value::Object(ref o) => o.get("on").and_then(|x| x.as_bool()),
            _ => None,
        })
        .unwrap_or(false)
}

#[tauri::command]
fn show_main(app: AppHandle) -> bool {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.unminimize();
        let _ = main.show();
        let _ = main.set_focus();
        return true;
    }
    false
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

/* ----------------------------------------------------------
   chrome-extension bridge commands
---------------------------------------------------------- */

#[tauri::command]
fn drain_ext_queue() -> Vec<serde_json::Value> {
    ext_bridge::drain()
}

#[derive(Serialize)]
struct ExtStatus {
    connected: bool,
    lastSeen: u64,
    queued: usize,
    extSessions: usize,
}

#[tauri::command]
fn ext_status() -> ExtStatus {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let last = ext_bridge::last_seen();
    ExtStatus {
        connected: now.saturating_sub(last) < 300,
        lastSeen: last,
        queued: ext_bridge::queued(),
        extSessions: ext_bridge::ext_sessions_today(),
    }
}

#[derive(Serialize)]
struct UsageResult {
    ok: bool,
    source: String,
    foreground: Option<serde_json::Value>,
}

#[tauri::command]
fn usage_today() -> UsageResult {
    UsageResult { ok: true, source: "native".into(), foreground: active_window_impl() }
}

/* ----------------------------------------------------------
   reminder scheduler thread (same pattern as Electron main)
---------------------------------------------------------- */

fn spawn_reminder_thread(app: AppHandle) {
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(12));
        loop {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.eval("try{ if (window.NX && NX.reminders && NX.reminders.pollDue) NX.reminders.pollDue(); }catch(e){}");
            }
            std::thread::sleep(Duration::from_secs(20));
        }
    });
}

/* ----------------------------------------------------------
   window setup: login (small, visible) + main (hidden until auth)
---------------------------------------------------------- */

fn build_main_window(app: &tauri::App) -> Result<(), String> {
    let _handle = app.handle().clone();
    let mut builder = WebviewWindowBuilder::new(
        app,
        "main",
        WebviewUrl::App("index.html".into()),
    )
    .initialization_script("window.__PEBBLE_WINDOW__ = 'main';")
    .title("PebbleX")
    .inner_size(1360.0, 860.0)
    .min_inner_size(940.0, 600.0)
    .center()
    .visible(false)
    .maximized(false)
    .resizable(true);
    /* Open on a screen that can actually hold the window. A fixed 1360x860 was
       larger than the work area on a small or high-DPI laptop, so the window
       opened clipped or off the bottom edge. Scale to ~88% of the primary
       monitor's work area, clamped to the 940x600 minimum. */
    if let Some(mon) = app.primary_monitor().ok().flatten() {
        let scale = mon.scale_factor().max(1.0);
        let size = mon.size();
        let avail_w = (size.width as f64 / scale * 0.88).max(940.0);
        let avail_h = (size.height as f64 / scale * 0.88).max(600.0);
        builder = builder.inner_size(avail_w.min(1600.0), avail_h.min(1000.0));
    }
    builder = builder.on_download(move |_webview, event| {
        use tauri::webview::DownloadEvent;
        match event {
            DownloadEvent::Requested { url, destination } => {
                let url_s = url.to_string();
                let name = url_s
                    .rsplit('/')
                    .next()
                    .unwrap_or("download.bin")
                    .split('?')
                    .next()
                    .unwrap_or("download.bin")
                    .to_string();
                let downloads = dirs::download_dir()
                    .or_else(dirs::home_dir)
                    .unwrap_or_else(|| PathBuf::from("."));
                let safe = safe_name(&name);
                *destination = downloads.join("Pebble").join(safe);
                true
            }
            DownloadEvent::Finished { path, .. } => {
                if let Some(p) = path {
                    println!("[pebble] download saved: {}", p.display());
                }
                true
            }
            _ => true,
        }
    });
    builder.build().map_err(|e| e.to_string())?;
    Ok(())
}

fn build_login_window(app: &tauri::App) -> Result<(), String> {
    WebviewWindowBuilder::new(
        app,
        "login",
        WebviewUrl::App("index.html".into()),
    )
    .initialization_script("window.__PEBBLE_WINDOW__ = 'login';")
    .title("Sign in to PebbleX")
    .inner_size(440.0, 580.0)
    .min_inner_size(440.0, 580.0)
    .max_inner_size(440.0, 580.0)
    .resizable(false)
    .center()
    .visible(true)
    .build()
    .map_err(|e| e.to_string())?;
    Ok(())
}

/* ----------------------------------------------------------
   run
---------------------------------------------------------- */

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    install_panic_hook();

    // second launch while the app is open → focus the first instance, then exit
    if !single_instance_guard() {
        poke_first_instance();
        std::process::exit(0);
    }

    ext_bridge::spawn_bridge();

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            load_workspace, save_workspace, load_settings, save_settings, get_version,
            notify, get_active_window, app_icon,
            capture_monitor, list_monitors,
            read_clipboard, write_clipboard, read_clipboard_image,
            save_file, read_text_file, open_external, show_item, open_path, trash_path,
            asset_import, asset_list, asset_delete, asset_export, asset_usage, asset_prune,
            league_read, league_merge, league_path,
            sysctl::sys_brightness, sysctl::sys_brightness_set,
            sysctl::sys_volume, sysctl::sys_volume_set,
            sysctl::sys_power, sysctl::sys_foreground_app, sysctl::sys_data_locations,
            app_paths, win_min, win_max, win_close, set_login_item, taskbar_progress, asr_record,
            widget_toggle, widget_size, start_dragging, login_done, quit_app, show_main,
            note_vault_status, note_write_file, note_read_file, note_delete_file, pick_text_files,
            drain_ext_queue, ext_status, usage_today,
            read_crash_logs, clear_crash_logs
        ])
        .setup(|app| {
            // main window always exists (hidden) — it boots its engines right
            // away under ?main=1 and is revealed by login_done / on skip-login
            build_main_window(app)?;
            ext_bridge::set_app(app.handle().clone());

// login window on first run / when enabled (default on).
            // Closing the login window WITHOUT signing in quits the app
            // (see on_window_event) — no more "closed it and the app opened again".
            //
            // "Don't ask again on this PC" skips it, but ONLY when no PIN is
            // set. With a PIN the user explicitly asked to be challenged on
            // every launch, and honouring remember-me there would silently
            // remove the lock they chose.
            let has_pin = read_doc(&workspace_file())
                .and_then(|d| d.get("auth").cloned())
                .map(|a| a.get("pinHash").and_then(|h| h.as_str()).map(|s| !s.is_empty()).unwrap_or(false))
                .unwrap_or(false);
            let skip = workspace_bool("ui:skipLogin") && !has_pin;

            if(skip){
                // straight to the workspace; the main window is already up
                AUTHED.store(true, Ordering::Relaxed);
                if let Some(main) = app.get_webview_window("main") {
                    let _ = main.show();
                    let _ = main.set_focus();
                }
            } else if local_setting_bool("loginAtStart", true) {
                build_login_window(app)?;
            } else {
                AUTHED.store(true, Ordering::Relaxed);
                if let Some(main) = app.get_webview_window("main") {
                    let _ = main.show();
                    let _ = main.set_focus();
                }
            }

            spawn_reminder_thread(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if window.label() == "login" {
                    // programmatic close from login_done sets AUTHED first;
                    // a real user X-click without signing in quits PebbleX.
                    if !AUTHED.load(Ordering::Relaxed) {
                        window.app_handle().exit(0);
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running PebbleX");
}
/* ----------------------------------------------------------
   tests: window title -> resolvable hostname
   The icon engine can only fetch a favicon if this returns a real
   host. Returning the page title instead is what made site logos
   silently fail, so these cases are pinned.
---------------------------------------------------------- */
#[cfg(test)]
mod site_host_tests {
    use super::{browser_site_from_title, hostname_from_title};

    #[test]
    fn extracts_a_leading_hostname() {
        assert_eq!(
            hostname_from_title("github.com - Google Chrome").as_deref(),
            Some("github.com")
        );
        assert_eq!(
            hostname_from_title("docs.google.com/Document").as_deref(),
            Some("docs.google.com")
        );
        assert_eq!(
            hostname_from_title("news.ycombinator.com").as_deref(),
            Some("news.ycombinator.com")
        );
    }

    #[test]
    fn extracts_an_embedded_url() {
        assert_eq!(
            hostname_from_title("See https://example.com/docs/page for details - Chrome").as_deref(),
            Some("example.com")
        );
        assert_eq!(
            hostname_from_title("http://sub.domain.co.uk:8080/x?y=1").as_deref(),
            Some("sub.domain.co.uk")
        );
    }

    #[test]
    fn handles_a_social_handle() {
        assert_eq!(hostname_from_title("@jack - X").as_deref(), Some("x.com/jack"));
    }

    /// The exact bug: a page title must NOT be mistaken for a host.
    #[test]
    fn does_not_treat_a_page_title_as_a_host() {
        assert_eq!(hostname_from_title("How to install Rust - Google Chrome"), None);
        assert_eq!(hostname_from_title("Version 1.2 released"), None);
        assert_eq!(hostname_from_title(""), None);
    }

    #[test]
    fn still_returns_something_readable_for_display() {
        // falls back to the page title so the row is never blank
        let got = browser_site_from_title("How to install Rust - Google Chrome").unwrap();
        assert!(!got.is_empty());
        assert!(got.len() < 120);
    }

    #[test]
    fn handles_en_dash_and_em_dash_titles() {
        assert_eq!(
            browser_site_from_title("github.com \u{2013} Brave").as_deref(),
            Some("github.com")
        );
        assert_eq!(
            browser_site_from_title("github.com \u{2014} Firefox").as_deref(),
            Some("github.com")
        );
    }

    #[test]
    fn normalises_case() {
        assert_eq!(
            hostname_from_title("GitHub.COM - Chrome").as_deref(),
            Some("github.com")
        );
    }
}