//! Talks to the Node ajd CLI. The desktop host never writes the ledger itself.

use crate::overlay::OverlayIntent;
use std::path::PathBuf;
use std::process::Command;

pub fn workspace_root() -> PathBuf {
    if let Ok(p) = std::env::var("AJ_WORKSPACE") {
        return PathBuf::from(p);
    }
    let exe = std::env::current_exe().unwrap_or_else(|_| PathBuf::from("."));
    let mut dir = exe.parent().unwrap_or(std::path::Path::new(".")).to_path_buf();
    for _ in 0..8 {
        if dir.join("apps").join("cli").join("aj.ts").exists() {
            return dir;
        }
        if !dir.pop() {
            break;
        }
    }
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn aj_args(extra: &[&str]) -> Vec<String> {
    let root = workspace_root();
    let script = root.join("apps").join("cli").join("aj.ts");
    let mut args = vec![
        "--experimental-strip-types".into(),
        script.to_string_lossy().into_owned(),
    ];
    args.extend(extra.iter().map(|s| (*s).to_string()));
    args
}

pub fn run_aj(extra: &[&str]) -> Result<String, String> {
    let root = workspace_root();
    let out = Command::new("node")
        .args(aj_args(extra))
        .current_dir(&root)
        .output()
        .map_err(|e| format!("ajd spawn failed: {e}"))?;
    let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
    if !out.status.success() {
        return Err(if stderr.is_empty() { stdout } else { stderr });
    }
    Ok(if stdout.is_empty() { stderr } else { stdout })
}

pub fn dispatch_overlay(intent: &OverlayIntent) {
    match intent {
        OverlayIntent::Toggle => {}
        OverlayIntent::Stop => {
            let _ = run_aj(&["overlay", "stop"]);
        }
        OverlayIntent::Start { objective } => {
            let _ = run_aj(&["overlay", "start", objective]);
        }
    }
}

pub fn mission_verb(verb: &str, id: &str) -> Result<String, String> {
    run_aj(&[verb, id])
}
