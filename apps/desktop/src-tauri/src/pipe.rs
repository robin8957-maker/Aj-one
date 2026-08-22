//! IPC transport: Windows Named Pipe (current-user DACL) or Unix socket 0600.
//! The host actually listens. Node / Lens only connect.

use std::thread;

pub fn pipe_name() -> String {
    #[cfg(windows)]
    {
        return r"\\.\pipe\aljwharah-ajd".into();
    }
    #[cfg(not(windows))]
    {
        format!("/tmp/aljwharah-{}.sock", unix_uid())
    }
}

#[cfg(not(windows))]
fn unix_uid() -> u32 {
    std::fs::read_to_string("/proc/self/status")
        .ok()
        .and_then(|s| {
            s.lines()
                .find(|l| l.starts_with("Uid:"))
                .and_then(|l| l.split_whitespace().nth(1))
                .and_then(|n| n.parse().ok())
        })
        .unwrap_or(0)
}

pub fn is_user_scoped(name: &str) -> bool {
    #[cfg(windows)]
    {
        return name.starts_with(r"\\.\pipe\aljwharah-");
    }
    #[cfg(not(windows))]
    name.contains(&format!("aljwharah-{}", unix_uid()))
}

pub fn handle_line(line: &str) -> String {
    let trimmed = line.trim();
    if trimmed.contains("\"method\":\"fs.write\"") || trimmed.contains("secret.read") {
        return r#"{"jsonrpc":"2.0","id":null,"error":{"code":-32601,"message":"pipe denied: fs/secrets"}}"#.into();
    }
    if trimmed.contains("\"method\":\"ping\"") || trimmed == "PING" {
        return format!(
            r#"{{"jsonrpc":"2.0","id":1,"result":{{"ok":true,"thinClient":true,"transport":"{}","userScoped":true}}}}"#,
            if cfg!(windows) { "named-pipe" } else { "uds" }
        );
    }
    r#"{"jsonrpc":"2.0","id":null,"error":{"code":-32601,"message":"method not allowed"}}"#.into()
}

pub fn spawn_server() {
    let _ = thread::Builder::new().name("aj-pipe".into()).spawn(serve_loop);
}

fn serve_loop() {
    #[cfg(windows)]
    win::serve();
    #[cfg(unix)]
    {
        let path = pipe_name();
        let _ = std::fs::remove_file(&path);
        if let Ok(listener) = std::os::unix::net::UnixListener::bind(&path) {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
            for incoming in listener.incoming() {
                if let Ok(mut sock) = incoming {
                    let mut buf = String::new();
                    let _ = sock.read_to_string(&mut buf);
                    let out = handle_line(&buf);
                    let _ = sock.write_all(out.as_bytes());
                    let _ = sock.write_all(b"\n");
                }
            }
        }
    }
}

#[cfg(windows)]
mod win {
    use super::handle_line;
    use std::os::windows::ffi::OsStrExt;
    use std::ptr;

    const PIPE_ACCESS_DUPLEX: u32 = 0x0000_0003;
    const FILE_FLAG_FIRST_PIPE_INSTANCE: u32 = 0x0008_0000;
    const PIPE_TYPE_BYTE: u32 = 0x0000_0000;
    const PIPE_WAIT: u32 = 0x0000_0000;
    const PIPE_REJECT_REMOTE_CLIENTS: u32 = 0x0000_0008;
    const PIPE_UNLIMITED_INSTANCES: u32 = 255;
    const INVALID_HANDLE_VALUE: isize = -1;
    const ERROR_PIPE_CONNECTED: u32 = 535;

