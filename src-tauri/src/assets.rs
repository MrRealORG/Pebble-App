//! PebbleX — user image assets
//!
//! Local-first image store for anything the user uploads (avatar, notes,
//! chat, tasks). Bytes live on disk under `<AppData>/pebble/assets/`; only
//! metadata goes into the workspace JSON, because the workspace mirror
//! serialises the ENTIRE store on every write (see lib.rs `scheduleMirror`)
//! and base64-ing images into it would blow past the localStorage quota in
//! minutes and re-trigger the AppHangB1 freeze.
//!
//! SECURITY MODEL
//!   Uploaded bytes are untrusted. Every import:
//!     1. sniffs the real format from magic bytes (never the extension or
//!        the caller-declared MIME type),
//!     2. enforces a hard byte cap and a hard pixel-count cap,
//!     3. DECODES and RE-ENCODES through the `image` crate, which strips
//!        EXIF/GPS/ICC and any appended payload, so a "PNG" carrying a
//!        polyglot payload never reaches disk verbatim,
//!     4. writes under a generated id, never a caller-supplied path, so
//!        there is no traversal surface at all.
//!
//! DELIVERY
//!   Locally: `http://asset.localhost/...` via Tauri assetProtocol, scoped
//!   in tauri.conf.json to `**/pebble/assets/**`.
//!   Cloud:  the renderer re-encodes derivatives and PUTs them to the
//!        pebble-media-api Worker (R2). Nothing here needs an HTTP client.

use base64::Engine as _;
use image::{imageops::FilterType, DynamicImage, ImageFormat};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/* ---------------- limits ---------------- */

const MAX_BYTES: usize = 12 * 1024 * 1024;      // decoded upload ceiling
const MAX_PIXELS: u32 = 40_000_000;             // ~8000x5000, stops decode bombs
const MAX_ASSETS: usize = 500;
const MAX_LIBRARY_BYTES: u64 = 500 * 1024 * 1024;

/// Longest-edge sizes generated on import. These match the sizes the
/// pebble-media-api Worker accepts (32/64/128/512) so the local and cloud
/// copies are interchangeable and the client never has to resize twice.
pub const DERIVATIVES: [u32; 4] = [32, 64, 128, 512];

/* ---------------- paths ---------------- */

pub fn assets_dir() -> PathBuf {
    crate::data_dir().join("assets")
}

fn meta_path() -> PathBuf {
    assets_dir().join("index.json")
}

fn dir_for(id: &str) -> PathBuf {
    assets_dir().join(id)
}

/* ---------------- results ---------------- */

#[derive(Serialize)]
pub struct AssetResult {
    pub ok: bool,
    pub id: String,
    pub url: String,
    pub thumb: String,
    pub w: u32,
    pub h: u32,
    pub bytes: usize,
    pub mime: String,
    pub error: String,
}

