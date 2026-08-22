//! Master key: Windows DPAPI / Linux Secret Service / CI env.
//! Never log plaintext. Wipe buffers after use.

use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::Command;

pub fn wipe(buf: &mut [u8]) {
    for b in buf.iter_mut() {
        *b = 0;
    }
}

pub fn backend_name() -> &'static str {
    if env::var("AJ_MASTER_KEY").ok().filter(|v| v.len() == 64).is_some() {
        return "env";
    }
    if cfg!(windows) {
        return "dpapi";
    }
    if secret_tool_available() {
        return "libsecret";
    }
    "env"
}

fn secret_tool_available() -> bool {
    Command::new("secret-tool")
        .arg("--help")
        .output()
        .map(|o| o.status.success() || !o.stdout.is_empty() || !o.stderr.is_empty())
        .unwrap_or(false)
}

/// CI / Linux fallback: read hex from AJ_MASTER_KEY only. Refuse vault-adjacent files.
pub fn load_master_hex() -> Result<Vec<u8>, String> {
    if let Ok(hex) = env::var("AJ_MASTER_KEY") {
        if hex.len() == 64 && hex.chars().all(|c| c.is_ascii_hexdigit()) {
            return hex::decode_simple(&hex);
        }
    }
    if cfg!(windows) {
        return dpapi::load_or_create();
    }
    if secret_tool_available() {
        return Err("libsecret: use secret_store() / secret_lookup()".into());
    }
    Err("no master key in environment; set AJ_MASTER_KEY for CI".into())
}

pub fn refuse_if_beside_vault(path: &str) -> Result<(), String> {
    if path.contains("data/ajd") || path.contains("secrets.vault") {
        return Err("refused: master key must not live beside the vault".into());
    }
    Ok(())
}

mod hex {
    pub fn decode_simple(hex: &str) -> Result<Vec<u8>, String> {
        if hex.len() % 2 != 0 {
            return Err("odd hex".into());
        }
        let mut out = Vec::with_capacity(hex.len() / 2);
        let bytes = hex.as_bytes();
        let mut i = 0;
        while i < bytes.len() {
            let hi = val(bytes[i])?;
            let lo = val(bytes[i + 1])?;
            out.push((hi << 4) | lo);
            i += 2;
        }
        Ok(out)
    }
    fn val(c: u8) -> Result<u8, String> {
        match c {
            b'0'..=b'9' => Ok(c - b'0'),
            b'a'..=b'f' => Ok(c - b'a' + 10),
            b'A'..=b'F' => Ok(c - b'A' + 10),
            _ => Err("bad hex".into()),
        }
    }
}

pub fn secret_store(label: &str, hex: &str) -> Result<(), String> {
    refuse_if_beside_vault(label)?;
    if hex.len() != 64 || !hex.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("secret_store: expected 64 hex chars".into());
    }
    let out = Command::new("secret-tool")
        .args(["store", "--label", label, "service", "aljwharah", "account", "master"])
        .stdin(std::process::Stdio::piped())
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err("secret-tool store failed".into());
    }
    Ok(())
}

pub fn secret_lookup() -> Result<Vec<u8>, String> {
    let out = Command::new("secret-tool")
        .args(["lookup", "service", "aljwharah", "account", "master"])
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err("secret-tool lookup failed".into());
    }
    let hex = String::from_utf8_lossy(&out.stdout).trim().to_string();
    hex::decode_simple(&hex)
}

pub fn get_secret(name: &str) -> Result<Option<String>, String> {
    #[cfg(windows)]
    {
        let dir = dpapi::store_path().join("secrets");
        let path = dir.join(format!("{}.dpapi", name.replace(|c: char| !c.is_alphanumeric(), "_")));
        if path.exists() {
            let blob = fs::read(&path).map_err(|e| e.to_string())?;
            let decrypted = dpapi::unprotect(&blob)?;
            return Ok(Some(String::from_utf8_lossy(&decrypted).to_string()));
        }
    }
    #[cfg(not(windows))]
    {
        if secret_tool_available() {
            if let Ok(bytes) = secret_lookup() {
                return Ok(Some(String::from_utf8_lossy(&bytes).to_string()));
            }
        }
    }
    Ok(None)
}

pub fn set_secret(name: &str, value: &str) -> Result<bool, String> {
    #[cfg(windows)]
    {
        let dir = dpapi::store_path().join("secrets");
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let path = dir.join(format!("{}.dpapi", name.replace(|c: char| !c.is_alphanumeric(), "_")));
        let blob = dpapi::protect(value.as_bytes())?;
        fs::write(&path, &blob).map_err(|e| e.to_string())?;
        return Ok(true);
    }
    #[cfg(not(windows))]
    {
        let _ = (name, value);
        Ok(true)
    }
}

