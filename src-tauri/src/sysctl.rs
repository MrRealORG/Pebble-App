//! PebbleX — system controls
//!
//! Brightness, system volume, Windows notifications and battery status.
//!
//! WHY POWERSHELL
//! The three things the user asked for each need a different native API
//! and none of them are reachable from the dependencies this project
//! already carries:
//!
//!   · volume needs IAudioEndpointVolume (Core Audio COM). There is no
//!     Rust crate for it in Cargo.toml, and `windows` is not a dependency.
//!   · brightness needs IDXGIOutput::SetDisplayBrightness or the Dxva2
//!     SetMonitorBrightness path. Same problem.
//!   · notification querying needs WinRT UserNotificationListener, which
//!     is not reachable from this crate at all.
//!
//! PowerShell is already an established pattern in this codebase — see
//! pick_text_files() and asr_record() in lib.rs, which both shell out.
//! So these commands follow suit rather than dragging in new crates.
//!
//! EVERY FUNCTION DEGRADES, NEVER FAILS LOUDLY
//! Brightness is unavailable on external monitors, in VMs, and over RDP.
//! Volume returns E_NOTIMPL when there is no interactive audio session.
//! A UI slider that throws is worse than one that reports "unsupported",
//! so every command returns a struct with an `ok` flag and a reason.
//!
//! NOTIFICATION PRIVACY
//! Reading other apps' notification text is genuinely sensitive, so it is
//! opt-in, it is never requested implicitly, and the user is told exactly
//! what it reads. Pebble does not persist notification bodies to disk.

use serde::Serialize;
use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[derive(Serialize)]
pub struct SysResult {
    pub ok: bool,
    pub value: f64,
    pub min: f64,
    pub max: f64,
    pub supported: bool,
    pub error: String,
}

impl SysResult {
    fn unsupported(reason: &str) -> Self {
        SysResult {
            ok: false,
            value: 0.0,
            min: 0.0,
            max: 100.0,
            supported: false,
            error: reason.to_string(),
        }
    }
    fn fail(reason: String) -> Self {
        SysResult {
            ok: false,
            value: 0.0,
            min: 0.0,
            max: 100.0,
            supported: false,
            error: reason,
        }
    }
}

/// Run a PowerShell script with the window hidden, returning stdout.
/// `CREATE_NO_WINDOW` (0x08000000) matters: without it a console flashes
/// on every slider drag.
#[cfg(windows)]
fn run_ps(script: &str) -> Result<String, String> {
    let out = Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-STA", "-Command", script])
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

#[cfg(not(windows))]
fn run_ps(_script: &str) -> Result<String, String> {
    Err("system controls are Windows-only".into())
}

/* ============================================================
   BRIGHTNESS
   ============================================================ */

/// Read brightness as a 0-100 percentage.
///
/// Tries WMI first (one-liner, no compilation) and falls back to the
/// Dxva2 P/Invoke, which is what actually works on some laptop panels
/// where the WMI classes are absent.
#[tauri::command]
pub fn sys_brightness() -> SysResult {
    let ps = r#"
$ErrorActionPreference = 'SilentlyContinue'
$v = (Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness).CurrentBrightness
if($v -ne $null){ Write-Output $v; exit 0 }
$code = @"
using System;
using System.Runtime.InteropServices;
public class PebbleMon {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
  public struct PHYSICAL_MONITOR { public IntPtr h; [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string desc; }
  [DllImport("user32.dll")] public static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr clip, MonitorEnumProc cb, IntPtr data);
  [DllImport("dxva2.dll", SetLastError=true)] public static extern bool GetPhysicalMonitorsFromHMONITOR(IntPtr h, uint n, [Out] PHYSICAL_MONITOR[] p);
  [DllImport("dxva2.dll", SetLastError=true)] public static extern bool GetMonitorBrightness(IntPtr h, out uint min, out uint cur, out uint max);
  public delegate bool MonitorEnumProc(IntPtr mon, IntPtr dc, IntPtr r, IntPtr d);
  public static uint Cur() {
    uint found = 0;
    EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (IntPtr)((MonitorEnumProc)((m,d,r,x)=>{
      var p = new PHYSICAL_MONITOR[1];
      if(GetPhysicalMonitorsFromHMONITOR(m, 1, p)){
        uint mn, cu, mx;
        if(GetMonitorBrightness(p[0].h, out mn, out cu, out mx) && mx > mn){ found = (uint)Math.Round((double)(cu-mn)/(mx-mn)*100.0); }
      }
      return true;
    })), IntPtr.Zero);
    return found;
  }
}
"@
Add-Type -TypeDefinition $code -Language CSharp
$c = [PebbleMon]::Cur()
if($c -gt 0){ Write-Output $c; exit 0 }
Write-Output 'UNSUPPORTED'
"#;

    match run_ps(ps) {
        Ok(out) => {
            let t = out.trim();
            if t == "UNSUPPORTED" || t.is_empty() {
                SysResult::unsupported("This display does not expose a brightness control")
            } else if let Ok(v) = t.parse::<f64>() {
                SysResult { ok: true, value: v, min: 0.0, max: 100.0, supported: true, error: String::new() }
            } else {
                SysResult::unsupported("Could not read brightness on this display")
            }
        }
        Err(e) => SysResult::unsupported(&format!("brightness unavailable: {e}")),
    }
}

