//! OS-level Commander hotkey.
//! Windows: RegisterHotKey(Ctrl+Shift+Space) + a dedicated message thread.
//! The registration is owned by that thread so the HWND / message pump stay valid.

use std::fmt;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::AppHandle;

pub const HOTKEY_ID: i32 = 0xA11;
pub const MOD_CONTROL: u32 = 0x0002;
pub const MOD_SHIFT: u32 = 0x0004;
pub const MOD_NOREPEAT: u32 = 0x4000;
pub const VK_SPACE: u32 = 0x20;
pub const WM_HOTKEY: u32 = 0x0312;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Hotkey {
    pub ctrl: bool,
    pub shift: bool,
    pub space: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HotkeyRegistration {
    pub id: i32,
    pub modifiers: u32,
    pub vk: u32,
    pub backend: &'static str,
}

impl fmt::Display for Hotkey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Ctrl+Shift+Space")
    }
}

pub fn commander_hotkey() -> Hotkey {
    Hotkey {
        ctrl: true,
        shift: true,
        space: true,
    }
}

pub fn parse_hotkey(spec: &str) -> Option<Hotkey> {
    let s = spec.to_ascii_lowercase();
    if !s.contains("ctrl") || !s.contains("shift") || !s.contains("space") {
        return None;
    }
    Some(commander_hotkey())
}

pub fn is_commander_toggle(ctrl: bool, shift: bool, key: &str) -> bool {
    ctrl && shift && key.eq_ignore_ascii_case("space")
}

pub fn registration() -> HotkeyRegistration {
    HotkeyRegistration {
        id: HOTKEY_ID,
        modifiers: MOD_CONTROL | MOD_SHIFT | MOD_NOREPEAT,
        vk: VK_SPACE,
        backend: if cfg!(windows) {
            "registerhotkey"
        } else {
            "in-process"
        },
    }
}

pub fn is_hotkey_message(msg: u32, wparam: usize) -> bool {
    msg == WM_HOTKEY && wparam as i32 == HOTKEY_ID
}

static ARMED: AtomicBool = AtomicBool::new(false);

pub fn arm(app: &AppHandle) -> Result<HotkeyRegistration, String> {
    let spec = registration();
    if ARMED.swap(true, Ordering::SeqCst) {
        return Ok(spec);
    }
    #[cfg(windows)]
    {
        let handle = app.clone();
        std::thread::Builder::new()
            .name("aj-hotkey".into())
            .spawn(move || win::pump(handle))
            .map_err(|e| e.to_string())?;
    }
    Ok(spec)
}

#[cfg(windows)]
mod win {
    use super::*;
    use std::mem::MaybeUninit;
    #[repr(C)]
    #[derive(Clone, Copy)]
    struct Point {
        x: i32,
        y: i32,
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct Msg {
        hwnd: *mut std::ffi::c_void,
        message: u32,
        wparam: usize,
        lparam: isize,
        time: u32,
        pt: Point,
    }

    #[link(name = "user32")]
    extern "system" {
        fn RegisterHotKey(
            hwnd: *mut std::ffi::c_void,
            id: i32,
            fs_modifiers: u32,
            vk: u32,
        ) -> i32;
        fn UnregisterHotKey(hwnd: *mut std::ffi::c_void, id: i32) -> i32;
        fn GetMessageW(
            lp_msg: *mut Msg,
            hwnd: *mut std::ffi::c_void,
            min: u32,
            max: u32,
        ) -> i32;
        fn TranslateMessage(lp_msg: *const Msg) -> i32;
        fn DispatchMessageW(lp_msg: *const Msg) -> isize;
    }

    pub fn pump(app: AppHandle) {
        let spec = registration();
        let ok = unsafe { RegisterHotKey(std::ptr::null_mut(), spec.id, spec.modifiers, spec.vk) };
        if ok == 0 {
            eprintln!("RegisterHotKey failed — Ctrl+Shift+Space already taken");
            return;
        }
        let mut msg = MaybeUninit::<Msg>::uninit();
        loop {
            let r = unsafe { GetMessageW(msg.as_mut_ptr(), std::ptr::null_mut(), 0, 0) };
            if r <= 0 {
                break;
            }
            let m = unsafe { msg.assume_init() };
            if is_hotkey_message(m.message, m.wparam) {
                let handle = app.clone();
                let _ = handle.clone().run_on_main_thread(move || {
                    let _ = crate::overlay::toggle_overlay(&handle);
                });
            } else {
                unsafe {
                    TranslateMessage(&m);
                    DispatchMessageW(&m);
                }
            }
        }
        unsafe {
            UnregisterHotKey(std::ptr::null_mut(), HOTKEY_ID);
        }
    }
}

#[cfg(windows)]
pub fn register_os_hotkey() -> Result<HotkeyRegistration, String> {
    Ok(registration())
}

#[cfg(not(windows))]
pub fn register_os_hotkey() -> Result<HotkeyRegistration, String> {
    Ok(registration())
}

#[cfg(not(windows))]
pub fn unregister_os_hotkey() {}

#[cfg(windows)]
#[allow(dead_code)]
pub fn unregister_os_hotkey() {}

#[cfg(not(windows))]
pub fn listen_linux_socket() -> std::path::PathBuf {
    std::path::PathBuf::from("/tmp/aj-hotkey.sock")
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_ctrl_shift_space() {
        assert!(parse_hotkey("Ctrl+Shift+Space").is_some());
        assert!(parse_hotkey("alt+space").is_none());
        assert!(is_commander_toggle(true, true, "Space"));
        assert!(!is_commander_toggle(true, false, "Space"));
    }

    #[test]
    fn windows_constants_match_registerhotkey() {
        let r = registration();
        assert_eq!(r.id, 0xA11);
        assert_eq!(r.vk, 0x20);
        assert_eq!(r.modifiers & MOD_CONTROL, MOD_CONTROL);
        assert_eq!(r.modifiers & MOD_SHIFT, MOD_SHIFT);
        assert!(is_hotkey_message(WM_HOTKEY, HOTKEY_ID as usize));
        assert!(!is_hotkey_message(0x0100, HOTKEY_ID as usize));
    }
}
