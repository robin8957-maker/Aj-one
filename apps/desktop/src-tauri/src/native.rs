//! Tauri v2 command surface — real window chrome, never Electron.

use crate::ipc::{authorize_chrome_ipc, authorize_renderer_ipc};
use crate::overlay::overlay_window;
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NativeCmd {
    Approve,
    Reject,
    Minimize,
    Maximize,
    Close,
    OverlayToggle,
    PanicStop,
}

pub fn parse_native_cmd(name: &str) -> Result<NativeCmd, String> {
    match name {
        "mission.approve" => Ok(NativeCmd::Approve),
        "mission.reject" => Ok(NativeCmd::Reject),
        "window.minimize" => Ok(NativeCmd::Minimize),
        "window.maximize" => Ok(NativeCmd::Maximize),
        "window.close" => Ok(NativeCmd::Close),
        "overlay.toggle" => Ok(NativeCmd::OverlayToggle),
        "tray.panic" => Ok(NativeCmd::PanicStop),
        other => Err(format!("unknown native command: {other}")),
    }
}

pub fn dispatch_webview(cmd: &str, payload: &str, from_chrome: bool) -> Result<NativeCmd, String> {
    if from_chrome {
        authorize_chrome_ipc(cmd, payload)?;
    } else {
        authorize_renderer_ipc(cmd, payload)?;
    }
    parse_native_cmd(cmd)
}

pub fn apply_chrome(window: &WebviewWindow, cmd: NativeCmd) -> Result<String, String> {
    match cmd {
        NativeCmd::Minimize => {
            window.minimize().map_err(|e| e.to_string())?;
            Ok("minimized".into())
        }
        NativeCmd::Maximize => {
            if window.is_maximized().unwrap_or(false) {
                window.unmaximize().map_err(|e| e.to_string())?;
                Ok("restored".into())
            } else {
                window.maximize().map_err(|e| e.to_string())?;
                Ok("maximized".into())
            }
        }
        NativeCmd::Close => {
            window.hide().map_err(|e| e.to_string())?;
            Ok("hidden".into())
        }
        NativeCmd::OverlayToggle => {
            crate::overlay::toggle_overlay(window.app_handle())?;
            Ok("overlay-toggled".into())
        }
        NativeCmd::PanicStop => {
            panic_stop(window.app_handle())?;
            Ok("panic".into())
        }
        NativeCmd::Approve | NativeCmd::Reject => Ok(format!("{cmd:?}").to_ascii_lowercase()),
    }
}

pub fn panic_stop(app: &AppHandle) -> Result<(), String> {
    crate::ajd::dispatch_overlay(&crate::overlay::OverlayIntent::Stop);
    crate::overlay::hide_overlay(app)?;
    let _ = app.emit("aj://panic", "stop");
    Ok(())
}

pub fn overlay_spec() -> (bool, bool, &'static str) {
    let w = overlay_window();
    (w.decorations, w.always_on_top, w.url_path)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn webview_cannot_write_host() {
        assert!(dispatch_webview("fs.write", "x", false).is_err());
        assert!(dispatch_webview("mission.approve", "apr_1", false).is_ok());
        assert!(dispatch_webview("window.minimize", "", true).is_ok());
        assert!(dispatch_webview("window.minimize", "", false).is_err());
        let (decorations, on_top, path) = overlay_spec();
        assert!(!decorations);
        assert!(on_top);
        assert_eq!(path, "/overlay");
    }
}