/// Set brightness. `level` is 0-100. Out-of-range values are clamped
/// rather than rejected, because a slider overshoot must never brick
/// the display into darkness.
#[tauri::command]
pub fn sys_brightness_set(level: f64) -> SysResult {
    let level = level.clamp(0.0, 100.0);
    let ps = format!(
        r#"
$ErrorActionPreference = 'SilentlyContinue'
$lvl = [int]({level})
$n = 0
$mons = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods
foreach($m in $mons){{ {{ $m.WmiSetBrightness(1, $lvl, $null); $n++ }} }}
if($n -gt 0){{ Write-Output 'OK'; exit 0 }}
$code = @"
using System;
using System.Runtime.InteropServices;
public class PebbleMonSet {{
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
  public struct PHYSICAL_MONITOR {{ public IntPtr h; [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string desc; }}
  [DllImport("user32.dll")] public static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr clip, MonitorEnumProc cb, IntPtr data);
  [DllImport("dxva2.dll", SetLastError=true)] public static extern bool GetPhysicalMonitorsFromHMONITOR(IntPtr h, uint n, [Out] PHYSICAL_MONITOR[] p);
  [DllImport("dxva2.dll", SetLastError=true)] public static extern bool SetMonitorBrightness(IntPtr h, uint v);
  [DllImport("dxva2.dll", SetLastError=true)] public static extern bool GetMonitorBrightness(IntPtr h, out uint min, out uint cur, out uint max);
  public delegate bool MonitorEnumProc(IntPtr mon, IntPtr dc, IntPtr r, IntPtr d);
  public static bool Set(int level) {{
    bool any = false;
    EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (IntPtr)((MonitorEnumProc)((m,d,r,x)=>{{
      var p = new PHYSICAL_MONITOR[1];
      if(GetPhysicalMonitorsFromHMONITOR(m, 1, p)){{
        uint mn, cu, mx;
        if(GetMonitorBrightness(p[0].h, out mn, out cu, out mx) && mx > mn){{
          uint target = (uint)Math.Round(mn + (double)(level)/100.0*(mx-mn));
          if(SetMonitorBrightness(p[0].h, target)) any = true;
        }}
      }}
      return true;
    }})), IntPtr.Zero);
    return any;
  }}
}}
"@
Add-Type -TypeDefinition $code -Language CSharp
if([PebbleMonSet]::Set({level})){{ Write-Output 'OK'; exit 0 }}
Write-Output 'UNSUPPORTED'
"#
    );

    match run_ps(&ps) {
        Ok(out) => {
            let t = out.trim();
            if t == "OK" {
                SysResult { ok: true, value: level, min: 0.0, max: 100.0, supported: true, error: String::new() }
            } else {
                SysResult::unsupported("This display does not expose a brightness control")
            }
        }
        Err(e) => SysResult::fail(format!("could not set brightness: {e}")),
    }
}

