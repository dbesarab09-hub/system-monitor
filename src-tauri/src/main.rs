#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::sync::Mutex;
use sysinfo::{Components, Disks, System};

#[derive(Serialize)]
struct DiskInfo {
    name: String,
    mount: String,
    total: u64,
    available: u64,
}

#[derive(Serialize)]
struct TempInfo {
    label: String,
    value: f32,
}

#[derive(Serialize)]
struct Stats {
    cpu_usage: f32,
    cpu_brand: String,
    per_core: Vec<f32>,
    mem_total: u64,
    mem_used: u64,
    swap_total: u64,
    swap_used: u64,
    disks: Vec<DiskInfo>,
    temps: Vec<TempInfo>,
    gpu_names: Vec<String>,
    os_name: String,
    os_version: String,
    host_name: String,
    uptime: u64,
}

struct AppState {
    sys: Mutex<System>,
    gpu_names: Vec<String>,
}

/// GPU names via WMI (queried once at startup; no extra crates).
/// CREATE_NO_WINDOW keeps a console window from flashing up.
#[cfg(target_os = "windows")]
fn detect_gpus() -> Vec<String> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "(Get-CimInstance Win32_VideoController).Name",
        ])
        .creation_flags(0x0800_0000)
        .output();

    match output {
        Ok(o) => String::from_utf8_lossy(&o.stdout)
            .lines()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect(),
        Err(_) => Vec::new(),
    }
}

#[cfg(not(target_os = "windows"))]
fn detect_gpus() -> Vec<String> {
    Vec::new()
}

#[tauri::command]
fn get_stats(state: tauri::State<'_, AppState>) -> Stats {
    let mut sys = state.sys.lock().expect("system state poisoned");
    sys.refresh_cpu_usage();
    sys.refresh_memory();

    let disks = Disks::new_with_refreshed_list()
        .iter()
        .map(|d| DiskInfo {
            name: d.name().to_string_lossy().into_owned(),
            mount: d.mount_point().to_string_lossy().into_owned(),
            total: d.total_space(),
            available: d.available_space(),
        })
        .collect();

    let temps = Components::new_with_refreshed_list()
        .iter()
        .map(|c| TempInfo {
            label: c.label().to_string(),
            value: c.temperature(),
        })
        .collect();

    Stats {
        cpu_usage: sys.global_cpu_usage(),
        cpu_brand: sys
            .cpus()
            .first()
            .map(|c| c.brand().to_string())
            .unwrap_or_default(),
        per_core: sys.cpus().iter().map(|c| c.cpu_usage()).collect(),
        mem_total: sys.total_memory(),
        mem_used: sys.used_memory(),
        swap_total: sys.total_swap(),
        swap_used: sys.used_swap(),
        disks,
        temps,
        gpu_names: state.gpu_names.clone(),
        os_name: System::name().unwrap_or_default(),
        os_version: System::os_version().unwrap_or_default(),
        host_name: System::host_name().unwrap_or_default(),
        uptime: System::uptime(),
    }
}

fn main() {
    let mut sys = System::new_all();
    sys.refresh_all();

    let state = AppState {
        sys: Mutex::new(sys),
        gpu_names: detect_gpus(),
    };

    tauri::Builder::default()
        .manage(state)
        .invoke_handler(tauri::generate_handler![get_stats])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
