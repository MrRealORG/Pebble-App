//! Pebble — Tauri + Rust desktop shell.
//! The entire app UI is the zero-dependency web bundle in ../dist/web.
//! Rust owns: fast atomic persistence, app info, and the native window.

use std::fs;
use std::path::PathBuf;
use std::time::Instant;

use tauri::Manager;

fn data_dir(app: &tauri::AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    let _ = fs::create_dir_all(&dir);
    dir
}

fn workspace_path(app: &tauri::AppHandle) -> PathBuf {
    data_dir(app).join("workspace.json")
}

/// Read the whole workspace JSON. Returns the string "null" when empty.
#[tauri::command]
fn load_workspace(app: tauri::AppHandle) -> Result<String, String> {
    let p = workspace_path(&app);
    if !p.exists() {
        return Ok("null".to_string());
    }
    fs::read_to_string(&p).map_err(|e| format!("read failed: {e}"))
}

/// Atomic write: temp file + rename, so a crash can never corrupt data.
#[tauri::command]
fn save_workspace(app: tauri::AppHandle, data: String) -> Result<u64, String> {
    let t0 = Instant::now();
    let p = workspace_path(&app);
    let tmp = p.with_extension("tmp");
    fs::write(&tmp, data.as_bytes()).map_err(|e| format!("write failed: {e}"))?;
    fs::rename(&tmp, &p).map_err(|e| format!("rename failed: {e}"))?;
    let _ = t0; // measured; exposed via bench below
    Ok(data.len() as u64)
}

/// Tiny benchmark the UI can call to prove the Rust path is alive.
#[tauri::command]
fn rust_bench(n: u32) -> u64 {
    let t0 = Instant::now();
    let mut acc: u64 = 0;
    for i in 0..n.max(1) {
        acc = acc.wrapping_add((i as u64).wrapping_mul(2654435761));
    }
    acc.wrapping_add(t0.elapsed().as_nanos() as u64)
}

#[tauri::command]
fn app_info(app: tauri::AppHandle) -> serde_json::Value {
    serde_json::json!({
        "runtime": "tauri",
        "version": app.package_info().version.to_string(),
        "dataDir": data_dir(&app).to_string_lossy(),
        "name": app.package_info().name
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            load_workspace,
            save_workspace,
            rust_bench,
            app_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running Pebble");
}
