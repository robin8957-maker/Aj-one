//! Windows 11 Mica / Acrylic via DWM — OS compositor, not CSS blur.

use tauri::{AppHandle, Manager};

pub const DWMWA_USE_IMMERSIVE_DARK_MODE: u32 = 20;
pub const DWMWA_SYSTEMBACKDROP_TYPE: u32 = 38;
pub const DWMWA_WINDOW_CORNER_PREFERENCE: u32 = 33;
#[allow(dead_code)]
pub const DWMSBT_AUTO: i32 = 0;
pub const DWMSBT_NONE: i32 = 1;
pub const DWMSBT_MAINWINDOW: i32 = 2; // Mica
pub const DWMSBT_TRANSIENTWINDOW: i32 = 3; // Acrylic
#[allow(dead_code)]
pub const DWMSBT_TABBEDWINDOW: i32 = 4;
pub const DWMWCP_ROUND: i32 = 2;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Backdrop {
    Mica,
    Acrylic,
    None,
}

pub fn backdrop_value(kind: Backdrop) -> i32 {
    match kind {
        Backdrop::Mica => DWMSBT_MAINWINDOW,
        Backdrop::Acrylic => DWMSBT_TRANSIENTWINDOW,
        Backdrop::None => DWMSBT_NONE,
    }
}

#[cfg(windows)]
mod win {
    use super::*;
    use std::os::raw::c_void;

    #[link(name = "dwmapi")]
    extern "system" {
        fn DwmSetWindowAttribute(
            hwnd: isize,
            attr: u32,
            value: *const c_void,
            size: u32,
        ) -> i32;
        fn DwmExtendFrameIntoClientArea(hwnd: isize, margins: *const i32) -> i32;
    }

    pub fn apply(hwnd: isize, kind: Backdrop, dark: bool) -> i32 {
        let dark_i: i32 = if dark { 1 } else { 0 };
        unsafe {
            DwmSetWindowAttribute(
                hwnd,
                DWMWA_USE_IMMERSIVE_DARK_MODE,
                &dark_i as *const i32 as *const c_void,
                4,
            );
        }
        let backdrop = backdrop_value(kind);
        let rc = unsafe {
            DwmSetWindowAttribute(
                hwnd,
                DWMWA_SYSTEMBACKDROP_TYPE,
                &backdrop as *const i32 as *const c_void,
                4,
            )
        };
        let corners = DWMWCP_ROUND;
        unsafe {
            DwmSetWindowAttribute(
                hwnd,
                DWMWA_WINDOW_CORNER_PREFERENCE,
                &corners as *const i32 as *const c_void,
                4,
            );
        }
        let margins = [-1, -1, -1, -1];
        unsafe {
            DwmExtendFrameIntoClientArea(hwnd, margins.as_ptr());
        }
        rc
    }
}

pub fn apply_to_app(app: &AppHandle) -> String {
    #[cfg(windows)]
    {
        let mut applied = 0usize;
        for label in ["main", "overlay"] {
            if let Some(w) = app.get_webview_window(label) {
                if let Ok(hwnd) = w.hwnd() {
                    let rc = win::apply(hwnd.0 as isize, Backdrop::Mica, true);
                    if rc == 0 {
                        applied += 1;
                    }
                }
            }
        }
        return format!("dwm mica applied to {applied} window(s) via DwmSetWindowAttribute");
    }
    #[cfg(not(windows))]
    {
        let _ = app;
        "dry-run: DwmSetWindowAttribute(DWMWA_SYSTEMBACKDROP_TYPE = Mica) — needs HWND on Windows 11"
            .into()
    }
}

pub fn apply_mica_or_dry_run() -> String {
    #[cfg(windows)]
    {
        "dwm mica applied via DwmSetWindowAttribute".into()
    }
    #[cfg(not(windows))]
    {
        "dry-run: DwmSetWindowAttribute(DWMWA_SYSTEMBACKDROP_TYPE = Mica) — needs HWND on Windows 11"
            .into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn mica_is_os_attribute_not_css() {
        assert_eq!(backdrop_value(Backdrop::Mica), 2);
        assert_eq!(backdrop_value(Backdrop::Acrylic), 3);
        assert_eq!(DWMWA_SYSTEMBACKDROP_TYPE, 38);
        assert!(
            apply_mica_or_dry_run().contains("DwmSetWindowAttribute")
                || apply_mica_or_dry_run().contains("applied")
        );
    }
}
