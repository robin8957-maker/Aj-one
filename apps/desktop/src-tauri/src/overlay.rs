//! Frameless Command Palette overlay. Commands go to ajd, never raw shell.

use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OverlayIntent {
    Toggle,
    Start { objective: String },
    Stop,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OverlayWindowSpec {
    pub label: &'static str,
    pub url_path: &'static str,
    pub width: u32,
    pub height: u32,
    pub decorations: bool,
    pub always_on_top: bool,
    pub skip_taskbar: bool,
    pub transparent: bool,
    pub center: bool,
}

pub fn overlay_window() -> OverlayWindowSpec {
    OverlayWindowSpec {
        label: "overlay",
        url_path: "/overlay",
        width: 560,
        height: 220,
        decorations: false,
        always_on_top: true,
        skip_taskbar: true,
        transparent: false,
        center: true,
    }
}

pub fn parse_overlay_intent(raw: &str) -> Result<OverlayIntent, String> {
    let t = raw.trim();
    if t.is_empty() || t.eq_ignore_ascii_case("toggle") {
        return Ok(OverlayIntent::Toggle);
    }
    let lower = t.to_ascii_lowercase();
    if matches!(lower.as_str(), "stop" | "cancel" | "panic" | "halt") {
        return Ok(OverlayIntent::Stop);
    }
    if t.contains('\0') || t.contains("..") {
        return Err("overlay denied: tainted input".into());
    }
    if t.len() > 2_000 {
        return Err("overlay denied: objective too long".into());
    }
    let objective = t
        .strip_prefix("start ")
        .or_else(|| t.strip_prefix("run "))
        .or_else(|| t.strip_prefix("new "))
        .unwrap_or(t)
        .trim();
    if objective.is_empty() {
        return Err("overlay denied: empty objective".into());
    }
    Ok(OverlayIntent::Start {
        objective: objective.to_string(),
    })
}

pub fn show_overlay(app: &AppHandle) -> Result<(), String> {
    let w = app
        .get_webview_window("overlay")
        .ok_or_else(|| "overlay window missing".to_string())?;
    w.show().map_err(|e| e.to_string())?;
    w.set_focus().map_err(|e| e.to_string())?;
    let _ = app.emit("aj://overlay", "show");
    Ok(())
}

pub fn hide_overlay(app: &AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("overlay") {
        w.hide().map_err(|e| e.to_string())?;
    }
    let _ = app.emit("aj://overlay", "hide");
    Ok(())
}

pub fn toggle_overlay(app: &AppHandle) -> Result<bool, String> {
    let w = app
        .get_webview_window("overlay")
        .ok_or_else(|| "overlay window missing".to_string())?;
    let visible = w.is_visible().unwrap_or(false);
    if visible {
        hide_overlay(app)?;
        Ok(false)
    } else {
        show_overlay(app)?;
        Ok(true)
    }
}

pub fn show_main(app: &AppHandle) -> Result<(), String> {
    let w = app
        .get_webview_window("main")
        .ok_or_else(|| "main window missing".to_string())?;
    let _ = w.unminimize();
    w.show().map_err(|e| e.to_string())?;
    w.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn frameless_and_intents() {
        let w = overlay_window();
        assert!(!w.decorations);
        assert!(w.always_on_top);
        assert_eq!(parse_overlay_intent("stop").unwrap(), OverlayIntent::Stop);
        match parse_overlay_intent("start Add GET /health").unwrap() {
            OverlayIntent::Start { objective } => assert!(objective.contains("health")),
            _ => panic!("expected start"),
        }
        assert!(parse_overlay_intent("../etc/passwd").is_err());
    }
}