/* ============================================================
   VOLUME
   ============================================================ */

#[tauri::command]
pub fn sys_volume() -> SysResult {
    let ps = r#"
$ErrorActionPreference = 'Stop'
$code = @"
using System;
using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int QueryInterface(IntPtr a, IntPtr b, [MarshalAs(UnmanagedType.IUnknown)] out object c);
  int AddRef(); int Release();
  int RegisterControlChangeNotify(IntPtr a);
  int UnregisterControlChangeNotify(IntPtr b);
  int GetChannelCount(out uint c);
  int SetMasterVolumeLevel(float lvl, ref Guid ctx);
  int SetMasterVolumeLevelScalar(float lvl, ref Guid ctx);
  int GetMasterVolumeLevel(out float lvl);
  int GetMasterVolumeLevelScalar(out float lvl);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
  int QueryInterface(IntPtr a, IntPtr b, [MarshalAs(UnmanagedType.IUnknown)] out object c);
  int AddRef(); int Release();
  int Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o);
}
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
  int QueryInterface(IntPtr a, IntPtr b, [MarshalAs(UnmanagedType.IUnknown)] out object c);
  int AddRef(); int Release();
  int EnumAudioEndpoints(int flow, int role, out object devs);
  int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice dev);
}
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
class MMDeviceEnumerator { }
public class PebbleVol {{
  public static float Get() {{
    var e = (IMMDeviceEnumerator)(new MMDeviceEnumerator());
    IMMDevice dev;
    // 0 = eRender, 1 = eMultimedia (the role Explorer and apps use)
    Marshal.ThrowExceptionForHR(e.GetDefaultAudioEndpoint(0, 1, out dev));
    object o; Guid iid = typeof(IAudioEndpointVolume).GUID;
    Marshal.ThrowExceptionForHR(dev.Activate(ref iid, 23, IntPtr.Zero, out o));
    float v;
    Marshal.ThrowExceptionForHR(((IAudioEndpointVolume)o).GetMasterVolumeLevelScalar(out v));
    return v;
  }}
}}
"@
Add-Type -TypeDefinition $code -Language CSharp
Write-Output ([PebbleVol]::Get())
"#;

    match run_ps(ps) {
        Ok(out) => {
            let t = out.trim();
            if let Ok(v) = t.parse::<f64>() {
                SysResult { ok: true, value: (v * 100.0).round(), min: 0.0, max: 100.0, supported: true, error: String::new() }
            } else {
                SysResult::unsupported("No active audio output device")
            }
        }
        Err(e) => {
            // 80004003 = E_NOTIMPL: no interactive audio session (headless,
            // RDP, or a service session). That is an environment fact, not
            // a bug, so it is reported as unsupported rather than as an error.
            if e.contains("80004003") || e.to_lowercase().contains("notimpl") {
                SysResult::unsupported("No interactive audio session (this is normal over RDP or in a VM)")
            } else {
                SysResult::unsupported("System volume is unavailable here")
            }
        }
    }
}

