//! HKCU context menu — Open in Aljwharah / Fix with Aljwharah.
//! Writes under the current user hive only. No HKLM, no elevation.

#[allow(dead_code)]
pub const OPEN_VERB: &str = "AljwharahOpen";
#[allow(dead_code)]
pub const FIX_VERB: &str = "AljwharahFix";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ShellVerb {
    pub key: &'static str,
    pub muiverb: &'static str,
    pub command_suffix: &'static str,
}

pub fn verbs() -> [ShellVerb; 2] {
    [
        ShellVerb {
            key: r"Software\Classes\Directory\shell\AljwharahOpen",
            muiverb: "Open in Aljwharah",
            command_suffix: r#"overlay-run "open \"%1\"""#,
        },
        ShellVerb {
            key: r"Software\Classes\Directory\shell\AljwharahFix",
            muiverb: "Fix with Aljwharah",
            command_suffix: r#"overlay-run "fix \"%1\"""#,
        },
    ]
}

pub fn hive() -> &'static str {
    "HKEY_CURRENT_USER"
}

pub fn command_line(exe: &str, suffix: &str) -> String {
    format!("\"{exe}\" {suffix}")
}

#[cfg(windows)]
mod win {
    use super::*;
    use std::os::windows::ffi::OsStrExt;
    use std::ptr;

    type Hkey = isize;
    const HKEY_CURRENT_USER: Hkey = 0x80000001u32 as i32 as Hkey;
    const KEY_WRITE: u32 = 0x20006;
    const REG_OPTION_NON_VOLATILE: u32 = 0;
    const REG_SZ: u32 = 1;

    #[link(name = "advapi32")]
    extern "system" {
        fn RegCreateKeyExW(
            hive: Hkey,
            sub: *const u16,
            reserved: u32,
            class: *const u16,
            options: u32,
            sam: u32,
            sec: *const u8,
            result: *mut Hkey,
            disposition: *mut u32,
        ) -> i32;
        fn RegSetValueExW(
            key: Hkey,
            name: *const u16,
            reserved: u32,
            ty: u32,
            data: *const u8,
            len: u32,
        ) -> i32;
        fn RegCloseKey(key: Hkey) -> i32;
        fn RegDeleteTreeW(key: Hkey, sub: *const u16) -> i32;
    }

    fn wide(s: &str) -> Vec<u16> {
        std::ffi::OsStr::new(s).encode_wide().chain(Some(0)).collect()
    }

    fn set_sz(key: Hkey, name: &str, value: &str) -> i32 {
        let wname = wide(name);
        let wval = wide(value);
        let bytes = unsafe { std::slice::from_raw_parts(wval.as_ptr() as *const u8, wval.len() * 2) };
        unsafe {
            RegSetValueExW(
                key,
                if name.is_empty() { ptr::null() } else { wname.as_ptr() },
                0,
                REG_SZ,
                bytes.as_ptr(),
                bytes.len() as u32,
            )
        }
    }

    pub fn register(exe: &str) -> Result<(), String> {
        for v in verbs() {
            let sub = wide(v.key);
            let mut h = 0isize;
            let rc = unsafe {
                RegCreateKeyExW(
                    HKEY_CURRENT_USER,
                    sub.as_ptr(),
                    0,
                    ptr::null(),
                    REG_OPTION_NON_VOLATILE,
                    KEY_WRITE,
                    ptr::null(),
                    &mut h,
                    ptr::null_mut(),
                )
            };
            if rc != 0 {
                return Err(format!("RegCreateKeyExW {rc}"));
            }
            set_sz(h, "MUIVerb", v.muiverb);
            set_sz(h, "Icon", exe);
            let cmd_key = format!("{}\\command", v.key);
            let cmd_w = wide(&cmd_key);
            let mut ch = 0isize;
            let rc2 = unsafe {
                RegCreateKeyExW(
                    HKEY_CURRENT_USER,
                    cmd_w.as_ptr(),
                    0,
                    ptr::null(),
                    REG_OPTION_NON_VOLATILE,
                    KEY_WRITE,
                    ptr::null(),
                    &mut ch,
                    ptr::null_mut(),
                )
            };
            if rc2 == 0 {
                let line = command_line(exe, v.command_suffix);
                set_sz(ch, "", &line);
                unsafe { RegCloseKey(ch) };
            }
            unsafe { RegCloseKey(h) };
        }
        Ok(())
    }

    pub fn unregister() -> Result<(), String> {
        for v in verbs() {
            let sub = wide(v.key);
            unsafe { RegDeleteTreeW(HKEY_CURRENT_USER, sub.as_ptr()) };
        }
        Ok(())
    }
}

pub fn register_shell(exe: &str) -> Result<String, String> {
    if exe.contains("..") {
        return Err("refused: tainted exe path".into());
    }
    #[cfg(windows)]
    {
        win::register(exe)?;
        return Ok(format!("registered {} verbs under {}", verbs().len(), hive()));
    }
    #[cfg(not(windows))]
    {
        let _ = exe;
        Ok(format!(
            "dry-run: would register {} verbs under {} (needs Windows)",
            verbs().len(),
            hive()
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn hkcu_only_and_two_verbs() {
        assert_eq!(hive(), "HKEY_CURRENT_USER");
        assert_eq!(verbs().len(), 2);
        assert!(verbs()[0].key.contains("AljwharahOpen"));
        assert!(command_line("C:\\\\ONE\\\\aljwharah-one.exe", verbs()[0].command_suffix).contains("overlay-run"));
        assert!(register_shell("..\\evil.exe").is_err());
    }
}
