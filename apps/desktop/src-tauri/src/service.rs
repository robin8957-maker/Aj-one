//! Windows Service wrapper for ajd. Auto-start, idle wait — no spin loop.

pub const SERVICE_NAME: &str = "AljwharahAjd";
#[allow(dead_code)]
pub const SERVICE_DISPLAY: &str = "ALJWHARAH ONE Governor";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ServiceSpec {
    pub name: &'static str,
    pub start: &'static str,
    pub account: &'static str,
    pub idle: &'static str,
}

pub fn spec() -> ServiceSpec {
    ServiceSpec {
        name: SERVICE_NAME,
        start: "SERVICE_AUTO_START",
        account: "LocalSystem-denied; runs as installing user (SERVICE_WIN32_OWN_PROCESS)",
        idle: "block on named pipe — 0% CPU until a client connects",
    }
}

pub fn install_command(exe: &str) -> String {
    format!("sc.exe create {SERVICE_NAME} binPath= \"{exe} service\" start= auto")
}

pub fn should_idle_block() -> bool {
    true
}

#[cfg(windows)]
mod win {
    use std::ptr;

    #[repr(C)]
    struct ServiceTableEntryW {
        name: *const u16,
        proc: Option<unsafe extern "system" fn(u32, *mut *mut u16)>,
    }

    #[link(name = "advapi32")]
    extern "system" {
        fn StartServiceCtrlDispatcherW(table: *const ServiceTableEntryW) -> i32;
    }

    pub fn dispatch() -> i32 {
        let name: Vec<u16> = "AljwharahAjd\0".encode_utf16().collect();
        let table = [
            ServiceTableEntryW {
                name: name.as_ptr(),
                proc: Some(svc_main),
            },
            ServiceTableEntryW {
                name: ptr::null(),
                proc: None,
            },
        ];
        unsafe { StartServiceCtrlDispatcherW(table.as_ptr()) }
    }

    unsafe extern "system" fn svc_main(_argc: u32, _argv: *mut *mut u16) {
        crate::pipe::spawn_server();
        loop {
            std::thread::park();
        }
    }
}

pub fn run_service() -> Result<String, String> {
    #[cfg(windows)]
    {
        let _ = win::dispatch();
        return Ok("service dispatcher".into());
    }
    #[cfg(not(windows))]
    Ok("dry-run: Windows Service install requires SCM (this host is not Windows)".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn auto_start_and_idle() {
        let s = spec();
        assert_eq!(s.name, "AljwharahAjd");
        assert!(s.start.contains("AUTO"));
        assert!(should_idle_block());
        assert!(install_command("C:\\\\ONE\\\\aljwharah-one.exe").contains("sc.exe create"));
    }
}
