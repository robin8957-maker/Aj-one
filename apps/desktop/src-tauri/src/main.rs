//! ALJWHARAH ONE native host — real Tauri/WebView2 window.
//! No Electron. Default launch opens the Windows app. CLI verbs stay for
//! Explorer context-menu / tests.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ajd;
mod context_menu;
mod dwm;
mod hotkey;
mod ipc;
mod keychain;
mod native;
mod overlay;
mod pipe;
mod service;
mod tray;
mod updater;
mod win_toast;

use ipc::authorize_ipc;
use overlay::{parse_overlay_intent, OverlayIntent};
use tauri::{AppHandle, Manager, WebviewWindow};

fn dispatch_to_ajd(intent: &OverlayIntent) {
    ajd::dispatch_overlay(intent);
}

#[tauri::command]
fn native_invoke(window: WebviewWindow, cmd: String, payload: Option<String>) -> Result<String, String> {
    let payload = payload.unwrap_or_default();
    let from_chrome = ipc::CHROME_ALLOWED.contains(&cmd.as_str());
    let parsed = native::dispatch_webview(&cmd, &payload, from_chrome)?;
    match parsed {
        native::NativeCmd::Approve => ajd::mission_verb("approve", &payload),
        native::NativeCmd::Reject => ajd::mission_verb("reject", &payload),
        other => native::apply_chrome(&window, other),
    }
}

#[tauri::command]
fn overlay_run(app: AppHandle, raw: String) -> Result<String, String> {
    match parse_overlay_intent(&raw)? {
        OverlayIntent::Toggle => {
            overlay::toggle_overlay(&app)?;
            Ok("toggled".into())
        }
        OverlayIntent::Stop => {
            dispatch_to_ajd(&OverlayIntent::Stop);
            overlay::hide_overlay(&app)?;
            Ok("stopped".into())
        }
        OverlayIntent::Start { objective } => {
            dispatch_to_ajd(&OverlayIntent::Start {
                objective: objective.clone(),
            });
            overlay::hide_overlay(&app)?;
            Ok(format!("started:{objective}"))
        }
    }
}

#[tauri::command]
fn host_status() -> serde_json::Value {
    let spec = hotkey::registration();
    serde_json::json!({
        "hotkey": hotkey::commander_hotkey().to_string(),
        "backend": spec.backend,
        "keychain": keychain::backend_name(),
        "keychainReady": keychain::load_master_hex().is_ok(),
        "pipe": pipe::pipe_name(),
        "window": true,
        "tray": true,
    })
}

#[tauri::command]
fn show_toast(app: AppHandle, title: String, body: String, approval_id: String) -> Result<String, String> {
    win_toast::show(&app, &title, &body, &approval_id)
}

#[tauri::command]
async fn updater_check(app: AppHandle, apply: Option<bool>) -> Result<updater::UpdateCheck, String> {
    updater::check_and_apply(app, apply.unwrap_or(false)).await
}

#[tauri::command]
fn get_secret(name: String) -> Result<Option<String>, String> {
    keychain::get_secret(&name)
}

#[tauri::command]
fn set_secret(name: String, value: String) -> Result<bool, String> {
    keychain::set_secret(&name, &value)
}

#[tauri::command]
fn delete_secret(name: String) -> Result<bool, String> {
    keychain::delete_secret(&name)
}

fn launch_app() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = overlay::show_main(app);
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            native_invoke,
            overlay_run,
            host_status,
            show_toast,
            updater_check,
            get_secret,
            set_secret,
            delete_secret
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            if let Err(e) = tray::install(&handle) {
                eprintln!("tray install failed: {e}");
            }
            if let Err(e) = hotkey::arm(&handle) {
                eprintln!("hotkey arm failed: {e}");
            }
            let _ = dwm::apply_to_app(&handle);
            pipe::spawn_server();
            if let Some(main) = handle.get_webview_window("main") {
                let _ = main.show();
                let _ = main.set_focus();
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to start ALJWHARAH ONE");
}