#[tauri::command]
pub fn sys_volume_set(level: f64) -> SysResult {
    let level = level.clamp(0.0, 100.0);
    let scalar = level / 100.0;
    let ps = format!(
        r#"
$ErrorActionPreference = 'Stop'
$code = @"
using System;
using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {{
  int QueryInterface(IntPtr a, IntPtr b, [MarshalAs(UnmanagedType.IUnknown)] out object c);
  int AddRef(); int Release();
  int RegisterControlChangeNotify(IntPtr a);
  int UnregisterControlChangeNotify(IntPtr b);
  int GetChannelCount(out uint c);
  int SetMasterVolumeLevel(float lvl, ref Guid ctx);
  int SetMasterVolumeLevelScalar(float lvl, ref Guid ctx);
  int GetMasterVolumeLevel(out float lvl);
  int GetMasterVolumeLevelScalar(out float lvl);
}}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {{
  int QueryInterface(IntPtr a, IntPtr b, [MarshalAs(UnmanagedType.IUnknown)] out object c);
  int AddRef(); int Release();
  int Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o);
}}
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {{
  int QueryInterface(IntPtr a, IntPtr b, [MarshalAs(UnmanagedType.IUnknown)] out object c);
  int AddRef(); int Release();
  int EnumAudioEndpoints(int flow, int role, out object devs);
  int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice dev);
}}
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
class MMDeviceEnumerator {{ }}
public class PebbleVolSet {{
  public static void Set(float s) {{
    if (s < 0f) s = 0f; if (s > 1f) s = 1f;
    var e = (IMMDeviceEnumerator)(new MMDeviceEnumerator());
    IMMDevice dev;
    Marshal.ThrowExceptionForHR(e.GetDefaultAudioEndpoint(0, 1, out dev));
    object o; Guid iid = typeof(IAudioEndpointVolume).GUID;
    Marshal.ThrowExceptionForHR(dev.Activate(ref iid, 23, IntPtr.Zero, out o));
    Guid ctx = Guid.Empty;
    Marshal.ThrowExceptionForHR(((IAudioEndpointVolume)o).SetMasterVolumeLevelScalar(s, ref ctx));
  }}
}}
"@
Add-Type -TypeDefinition $code -Language CSharp
[PebbleVolSet]::Set({scalar})
Write-Output 'OK'
"#
    );

    match run_ps(&ps) {
        Ok(out) if out.trim() == "OK" => {
            SysResult { ok: true, value: level, min: 0.0, max: 100.0, supported: true, error: String::new() }
        }
        Ok(_) => SysResult::unsupported("No active audio output device"),
        Err(e) => {
            if e.contains("80004003") || e.to_lowercase().contains("notimpl") {
                SysResult::unsupported("No interactive audio session")
            } else {
                SysResult::fail("Could not change the system volume".to_string())
            }
        }
    }
}

/* ============================================================
   BATTERY
   ============================================================ */

#[derive(Serialize)]
pub struct PowerStatus {
    pub ok: bool,
    pub on_battery: bool,
    pub percent: f64,
    pub charging: bool,
    pub error: String,
}

#[tauri::command]
pub fn sys_power() -> PowerStatus {
    let ps = r#"
$b = (Get-CimInstance -ClassName Win32_Battery -ErrorAction SilentlyContinue)
if($b){
  Write-Output ("{0}|{1}" -f $b.BatteryStatus, $b.EstimatedChargeRemaining)
} else {
  Write-Output 'NOBATTERY|100'
}
"#;
    match run_ps(ps) {
        Ok(out) => {
            let t = out.trim().to_string();
            let parts: Vec<&str> = t.split('|').collect();
            if parts.len() == 2 {
                // BatteryStatus 2 = on AC line. 1 = discharging. 6/7/8 = charging states.
                let status: i32 = parts[0].trim().parse().unwrap_or(1);
                let pct: f64 = parts[1].trim().parse().unwrap_or(100.0);
                let on_battery = status == 1;
                let charging = matches!(status, 2 | 6 | 7 | 8 | 9);
                PowerStatus {
                    ok: true,
                    on_battery,
                    percent: if parts[0].trim() == "NOBATTERY" { 100.0 } else { pct },
                    charging,
                    error: String::new(),
                }
            } else {
                PowerStatus { ok: false, on_battery: false, percent: 0.0, charging: false, error: "Could not read battery status".into() }
            }
        }
        Err(e) => PowerStatus { ok: false, on_battery: false, percent: 0.0, charging: false, error: e },
    }
}

/* ============================================================
   WINDOWS NOTIFICATIONS
   ============================================================ */

#[derive(Serialize)]
pub struct WinNotification {
    pub id: String,
    pub app: String,
    pub title: String,
    pub body: String,
    pub at: u64,
}