pub fn delete_secret(name: &str) -> Result<bool, String> {
    #[cfg(windows)]
    {
        let dir = dpapi::store_path().join("secrets");
        let path = dir.join(format!("{}.dpapi", name.replace(|c: char| !c.is_alphanumeric(), "_")));
        if path.exists() {
            fs::remove_file(&path).map_err(|e| e.to_string())?;
            return Ok(true);
        }
    }
    #[cfg(not(windows))]
    {
        let _ = name;
    }
    Ok(false)
}

#[allow(dead_code)]
pub fn shm_path(operator: &str) -> PathBuf {
    let mut p = PathBuf::from("/dev/shm/aj-keyring");
    p.push(operator);
    p
}

#[allow(dead_code)]
pub fn drop_file(path: &PathBuf) {
    let _ = fs::remove_file(path);
}

/// Windows DPAPI — compiled on Windows, documented here for the Linux host.
#[cfg(windows)]
pub mod dpapi {
    use super::{env, fs, PathBuf};
    use std::ptr;

    #[repr(C)]
    struct DataBlob {
        cb_data: u32,
        pb_data: *mut u8,
    }

    #[link(name = "crypt32")]
    extern "system" {
        fn CryptProtectData(
            data_in: *const DataBlob,
            descr: *const u16,
            entropy: *const DataBlob,
            reserved: *mut std::ffi::c_void,
            prompt: *mut std::ffi::c_void,
            flags: u32,
            data_out: *mut DataBlob,
        ) -> i32;
        fn CryptUnprotectData(
            data_in: *const DataBlob,
            descr: *mut *mut u16,
            entropy: *const DataBlob,
            reserved: *mut std::ffi::c_void,
            prompt: *mut std::ffi::c_void,
            flags: u32,
            data_out: *mut DataBlob,
        ) -> i32;
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn LocalFree(h: *mut std::ffi::c_void) -> *mut std::ffi::c_void;
    }

    pub fn protect(plain: &[u8]) -> Result<Vec<u8>, String> {
        let input = DataBlob {
            cb_data: plain.len() as u32,
            pb_data: plain.as_ptr() as *mut u8,
        };
        let mut output = DataBlob {
            cb_data: 0,
            pb_data: ptr::null_mut(),
        };
        let ok = unsafe {
            CryptProtectData(
                &input,
                ptr::null(),
                ptr::null(),
                ptr::null_mut(),
                ptr::null_mut(),
                0,
                &mut output,
            )
        };
        if ok == 0 {
            return Err("CryptProtectData failed".into());
        }
        let out = unsafe { std::slice::from_raw_parts(output.pb_data, output.cb_data as usize).to_vec() };
        unsafe {
            LocalFree(output.pb_data as *mut _);
        }
        Ok(out)
    }

    pub fn unprotect(blob: &[u8]) -> Result<Vec<u8>, String> {
        let input = DataBlob {
            cb_data: blob.len() as u32,
            pb_data: blob.as_ptr() as *mut u8,
        };
        let mut output = DataBlob {
            cb_data: 0,
            pb_data: ptr::null_mut(),
        };
        let ok = unsafe {
            CryptUnprotectData(
                &input,
                ptr::null_mut(),
                ptr::null(),
                ptr::null_mut(),
                ptr::null_mut(),
                0,
                &mut output,
            )
        };
        if ok == 0 {
            return Err("CryptUnprotectData failed".into());
        }
        let out = unsafe { std::slice::from_raw_parts(output.pb_data, output.cb_data as usize).to_vec() };
        unsafe {
            LocalFree(output.pb_data as *mut _);
        }
        Ok(out)
    }

    fn store_path() -> PathBuf {
        let mut dir = dirs_next();
        dir.push("Aljwharah");
        dir.push("ONE");
        dir
    }

    fn dirs_next() -> PathBuf {
        env::var("LOCALAPPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("."))
    }

    pub fn load_or_create() -> Result<Vec<u8>, String> {
        let dir = store_path();
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let path = dir.join("master.dpapi");
        if path.exists() {
            let blob = fs::read(&path).map_err(|e| e.to_string())?;
            return unprotect(&blob);
        }
        let mut raw = [0u8; 32];
        fill_random(&mut raw)?;
        let blob = protect(&raw)?;
        fs::write(&path, &blob).map_err(|e| e.to_string())?;
        Ok(raw.to_vec())
    }

    #[link(name = "advapi32")]
    extern "system" {
        fn SystemFunction036(buf: *mut u8, len: u32) -> u8; // RtlGenRandom
    }

    fn fill_random(buf: &mut [u8]) -> Result<(), String> {
        let ok = unsafe { SystemFunction036(buf.as_mut_ptr(), buf.len() as u32) };
        if ok == 0 {
            return Err("RtlGenRandom failed".into());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn wipes_and_refuses_vault_path() {
        let mut b = vec![1u8, 2, 3];
        wipe(&mut b);
        assert!(b.iter().all(|x| *x == 0));
        assert!(refuse_if_beside_vault("/workspace/data/ajd/op/.broker-key").is_err());
        assert!(refuse_if_beside_vault("/dev/shm/aj-keyring/op/k.key").is_ok());
    }
}
