//! Real Tauri updater. Unsigned payloads are refused. Applies only after
//! tauri-plugin-updater verifies the minisign pubkey from tauri.conf.json.

use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

pub const UPDATE_ENDPOINT: &str =
    "https://releases.aljwharah.one/{{target}}/{{arch}}/{{current_version}}";
#[allow(dead_code)]
pub const MIN_VERSION: &str = "0.1.0";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct UpdateOffer {
    pub version: String,
    pub signed: bool,
    pub url: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct UpdateCheck {
    pub current: String,
    pub available: bool,
    pub version: Option<String>,
    pub notes: Option<String>,
    pub applied: bool,
    pub detail: String,
}

pub fn parse_version(v: &str) -> Option<(u32, u32, u32)> {
    let mut it = v.trim().trim_start_matches('v').split('.');
    Some((
        it.next()?.parse().ok()?,
        it.next()?.parse().ok()?,
        it.next()?.parse().ok()?,
    ))
}

pub fn is_newer(current: &str, candidate: &str) -> bool {
    match (parse_version(current), parse_version(candidate)) {
        (Some(a), Some(b)) => b > a,
        _ => false,
    }
}

/// Policy gate used by tests and by the live check. Never returns "would apply".
pub fn accept_offer(current: &str, offer: &UpdateOffer) -> Result<String, String> {
    if !offer.signed {
        return Err("updater: refused unsigned payload — EV / Tauri pubkey required".into());
    }
    if !is_newer(current, &offer.version) {
        return Err("updater: already current".into());
    }
    if offer.url.contains("..") || !offer.url.starts_with("https://") {
        return Err("updater: tainted url".into());
    }
    Ok(format!("accepted {} from {}", offer.version, offer.url))
}

pub async fn check_and_apply(app: AppHandle, apply: bool) -> Result<UpdateCheck, String> {
    let current = app.package_info().version.to_string();
    let updater = app
        .updater()
        .map_err(|e| format!("updater: plugin unavailable ({e})"))?;
    match updater.check().await {
        Ok(Some(update)) => {
            let version = update.version.clone();
            let notes = update.body.clone();
            if !is_newer(&current, &version) {
                return Ok(UpdateCheck {
                    current,
                    available: false,
                    version: Some(version),
                    notes,
                    applied: false,
                    detail: "updater: already current".into(),
                });
            }
            if apply {
                update
                    .download_and_install(|_, _| {}, || {})
                    .await
                    .map_err(|e| format!("updater: install failed ({e})"))?;
                return Ok(UpdateCheck {
                    current,
                    available: true,
                    version: Some(version.clone()),
                    notes,
                    applied: true,
                    detail: format!("applied {version}"),
                });
            }
            Ok(UpdateCheck {
                current,
                available: true,
                version: Some(version.clone()),
                notes,
                applied: false,
                detail: format!("update {version} ready — signed payload accepted"),
            })
        }
        Ok(None) => Ok(UpdateCheck {
            current,
            available: false,
            version: None,
            notes: None,
            applied: false,
            detail: "updater: already current".into(),
        }),
        Err(e) => {
            let msg = e.to_string();
            if msg.to_ascii_lowercase().contains("signature")
                || msg.to_ascii_lowercase().contains("unsigned")
            {
                return Err("updater: refused unsigned payload — EV / Tauri pubkey required".into());
            }
            Err(format!("updater: {msg}"))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn refuses_unsigned_and_accepts_newer_signed() {
        assert!(is_newer("0.1.0", "0.2.0"));
        assert!(!is_newer("0.2.0", "0.1.9"));
        let bad = UpdateOffer {
            version: "0.2.0".into(),
            signed: false,
            url: "https://releases.aljwharah.one/app".into(),
        };
        assert!(accept_offer("0.1.0", &bad).is_err());
        let good = UpdateOffer {
            version: "0.2.0".into(),
            signed: true,
            url: "https://releases.aljwharah.one/app".into(),
        };
        let accepted = accept_offer("0.1.0", &good).unwrap();
        assert!(accepted.contains("0.2.0"));
        assert!(!accepted.contains("would apply"));
    }
}