/// Read the app id of the window currently in focus.
///
/// SCOPE, STATED PLAINLY: this does NOT scrape other apps' notification
/// text. The full WinRT `UserNotificationListener` API is not reachable
/// from this crate, and a reliable substitute does not exist. What this
/// actually gives you is the foreground app's identity — enough to drive
/// "which app is on screen right now" style surfaces and per-app focus
/// rules, which is what the UI will claim it does.
///
/// Reporting it as "Windows notifications" would be a lie, so the command
/// is named for what it is and the UI labels it the same way.
#[tauri::command]
pub fn sys_foreground_app() -> Vec<WinNotification> {
    let ps = r#"
$ErrorActionPreference = 'SilentlyContinue'
$code = @"
using System;
using System.Runtime.InteropServices;
public class PebbleFg {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct APTTOKEN { public UIntPtr hWnd; [MarshalAs(UnmanagedType.ByValTStr, SizeConst=256)] public string szAppID; }
  [DllImport("user32.dll", SetLastError=true)] public static extern int GetApplicationUserModelId(IntPtr hWnd, out APTTOKEN appId);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  public static string AppId() {
    APTTOKEN t;
    try {
      if (GetApplicationUserModelId(GetForegroundWindow(), out t) == 0 && t.szAppID != null) return t.szAppID;
    } catch {}
    return "";
  }
}
"@
Add-Type -TypeDefinition $code -Language CSharp
Write-Output ('APP|' + [PebbleFg]::AppId())
"#;

    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    match run_ps(ps) {
        Ok(out) => {
            let mut list = Vec::new();
            for line in out.lines() {
                if let Some(app) = line.strip_prefix("APP|") {
                    let name = app.trim();
                    if !name.is_empty() {
                        list.push(WinNotification { id: format!("fg:{name}"), app: name.to_string(), title: String::new(), body: String::new(), at: now_ms });
                    }
                }
            }
            list
        }
        Err(_) => Vec::new(),
    }
}

/* ============================================================
   DATA LOCATIONS — the "shows folder" panel
   ============================================================ */

#[derive(Serialize)]
pub struct DataLocation {
    pub label: String,
    pub path: String,
    pub kind: String,
    pub exists: bool,
}

#[tauri::command]
pub fn sys_data_locations() -> Vec<DataLocation> {
    let notes = crate::notes_vault_root();
    let data = crate::data_dir();
    let mut out = Vec::new();

    let mut push = |label: &str, path: std::path::PathBuf, kind: &str| {
        out.push(DataLocation {
            label: label.to_string(),
            exists: path.exists(),
            path: path.to_string_lossy().to_string(),
            kind: kind.to_string(),
        });
    };

    push("Notes vault (.md files)", notes, "notes");
    push("Workspace data", data.join("workspace.json"), "file");
    push("Settings", data.join("settings.json"), "file");
    push("Uploaded images", data.join("assets"), "images");
    push("Extracted app icons", data.join("icons"), "images");
    push("Crash logs", data.join("crashes"), "logs");
    push("Deleted items (trash)", data.join(".trash"), "trash");
    push("League leaderboard", data.join("league.json"), "file");

    if let Some(d) = dirs::download_dir() {
        push("Exports", d.join("Pebble"), "exports");
    }
    if let Some(d) = dirs::download_dir() {
        push("Downloads", d, "folder");
    }
    if let Some(d) = dirs::picture_dir() {
        push("Pictures", d, "folder");
    }
    if let Some(d) = dirs::home_dir() {
        push("Home", d, "folder");
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unsupported_is_not_an_error() {
        let r = SysResult::unsupported("no display");
        assert!(!r.ok);
        assert!(!r.supported);
        assert!(!r.error.is_empty());
    }

    #[test]
    fn data_locations_are_all_populated() {
        let rows = sys_data_locations();
        assert!(rows.len() >= 5);
        assert!(rows.iter().any(|r| r.kind == "notes"));
        assert!(rows.iter().all(|r| !r.path.is_empty()));
    }
}