fn run_cli(args: &[String]) -> i32 {
    let cmd = args.first().map(String::as_str).unwrap_or("status");
    let payload = args.get(1).map(String::as_str).unwrap_or("");
    if let Err(e) = authorize_ipc(cmd, payload) {
        eprintln!("{e}");
        return 2;
    }
    match cmd {
        "ping" | "status" => {
            let spec = hotkey::registration();
            println!(
                "hotkey={} backend={} keychain={} window=tauri tray=system",
                hotkey::commander_hotkey(),
                spec.backend,
                keychain::backend_name()
            );
        }
        "toggle-window" | "overlay-show" => {
            launch_app();
            return 0;
        }
        "overlay-run" => match parse_overlay_intent(&format!("start {payload}")) {
            Ok(intent) => dispatch_to_ajd(&intent),
            Err(e) => {
                eprintln!("{e}");
                return 2;
            }
        },
        "overlay-stop" => dispatch_to_ajd(&OverlayIntent::Stop),
        "listen" => {
            launch_app();
            return 0;
        }
        "mission.approve" | "mission.reject" => {
            let verb = if cmd == "mission.approve" {
                "approve"
            } else {
                "reject"
            };
            match ajd::mission_verb(verb, payload) {
                Ok(s) => println!("{s}"),
                Err(e) => {
                    eprintln!("{e}");
                    return 2;
                }
            }
        }
        "window.minimize" | "window.maximize" | "window.close" | "overlay.toggle" | "tray.panic" => {
            match native::dispatch_webview(cmd, payload, true) {
                Ok(native::NativeCmd::PanicStop) => dispatch_to_ajd(&OverlayIntent::Stop),
                Ok(native::NativeCmd::OverlayToggle) => {
                    let w = overlay::overlay_window();
                    println!("show {} {}", w.label, w.url_path);
                }
                Ok(c) => println!("dwm {:?}", c),
                Err(e) => {
                    eprintln!("{e}");
                    return 2;
                }
            }
        }
        "tray-status" => {
            for i in tray::tray_menu(0, true) {
                println!("{}:{}", i.id, i.label);
            }
        }
        "register-shell" => match context_menu::register_shell(payload) {
            Ok(s) => println!("{s}"),
            Err(e) => {
                eprintln!("{e}");
                return 2;
            }
        },
        "service-install" => println!("{}", service::install_command("aljwharah-one.exe")),
        "service" => match service::run_service() {
            Ok(s) => println!("{s}"),
            Err(e) => {
                eprintln!("{e}");
                return 2;
            }
        },
        "toast" => match win_toast::toast_xml("ALJWHARAH ONE", "رصدت خطأ — راجع الدمج", payload) {
            Ok(xml) => {
                if let Err(e) = win_toast::show_standalone(
                    "ALJWHARAH ONE",
                    "رصدت خطأ — راجع الدمج",
                    payload,
                ) {
                    eprintln!("{e}");
                }
                println!("{xml}");
            }
            Err(e) => {
                eprintln!("{e}");
                return 2;
            }
        },
        "mica" => println!("{}", dwm::apply_mica_or_dry_run()),
        "pipe" => println!("{}", pipe::pipe_name()),
        "updater-check" => {
            let offer = updater::UpdateOffer {
                version: payload.to_string(),
                signed: false,
                url: updater::UPDATE_ENDPOINT.into(),
            };
            match updater::accept_offer("0.1.0", &offer) {
                Ok(s) => println!("{s}"),
                Err(e) => println!("{e}"),
            }
        }
        _ => return 1,
    }
    0
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.is_empty() {
        launch_app();
        return;
    }
    attach_parent_console();
    let code = run_cli(&args);
    if code != 0 {
        std::process::exit(code);
    }
}

#[cfg(windows)]
mod win_console {
    #[link(name = "kernel32")]
    extern "system" {
        pub fn AttachConsole(pid: u32) -> i32;
        pub fn AllocConsole() -> i32;
    }
}

fn attach_parent_console() {
    #[cfg(windows)]
    unsafe {
        if win_console::AttachConsole(u32::MAX) == 0 {
            let _ = win_console::AllocConsole();
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::hotkey::is_commander_toggle;
    use crate::ipc::authorize_ipc;
    use crate::overlay::parse_overlay_intent;
    #[test]
    fn ipc_hotkey_overlay() {
        assert!(authorize_ipc("overlay-show", "").is_ok());
        assert!(authorize_ipc("overlay-run", "Add health").is_ok());
        assert!(authorize_ipc("fs.write", "x").is_err());
        assert!(authorize_ipc("mission.approve", "apr_1").is_ok());
        assert!(is_commander_toggle(true, true, "space"));
        assert!(parse_overlay_intent("panic").is_ok());
    }
}