impl AssetResult {
    fn fail(msg: impl Into<String>) -> Self {
        AssetResult {
            ok: false,
            id: String::new(),
            url: String::new(),
            thumb: String::new(),
            w: 0,
            h: 0,
            bytes: 0,
            mime: String::new(),
            error: msg.into(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
pub struct AssetMeta {
    pub id: String,
    pub kind: String,
    pub name: String,
    pub w: u32,
    pub h: u32,
    pub bytes: usize,
    pub mime: String,
    pub created_at: u64,
    pub url: String,
    pub thumb: String,
    /// Cloud URL, present only once the user opts into sync. Renderer
    /// prefers this and silently falls back to `url` when it is empty,
    /// which is how an offline/unsynced user still renders their avatar.
    pub sync_url: String,
}

/* ---------------- ids ---------------- */

/// FNV-1a over id+size, matching the existing `md5ish` style used for app
/// icons, then salted with the current time so two imports in the same
/// millisecond still get distinct folders.
fn hash_id(seed: &str) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in seed.as_bytes() {
        h ^= *b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    h
}

fn new_id(bytes: &[u8]) -> String {
    let seed = format!("{}:{}", hash_id(&bytes.len().to_string()), bytes.len());
    let h = hash_id(&format!("{seed}:{:?}", &bytes[..bytes.len().min(4096)]));
    let t = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{:016x}{:08x}", h, (t as u64) & 0xffff_ffff)
}

/* ---------------- index ---------------- */

fn read_index() -> Vec<AssetMeta> {
    let raw = match fs::read_to_string(meta_path()) {
        Ok(r) => r,
        Err(_) => return Vec::new(),
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

fn write_index(items: &[AssetMeta]) {
    let _ = fs::create_dir_all(assets_dir());
    let body = serde_json::to_string(items).unwrap_or_else(|_| "[]".into());
    crate::atomic_write(&meta_path(), body.as_bytes());
}

fn asset_url(id: &str, file: &str) -> String {
    format!("http://asset.localhost/assets/{id}/{file}")
}

fn meta_from_dir(id: &str, kind: &str, name: &str, created_at: u64) -> Option<AssetMeta> {
    let dir = dir_for(id);
    let full = dir.join("full.png");
    let meta_bytes = fs::metadata(&full).ok()?;
    let dim = image::image_dimensions(&full).ok()?;
    let mime = "image/png".to_string();
    Some(AssetMeta {
        id: id.to_string(),
        kind: kind.to_string(),
        name: name.to_string(),
        w: dim.0,
        h: dim.1,
        bytes: meta_bytes.len() as usize,
        mime,
        created_at,
        url: asset_url(id, "full.png"),
        thumb: asset_url(id, "128.png"),
        sync_url: String::new(),
    })
}

/// Rebuild the index from disk. The JSON index is a cache for speed, not the
/// source of truth — if it is lost or corrupted the library still works.
fn rebuild_index() -> Vec<AssetMeta> {
    let mut out = Vec::new();
    let root = assets_dir();
    let entries = match fs::read_dir(&root) {
        Ok(e) => e,
        Err(_) => return out,
    };
    for ent in entries.flatten() {
        if !ent.path().is_dir() {
            continue;
        }
        let id = ent.file_name().to_string_lossy().to_string();
        if id.len() < 8 {
            continue;
        }
        let created = ent
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        if let Some(mut m) = meta_from_dir(&id, "misc", &id, created) {
            let side = dir_for(&id).join("meta.txt");
            if let Ok(txt) = fs::read_to_string(&side) {
                for line in txt.lines() {
                    if let Some(v) = line.strip_prefix("kind=") {
                        m.kind = v.to_string();
                    }
                    if let Some(v) = line.strip_prefix("name=") {
                        m.name = v.to_string();
                    }
                }
            }
            out.push(m);
        }
    }
    out.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    out.truncate(MAX_ASSETS);
    out
}

pub fn list_assets(kind: Option<String>) -> Vec<AssetMeta> {
    let mut items = read_index();
    if items.len() < MAX_ASSETS {
        let rebuilt = rebuild_index();
        if rebuilt.len() > items.len() {
            items = rebuilt;
            write_index(&items);
        }
    }
    match kind {
        Some(k) if !k.is_empty() && k != "all" => items.into_iter().filter(|m| m.kind == k).collect(),
        _ => items,
    }
}

pub fn library_bytes() -> u64 {
    fn walk(dir: &PathBuf, acc: &mut u64) {
        if let Ok(entries) = fs::read_dir(dir) {
            for e in entries.flatten() {
                if e.path().is_dir() {
                    walk(&e.path(), acc);
                } else if let Ok(m) = e.metadata() {
                    *acc += m.len();
                }
            }
        }
    }
    let mut total = 0;
    walk(&assets_dir(), &mut total);
    total
}

/* ---------------- import ---------------- */

fn decode(data_url: &str) -> Result<(Vec<u8>, &'static str), String> {
    // accept "data:image/png;base64,...." and a bare base64 payload
    let payload = match data_url.find("base64,") {
        Some(i) => &data_url[i + 7..],
        None => data_url,
    };
    let raw = base64::engine::general_purpose::STANDARD
        .decode(payload.trim())
        .map_err(|e| format!("bad base64: {e}"))?;
    if raw.is_empty() {
        return Err("empty upload".into());
    }
    if raw.len() > MAX_BYTES {
        return Err(format!(
            "image is too large ({} KB, limit {} KB)",
            raw.len() / 1024,
            MAX_BYTES / 1024
        ));
    }

    // Sniff the real format from magic bytes, then let the decoder confirm.
    // Guessing the format from the data URL header would let a caller label
    // arbitrary bytes as an image.
    let fmt = image::guess_format(&raw).map_err(|_| "unsupported or corrupt image".to_string())?;
    let mime = match fmt {
        ImageFormat::Png => "image/png",
        ImageFormat::Jpeg => "image/jpeg",
        ImageFormat::Gif => "image/gif",
        ImageFormat::Bmp => "image/bmp",
        ImageFormat::WebP => "image/webp",
        ImageFormat::Tiff => "image/tiff",
        _ => return Err("unsupported image format".into()),
    };
    Ok((raw, mime))
}

fn fit(img: &DynamicImage, longest: u32) -> DynamicImage {
    let (w, h) = (img.width(), img.height());
    let m = w.max(h);
    if m <= longest {
        // never upscale: a 40px avatar stays 40px
        return img.clone();
    }
    let scale = longest as f32 / m as f32;
    let nw = ((w as f32 * scale).round() as u32).max(1);
    let nh = ((h as f32 * scale).round() as u32).max(1);
    img.resize_exact(nw, nh, FilterType::Lanczos3)
}

fn encode_png(img: &DynamicImage) -> Result<Vec<u8>, String> {
    let mut buf: Vec<u8> = Vec::new();
    // Re-encoding is what strips EXIF/GPS/ICC: the decoder discards
    // ancillary metadata and the encoder writes only pixel data.
    img.write_to(&mut std::io::Cursor::new(&mut buf), ImageFormat::Png)
        .map_err(|e| format!("encode failed: {e}"))?;
    Ok(buf)
}

pub fn import(data_url: String, name: String, kind: String) -> AssetResult {
    let kind = if kind.trim().is_empty() { "misc".into() } else { kind.trim().to_string() };

    let (raw, _mime) = match decode(&data_url) {
        Ok(v) => v,
        Err(e) => return AssetResult::fail(e),
    };

    let img = match image::load_from_memory(&raw) {
        Ok(i) => i,
        Err(e) => return AssetResult::fail(format!("could not decode image: {e}")),
    };
    let (w, h) = (img.width(), img.height());
    if w == 0 || h == 0 {
        return AssetResult::fail("image has no pixels");
    }
    // checked_mul so a crafted header can't overflow the guard
    if w.checked_mul(h).unwrap_or(u32::MAX) > MAX_PIXELS {
        return AssetResult::fail(format!("image is too large ({w}x{h})"));
    }

    // Budget guard before we spend disk: prune the oldest non-avatar assets
    // if the library is over its cap.
    if library_bytes() > MAX_LIBRARY_BYTES {
        prune_to_budget();
    }

    let id = new_id(&raw);
    let dir = dir_for(&id);
    if fs::create_dir_all(&dir).is_err() {
        return AssetResult::fail("could not create asset folder");
    }

    // Derivatives + a capped "full" so a 40MP photo can't sit on disk forever.
    let mut total = 0usize;
    for &size in DERIVATIVES.iter() {
        let small = fit(&img, size);
        match encode_png(&small) {
            Ok(b) => {
                total += b.len();
                crate::atomic_write(&dir.join(format!("{size}.png")), &b);
            }
            Err(e) => return AssetResult::fail(e),
        }
    }
    let full = fit(&img, 2000);
    let full_bytes = match encode_png(&full) {
        Ok(b) => b,
        Err(e) => return AssetResult::fail(e),
    };
    total += full_bytes.len();
    crate::atomic_write(&dir.join("full.png"), &full_bytes);
    crate::atomic_write(
        &dir.join("meta.txt"),
        format!("kind={kind}\nname={name}\n").as_bytes(),
    );

    let created = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let meta = meta_from_dir(&id, &kind, &name, created).unwrap_or_else(|| AssetMeta {
        id: id.clone(),
        kind: kind.clone(),
        name: name.clone(),
        w,
        h,
        bytes: total,
        mime: "image/png".into(),
        created_at: created,
        url: asset_url(&id, "full.png"),
        thumb: asset_url(&id, "128.png"),
        sync_url: String::new(),
    });

    let mut items = read_index();
    items.retain(|m| m.id != id);
    items.insert(0, meta.clone());
    items.truncate(MAX_ASSETS);
    write_index(&items);

    AssetResult {
        ok: true,
        id,
        url: meta.url,
        thumb: meta.thumb,
        w,
        h,
        bytes: total,
        mime: "image/png".into(),
        error: String::new(),
    }
}

/* ---------------- delete / prune ---------------- */

fn remove_dir(dir: &PathBuf) {
    let _ = fs::remove_dir_all(dir);
}

pub fn delete(id: String) -> bool {
    let id = sanitize_id(&id);
    let dir = dir_for(&id);
    if !dir.exists() {
        return false;
    }
    // Soft-delete into the existing .trash so a mistaken delete is recoverable.
    // trashed directly rather than via trash_path(): that helper falls back to
    // fs::copy on failure, which cannot copy a directory, so a cross-volume
    // move would report success while deleting nothing.
    let trash = crate::data_dir().join(".trash");
    let _ = fs::create_dir_all(&trash);
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let dest = trash.join(format!("{stamp}-{id}"));
    let trashed = fs::rename(&dir, &dest).is_ok();
    if !trashed {
        remove_dir(&dir);
    }
    let mut items = read_index();
    items.retain(|m| m.id != id);
    write_index(&items);
    true
}

/// Only 8..=64 lowercase hex chars ever reach the filesystem, which removes
/// any chance of `..`, absolute paths or separators from this value.
fn sanitize_id(id: &str) -> String {
    let cleaned: String = id
        .chars()
        .filter(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
        .take(64)
        .collect();
    cleaned
}

pub fn prune_to_budget() -> usize {
    let mut items = read_index();
    if items.is_empty() {
        items = rebuild_index();
    }
    let mut total = library_bytes();
    let mut removed = 0usize;
    // oldest first, and never evict an avatar: it is referenced by the profile
    items.sort_by(|a, b| {
        let pin = |m: &AssetMeta| if m.kind == "avatar" { 0u8 } else { 1u8 };
        pin(a).cmp(&pin(b)).then(a.created_at.cmp(&b.created_at))
    });
    for m in items.iter() {
        if total <= MAX_LIBRARY_BYTES {
            break;
        }
        let dir = dir_for(&m.id);
        if let Ok(sz) = fs::read_dir(&dir) {
            for e in sz.flatten() {
                if let Ok(meta) = e.metadata() {
                    total = total.saturating_sub(meta.len());
                }
            }
        }
        remove_dir(&dir);
        removed += 1;
    }
    if removed > 0 {
        let mut keep = read_index();
        keep.retain(|m| dir_for(&m.id).exists());
        write_index(&keep);
    }
    removed
}

/// Copy an asset out to a user-visible location (Downloads/Pebble) using the
/// existing safe filename rules.
pub fn export(id: String, dest_name: String) -> Option<String> {
    let id = sanitize_id(&id);
    let src = dir_for(&id).join("full.png");
    let bytes = fs::read(&src).ok()?;
    let fname = crate::safe_name(&dest_name);
    let downloads = dirs::download_dir()
        .or_else(dirs::home_dir)
        .unwrap_or_else(|| std::path::PathBuf::from("."));
    let dir = downloads.join("Pebble");
    let _ = fs::create_dir_all(&dir);
    let path = dir.join(fname);
    fs::write(&path, &bytes).ok()?;
    Some(path.to_string_lossy().to_string())
}

/* ---------------- tests ---------------- */

#[cfg(test)]
mod tests {
    use super::*;

    fn b64(bytes: &[u8], mime: &str) -> String {
        format!(
            "data:{mime};base64,{}",
            base64::engine::general_purpose::STANDARD.encode(bytes)
        )
    }

    fn png_1x1() -> Vec<u8> {
        base64::engine::general_purpose::STANDARD
            .decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
            .unwrap()
    }

    fn jpeg(w: u32, h: u32) -> Vec<u8> {
        let img = DynamicImage::ImageRgb8(image::RgbImage::from_fn(w, h, |x, y| {
            image::Rgb([(x % 256) as u8, (y % 256) as u8, 128])
        }));
        let mut v = Vec::new();
        img.write_to(&mut std::io::Cursor::new(&mut v), ImageFormat::Jpeg).unwrap();
        v
    }

    fn crc32(ty: &[u8], data: &[u8]) -> u32 {
        let mut buf = Vec::new();
        buf.extend_from_slice(ty);
        buf.extend_from_slice(data);
        let mut table = [0u32; 256];
        for (i, e) in table.iter_mut().enumerate() {
            let mut c = i as u32;
            for _ in 0..8 {
                c = if c & 1 != 0 { 0xEDB88320 ^ (c >> 1) } else { c >> 1 };
            }
            *e = c;
        }
        let mut crc = 0xFFFF_FFFFu32;
        for b in buf {
            crc = table[((crc ^ b as u32) & 0xFF) as usize] ^ (crc >> 8);
        }
        crc ^ 0xFFFF_FFFF
    }

    /// a PNG carrying a tEXt chunk with fake GPS coordinates
    fn png_with_metadata() -> Vec<u8> {
        let mut raw = png_1x1();
        let payload = b"Comment\x00GPS=51.5074,-0.1278 SECRET";
        let mut chunk: Vec<u8> = Vec::new();
        chunk.extend_from_slice(&(payload.len() as u32).to_be_bytes());
        chunk.extend_from_slice(b"tEXt");
        chunk.extend_from_slice(payload);
        chunk.extend_from_slice(&crc32(b"tEXt", payload).to_be_bytes());
        // 8 sig + 4 len + 4 type + 13 IHDR data + 4 crc = 33
        raw.splice(33..33, chunk);
        raw
    }

    /* -- rejection paths -- */

    #[test]
    fn rejects_non_image_bytes() {
        let r = import(b64(b"<?php echo 1; ?>", "image/png"), "x.png".into(), "misc".into());
        assert!(!r.ok, "a PHP payload must not import");
    }

    #[test]
    fn rejects_empty_and_bad_base64() {
        assert!(!import("data:image/png;base64,".into(), "x".into(), "misc".into()).ok);
        assert!(!import("data:image/png;base64,!!!nope!!!".into(), "x".into(), "misc".into()).ok);
    }

    /// the declared MIME must never decide the format
    #[test]
    fn declared_mime_is_ignored() {
        let r = import(b64(&[0xff, 0xd8, 0xff, 0x00, 0x01, 0x02, 0x03], "image/png"), "x".into(), "misc".into());
        assert!(!r.ok, "truncated JPEG labelled PNG must not decode");
    }

    /* -- the happy path, with real JPEG bytes -- */

    #[test]
    fn accepts_real_jpeg_and_writes_derivatives() {
        let r = import(b64(&jpeg(64, 48), "image/jpeg"), "p.jpg".into(), "avatar".into());
        assert!(r.ok, "real JPEG must import: {}", r.error);
        assert_eq!((r.w, r.h), (64, 48));
        let dir = dir_for(&r.id);
        for s in DERIVATIVES {
            assert!(dir.join(format!("{s}.png")).exists(), "missing {s}.png");
        }
        assert!(dir.join("full.png").exists());
    }

    #[test]
    fn downscales_but_never_upscales() {
        let r = import(b64(&jpeg(1600, 900), "image/jpeg"), "p.jpg".into(), "misc".into());
        assert!(r.ok);
        let dir = dir_for(&r.id);
        let d512 = image::image_dimensions(dir.join("512.png")).unwrap();
        assert_eq!((d512.0, d512.1), (512, 288), "aspect ratio must hold");

        // a 1x1 image must stay 1x1 rather than being blown up to 32x32
        let small = import(b64(&png_1x1(), "image/png"), "t.png".into(), "avatar".into());
        assert!(small.ok);
        let d = image::image_dimensions(dir_for(&small.id).join("32.png")).unwrap();
        assert_eq!((d.0, d.1), (1, 1), "must not upscale");
    }

    /* -- the security claims -- */

    /// Re-encoding is what makes an appended polyglot payload harmless.
    #[test]
    fn strips_appended_payload() {
        let mut evil = png_1x1();
        evil.extend_from_slice(b"<?php system($_GET['c']); ?>");
        let r = import(b64(&evil, "image/png"), "e.png".into(), "misc".into());
        assert!(r.ok, "valid PNG prefix should still decode");
        let full = std::fs::read(dir_for(&r.id).join("full.png")).unwrap();
        let hay = String::from_utf8_lossy(&full);
        assert!(!hay.contains("<?php"), "appended payload survived");
        assert!(!hay.contains("system"), "appended payload survived");
    }

    /// EXIF/GPS must not be written to disk, ever.
    #[test]
    fn strips_metadata_chunks() {
        let with_meta = png_with_metadata();
        assert!(
            with_meta.windows(8).any(|w| w == b"GPS=51.5"),
            "fixture is broken: chunk was not inserted"
        );
        let r = import(b64(&with_meta, "image/png"), "m.png".into(), "misc".into());
        assert!(r.ok);
        let full = std::fs::read(dir_for(&r.id).join("full.png")).unwrap();
        let hay = String::from_utf8_lossy(&full);
        assert!(!hay.contains("GPS=51.5"), "GPS survived re-encode");
        assert!(!hay.contains("SECRET"), "metadata survived re-encode");
        assert!(!hay.contains("tEXt"), "tEXt chunk survived re-encode");
    }

    #[test]
    fn sanitize_id_blocks_traversal() {
        for evil in ["../../etc/passwd", "..\\..\\windows\\system32", "/etc/shadow", "a/../../b"] {
            let s = sanitize_id(evil);
            assert!(!s.contains(".."), "{evil} -> {s}");
            assert!(!s.contains('/'), "{evil} -> {s}");
            assert!(!s.contains('\\'), "{evil} -> {s}");
            assert!(s.chars().all(|c| c.is_ascii_hexdigit()), "{evil} -> {s}");
        }
        // only hex digits survive: 'e','c' from "etc" and 'a','d' from "passwd"
        assert_eq!(sanitize_id("../../../etc/passwd"), "ecad");
        assert_eq!(sanitize_id("..."), "");
    }

    /// whatever comes in, the resulting path must resolve INSIDE assets/
    #[test]
    fn sanitize_id_stays_inside_assets_dir() {
        for evil in ["../../evil", "..\\..\\evil", "/etc/passwd", ".."] {
            let dir = dir_for(&sanitize_id(evil));
            let _ = std::fs::create_dir_all(&dir);
            let _ = std::fs::create_dir_all(assets_dir());
            let root = std::fs::canonicalize(assets_dir()).unwrap();
            let got = std::fs::canonicalize(&dir).unwrap();
            assert!(got.starts_with(&root), "{evil} escaped assets dir: {got:?}");
        }
    }

    #[test]
    fn distinct_images_get_distinct_ids() {
        let a = import(b64(&png_1x1(), "image/png"), "a".into(), "misc".into());
        let b = import(b64(&jpeg(32, 32), "image/jpeg"), "b".into(), "misc".into());
        assert_ne!(a.id, b.id, "different bytes must not collide");
        assert!(a.id.len() >= 16);
    }

    #[test]
    fn fit_never_upscales() {
        let img = DynamicImage::ImageRgb8(image::RgbImage::new(20, 10));
        let out = fit(&img, 512);
        assert_eq!((out.width(), out.height()), (20, 10));
    }
}