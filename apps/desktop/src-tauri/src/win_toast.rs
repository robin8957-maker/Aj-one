//! Windows toast notifications. Builds the XML **and** delivers it via
//! tauri-plugin-notification (WinRT toast on Windows).

use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

pub fn toast_xml(title: &str, body: &str, approval_id: &str) -> Result<String, String> {
    if approval_id.is_empty()
        || !approval_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return Err("toast: inert approval id required".into());
    }
    if body.contains("sk-") || body.contains("Bearer ") || body.contains("BEGIN ") {
        return Err("toast: refused secret material".into());
    }
    let t = escape(title);
    let b = escape(body);
    let mut xml = String::new();
    xml.push_str(r#"<toast launch="ajd:watchdog?id="#);
    xml.push_str(approval_id);
    xml.push_str(r#"" activationType="foreground"><visual><binding template="ToastGeneric"><text>"#);
    xml.push_str(&t);
    xml.push_str("</text><text>");
    xml.push_str(&b);
    xml.push_str(r#"</text></binding></visual><actions>"#);
    xml.push_str(r#"<action content="Approve Merge" arguments="ajd:approve?id="#);
    xml.push_str(approval_id);
    xml.push_str(r#"" activationType="foreground"/>"#);
    xml.push_str(r#"<action content="Reject" arguments="ajd:reject?id="#);
    xml.push_str(approval_id);
    xml.push_str(r#"" activationType="foreground"/></actions></toast>"#);
    Ok(xml)
}

fn escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            _ => out.push(c),
        }
    }
    out
}

pub fn parse_activation(args: &str) -> Result<(&'static str, &str), String> {
    if let Some(id) = args.strip_prefix("ajd:approve?id=") {
        return Ok(("mission.approve", id));
    }
    if let Some(id) = args.strip_prefix("ajd:reject?id=") {
        return Ok(("mission.reject", id));
    }
    Err("toast: unknown activation".into())
}

/// Show a real OS toast. On Windows this is a WinRT toast via the plugin.
pub fn show(app: &AppHandle, title: &str, body: &str, approval_id: &str) -> Result<String, String> {
    let xml = toast_xml(title, body, approval_id)?;
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|e| format!("toast: deliver failed ({e})"))?;
    Ok(xml)
}

/// CLI / host path — deliver a WinRT toast without a Tauri AppHandle.
pub fn show_standalone(title: &str, body: &str, approval_id: &str) -> Result<(), String> {
    let _ = toast_xml(title, body, approval_id)?;
    #[cfg(windows)]
    {
        tauri_winrt_notification::Toast::new("ALJWHARAH.ONE")
            .title(title)
            .text1(body)
            .add_button("Approve Merge", &format!("ajd:approve?id={approval_id}"))
            .add_button("Reject", &format!("ajd:reject?id={approval_id}"))
            .show()
            .map_err(|e| format!("toast: WinRT deliver failed ({e})"))?;
        return Ok(());
    }
    #[cfg(not(windows))]
    {
        let _ = (title, body);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn xml_has_both_buttons_and_strips_secrets() {
        let xml = toast_xml("pearl", "error in src/app.ts", "apr_1").unwrap();
        assert!(xml.contains("Approve Merge"));
        assert!(xml.contains("Reject"));
        assert!(xml.contains("apr_1"));
        assert!(toast_xml("t", "Bearer sk-live", "apr_1").is_err());
        let (cmd, id) = parse_activation("ajd:approve?id=apr_1").unwrap();
        assert_eq!(cmd, "mission.approve");
        assert_eq!(id, "apr_1");
    }
}
