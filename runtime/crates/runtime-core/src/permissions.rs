//! Permission model (R3): secure-by-default — tanpa flag `--allow-*`, semua akses ditolak.
//!
//! Flag (nilai opsional `=a,b,c`; tanpa nilai = izinkan semua):
//! `--allow-read[=path,...]`, `--allow-write[=path,...]`, `--allow-net[=host,...]`,
//! `--allow-env[=NAME,...]`.

use std::path::{Path, PathBuf};

/// Satu jenis permission: tolak semua / izinkan semua / daftar eksplisit.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub enum Permission {
    #[default]
    Deny,
    AllowAll,
    Allow(Vec<String>),
}

impl Permission {
    /// Dari nilai flag: `None`/`""` (flag tanpa nilai) = AllowAll; selebihnya daftar koma.
    pub fn from_flag(value: Option<&str>) -> Self {
        match value {
            None | Some("") => Self::AllowAll,
            Some(list) => Self::Allow(list.split(',').map(str::to_string).collect()),
        }
    }

    pub fn as_label(&self) -> String {
        match self {
            Self::Deny => "deny".to_string(),
            Self::AllowAll => "allow-all".to_string(),
            Self::Allow(list) => format!("allow[{}]", list.join(",")),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Permissions {
    pub read: Permission,
    pub write: Permission,
    pub net: Permission,
    pub env: Permission,
}

impl Permissions {
    /// Semua diizinkan (dipakai test; di produksi hanya via flag eksplisit).
    pub fn allow_all() -> Self {
        Self {
            read: Permission::AllowAll,
            write: Permission::AllowAll,
            net: Permission::AllowAll,
            env: Permission::AllowAll,
        }
    }

    pub fn check_read(&self, path: &Path) -> Result<(), String> {
        check_path(&self.read, path, "read", "--allow-read")
    }

    pub fn check_write(&self, path: &Path) -> Result<(), String> {
        check_path(&self.write, path, "write", "--allow-write")
    }

    pub fn check_env(&self, name: &str) -> Result<(), String> {
        match &self.env {
            Permission::Deny => Err(format!(
                "permission denied: akses env \"{name}\" (jalankan dengan --allow-env={name})"
            )),
            Permission::AllowAll => Ok(()),
            Permission::Allow(list) if list.iter().any(|allowed| allowed == name) => Ok(()),
            Permission::Allow(_) => Err(format!(
                "permission denied: akses env \"{name}\" (jalankan dengan --allow-env={name})"
            )),
        }
    }

    pub fn check_net(&self, host: &str) -> Result<(), String> {
        match &self.net {
            Permission::Deny => Err(format!(
                "permission denied: akses jaringan ke \"{host}\" (jalankan dengan --allow-net={host})"
            )),
            Permission::AllowAll => Ok(()),
            Permission::Allow(list) if list.iter().any(|allowed| allowed == host) => Ok(()),
            Permission::Allow(_) => Err(format!(
                "permission denied: akses jaringan ke \"{host}\" (jalankan dengan --allow-net={host})"
            )),
        }
    }
}

/// Normalisasi path untuk perbandingan prefix: canonicalize; bila target belum ada, canonicalize
/// parent + nama file (agar penulisan file baru tetap bisa dicek).
fn normalize_path(path: &Path) -> PathBuf {
    if let Ok(canonical) = std::fs::canonicalize(path) {
        return canonical;
    }
    match (path.parent(), path.file_name()) {
        (Some(parent), Some(name)) if !parent.as_os_str().is_empty() => {
            std::fs::canonicalize(parent)
                .map(|canonical_parent| canonical_parent.join(name))
                .unwrap_or_else(|_| path.to_path_buf())
        }
        _ => path.to_path_buf(),
    }
}

fn check_path(
    permission: &Permission,
    path: &Path,
    action: &str,
    flag: &str,
) -> Result<(), String> {
    match permission {
        Permission::Deny => Err(format!(
            "permission denied: {action} \"{}\" (jalankan dengan {flag}=<path>)",
            path.display()
        )),
        Permission::AllowAll => Ok(()),
        Permission::Allow(list) => {
            let requested = normalize_path(path);
            for granted in list {
                let granted_path = normalize_path(Path::new(granted));
                if requested.starts_with(&granted_path) {
                    return Ok(());
                }
            }
            Err(format!(
                "permission denied: {action} \"{}\" (di luar {flag} yang diberikan)",
                path.display()
            ))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_menolak_semua() {
        let permissions = Permissions::default();
        assert!(permissions.check_read(Path::new("/etc/passwd")).is_err());
        assert!(permissions.check_env("HOME").is_err());
        assert!(permissions.check_net("127.0.0.1").is_err());
        assert!(permissions.check_write(Path::new("/tmp/x")).is_err());
    }

    #[test]
    fn from_flag_bentuk_yang_benar() {
        assert_eq!(Permission::from_flag(None), Permission::AllowAll);
        assert_eq!(Permission::from_flag(Some("")), Permission::AllowAll);
        assert_eq!(
            Permission::from_flag(Some("/tmp,/var")),
            Permission::Allow(vec!["/tmp".to_string(), "/var".to_string()])
        );
    }

    #[test]
    fn path_prefix_dihormati() {
        let directory = std::env::temp_dir().join(format!("ramonyx-perm-{}", std::process::id()));
        std::fs::create_dir_all(&directory).expect("mkdir");
        let allowed = directory.join("boleh");
        std::fs::create_dir_all(&allowed).expect("mkdir");

        let permissions = Permissions {
            read: Permission::Allow(vec![allowed.display().to_string()]),
            ..Default::default()
        };

        let inside = allowed.join("file.txt");
        std::fs::write(&inside, "isi").expect("write");
        assert!(permissions.check_read(&inside).is_ok(), "di dalam izin");
        assert!(
            permissions.check_read(&directory.join("lain.txt")).is_err(),
            "di luar izin ditolak"
        );
        assert!(
            permissions
                .check_read(&allowed.join("..").join("lain.txt"))
                .is_err(),
            "traversal ditolak (canonicalisasi)"
        );

        std::fs::remove_dir_all(&directory).expect("cleanup");
    }

    #[test]
    fn env_dan_net_daftar_eksplisit() {
        let permissions = Permissions {
            env: Permission::Allow(vec!["HOME".to_string()]),
            net: Permission::Allow(vec!["127.0.0.1".to_string()]),
            ..Default::default()
        };
        assert!(permissions.check_env("HOME").is_ok());
        assert!(permissions.check_env("PATH").is_err());
        assert!(permissions.check_net("127.0.0.1").is_ok());
        assert!(permissions.check_net("example.com").is_err());
    }

    #[test]
    fn pesan_error_memuat_flag_petunjuk() {
        let error = Permissions::default()
            .check_read(Path::new("/x"))
            .expect_err("error");
        assert!(error.contains("--allow-read"));
        assert!(
            Permissions::default()
                .check_env("A")
                .expect_err("")
                .contains("--allow-env")
        );
    }
}