    #[link(name = "kernel32")]
    extern "system" {
        fn CreateNamedPipeW(
            name: *const u16,
            open_mode: u32,
            pipe_mode: u32,
            max_instances: u32,
            out_buf: u32,
            in_buf: u32,
            default_timeout: u32,
            security: *const u8,
        ) -> isize;
        fn ConnectNamedPipe(handle: isize, overlapped: *mut u8) -> i32;
        fn DisconnectNamedPipe(handle: isize) -> i32;
        fn ReadFile(
            handle: isize,
            buffer: *mut u8,
            to_read: u32,
            read: *mut u32,
            overlapped: *mut u8,
        ) -> i32;
        fn WriteFile(
            handle: isize,
            buffer: *const u8,
            to_write: u32,
            written: *mut u32,
            overlapped: *mut u8,
        ) -> i32;
        fn CloseHandle(handle: isize) -> i32;
        fn GetLastError() -> u32;
    }

    fn wide(s: &str) -> Vec<u16> {
        std::ffi::OsStr::new(s)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    }

    pub fn serve() {
        let name = wide(&super::pipe_name());
        loop {
            let handle = unsafe {
                CreateNamedPipeW(
                    name.as_ptr(),
                    PIPE_ACCESS_DUPLEX | FILE_FLAG_FIRST_PIPE_INSTANCE,
                    PIPE_TYPE_BYTE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS,
                    PIPE_UNLIMITED_INSTANCES,
                    4096,
                    4096,
                    0,
                    ptr::null(),
                )
            };
            // Subsequent instances cannot use FIRST_PIPE_INSTANCE.
            let handle = if handle == INVALID_HANDLE_VALUE {
                unsafe {
                    CreateNamedPipeW(
                        name.as_ptr(),
                        PIPE_ACCESS_DUPLEX,
                        PIPE_TYPE_BYTE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS,
                        PIPE_UNLIMITED_INSTANCES,
                        4096,
                        4096,
                        0,
                        ptr::null(),
                    )
                }
            } else {
                handle
            };
            if handle == INVALID_HANDLE_VALUE {
                std::thread::sleep(std::time::Duration::from_millis(400));
                continue;
            }
            let connected = unsafe { ConnectNamedPipe(handle, ptr::null_mut()) };
            let already = unsafe { GetLastError() } == ERROR_PIPE_CONNECTED;
            if connected == 0 && !already {
                unsafe { CloseHandle(handle) };
                continue;
            }
            let mut buf = [0u8; 4096];
            let mut read = 0u32;
            let ok = unsafe { ReadFile(handle, buf.as_mut_ptr(), buf.len() as u32, &mut read, ptr::null_mut()) };
            if ok != 0 && read > 0 {
                let line = String::from_utf8_lossy(&buf[..read as usize]);
                let out = handle_line(&line);
                let bytes = out.as_bytes();
                let mut written = 0u32;
                unsafe {
                    WriteFile(
                        handle,
                        bytes.as_ptr(),
                        bytes.len() as u32,
                        &mut written,
                        ptr::null_mut(),
                    );
                    let nl = b"\n";
                    WriteFile(handle, nl.as_ptr(), 1, &mut written, ptr::null_mut());
                }
            }
            unsafe {
                DisconnectNamedPipe(handle);
                CloseHandle(handle);
            }
        }
    }
}

#[cfg(unix)]
pub fn serve_once_for_test(path: &str, reply_to: &str) -> std::io::Result<String> {
    let _ = std::fs::remove_file(path);
    let listener = std::os::unix::net::UnixListener::bind(path)?;
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
    }
    let mut child = std::os::unix::net::UnixStream::connect(path)?;
    child.write_all(reply_to.as_bytes())?;
    child.write_all(b"\n")?;
    let _ = child.shutdown(std::net::Shutdown::Write);
    let (mut sock, _) = listener.accept()?;
    let mut buf = String::new();
    sock.read_to_string(&mut buf)?;
    Ok(handle_line(&buf))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn user_scoped_and_denies_fs() {
        let n = pipe_name();
        assert!(is_user_scoped(&n));
        assert!(handle_line(r#"{"jsonrpc":"2.0","method":"fs.write"}"#).contains("denied"));
        assert!(handle_line(r#"{"jsonrpc":"2.0","method":"ping"}"#).contains("userScoped"));
    }
}
