//! Real Windows system tray — icon next to the clock, not a printed label.

use crate::native;
use crate::overlay;
use tauri::menu::{MenuBuilder, MenuEvent, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::AppHandle;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TrayItem {
    pub id: &'static str,
    pub label: String,
}

pub fn tray_menu(active_missions: usize, daemon_up: bool) -> Vec<TrayItem> {
    vec![
        TrayItem {
            id: "status",
            label: if daemon_up {
                format!("ajd · {active_missions} active")
            } else {
                "ajd · offline".into()
            },
        },
        TrayItem {
            id: "missions",
            label: "Open Commander".into(),
        },
        TrayItem {
            id: "panic",
            label: "Panic stop".into(),
        },
        TrayItem {
            id: "quit",
            label: "Quit ALJWHARAH ONE".into(),
        },
    ]
}

pub fn install(app: &AppHandle) -> tauri::Result<()> {
    let items = tray_menu(0, true);
    let mut builder = MenuBuilder::new(app);
    for item in &items {
        let enabled = item.id != "status";
        builder = builder.item(&MenuItemBuilder::with_id(item.id, &item.label).enabled(enabled).build(app)?);
    }
    let menu = builder.build()?;

    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or_else(|| tauri::Error::AssetNotFound("default window icon".into()))?;

    let handle = app.clone();
    TrayIconBuilder::with_id("aj-tray")
        .icon(icon)
        .tooltip("ALJWHARAH ONE")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| on_menu(app, event))
        .on_tray_icon_event(move |_tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let _ = overlay::show_main(&handle);
            }
        })
        .build(app)?;
    Ok(())
}

fn on_menu(app: &AppHandle, event: MenuEvent) {
    match event.id().as_ref() {
        "missions" => {
            let _ = overlay::show_main(app);
        }
        "panic" => {
            let _ = native::panic_stop(app);
        }
        "quit" => {
            app.exit(0);
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::tray_menu;
    #[test]
    fn menu_has_panic() {
        let m = tray_menu(2, true);
        assert!(m.iter().any(|i| i.id == "panic"));
        assert!(m[0].label.contains("2"));
        assert!(m.iter().any(|i| i.id == "quit"));
    }
}
