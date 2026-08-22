//! Renderer IPC is tainted (agent output). The webview may only approve or
//! reject a mission, plus user-gesture window chrome. Never fs / secrets.

/// Commands the webview is allowed to send from agent UI.
pub const RENDERER_ALLOWED: &[&str] = &["mission.approve", "mission.reject"];

/// User-gesture window chrome only — never from agent-generated markup handlers.
pub const CHROME_ALLOWED: &[&str] = &[
    "window.minimize",
    "window.maximize",
    "window.close",
    "overlay.toggle",
    "tray.panic",
];

/// Host process argv only — never exposed on the renderer invoke surface.
pub const HOST_ALLOWED: &[&str] = &[
    "status",
    "ping",
    "toggle-window",
    "tray-status",
    "overlay-show",
    "overlay-run",
    "overlay-stop",
    "watchdog-ack",
    "listen",
    "register-shell",
    "service-install",
    "toast",
    "mica",
    "pipe",
    "updater-check",
    "service",
];

const FORBIDDEN: &[&str] = &[
    "fs.write",
    "fs.read",
    "fs.remove",
    "fs.rename",
    "shell.exec",
    "keychain-get",
    "keychain-put",
    "secret.read",
    "secret.write",
];

fn tainted_payload(payload: &str) -> bool {
    payload.contains("..")
        || payload.contains('\0')
        || payload.contains("BEGIN ")
        || payload.contains("sk-")
        || payload.contains("Bearer ")
}

pub fn authorize_renderer_ipc(cmd: &str, payload: &str) -> Result<(), String> {
    if FORBIDDEN.iter().any(|f| *f == cmd) || cmd.starts_with("fs.") || cmd.starts_with("secret") {
        return Err("ipc denied: renderer cannot touch host fs or secrets".into());
    }
    if !RENDERER_ALLOWED.contains(&cmd) {
        return Err("ipc denied: renderer may only mission.approve / mission.reject".into());
    }
    if payload.len() > 256 {
        return Err("ipc denied: payload too large".into());
    }
    if tainted_payload(payload) {
        return Err("ipc denied: tainted payload".into());
    }
    if !payload
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return Err("ipc denied: approval id must be inert".into());
    }
    if payload.is_empty() {
        return Err("ipc denied: approval id required".into());
    }
    Ok(())
}

pub fn authorize_chrome_ipc(cmd: &str, payload: &str) -> Result<(), String> {
    if FORBIDDEN.contains(&cmd) || cmd.starts_with("fs.") {
        return Err("ipc denied: chrome cannot touch host fs".into());
    }
    if !CHROME_ALLOWED.contains(&cmd) {
        return Err("ipc denied: unknown chrome command".into());
    }
    if payload.contains("..") || payload.contains('\0') || payload.len() > 64 {
        return Err("ipc denied: tainted chrome payload".into());
    }
    Ok(())
}

pub fn authorize_host_cli(cmd: &str, payload: &str) -> Result<(), String> {
    if FORBIDDEN.contains(&cmd) {
        return Err("ipc denied: host cli cannot expose keys or raw fs".into());
    }
    if !HOST_ALLOWED.contains(&cmd) {
        return Err("ipc denied: unknown host command".into());
    }
    if payload.contains("..") || payload.contains('\0') || payload.len() > 8_192 {
        return Err("ipc denied: tainted host payload".into());
    }
    Ok(())
}

/// Back-compat name used by the native binary. Renderer cmds go first.
pub fn authorize_ipc(cmd: &str, payload: &str) -> Result<(), String> {
    if RENDERER_ALLOWED.contains(&cmd) {
        return authorize_renderer_ipc(cmd, payload);
    }
    if CHROME_ALLOWED.contains(&cmd) {
        return authorize_chrome_ipc(cmd, payload);
    }
    authorize_host_cli(cmd, payload)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn renderer_only_approve_reject() {
        assert!(authorize_renderer_ipc("mission.approve", "apr_ok1").is_ok());
        assert!(authorize_renderer_ipc("mission.reject", "apr_ok1").is_ok());
        assert!(authorize_renderer_ipc("fs.write", "/tmp/x").is_err());
        assert!(authorize_renderer_ipc("keychain-get", "master").is_err());
        assert!(authorize_renderer_ipc("mission.approve", "../etc/passwd").is_err());
        assert!(authorize_renderer_ipc("mission.approve", "BEGIN RSA").is_err());
        assert!(authorize_renderer_ipc("status", "").is_err());
        assert!(authorize_renderer_ipc("window.minimize", "").is_err());
        assert!(authorize_chrome_ipc("window.minimize", "").is_ok());
        assert!(authorize_chrome_ipc("fs.write", "").is_err());
        assert!(authorize_host_cli("keychain-get", "").is_err());
        assert!(authorize_host_cli("overlay-show", "").is_ok());
    }
}
