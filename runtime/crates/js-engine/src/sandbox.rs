//! Sandbox OS proses via **Landlock LSM** (ADR-0051).
//!
//! Membatasi processos **sendiri** (dan anak-anaknya, karena Landlock diwariskan dan hanya
//! bisa dipersempit) di level kernel: akses filesystem dan — bila ABI ≥ 4 — TCP bind/connect.
//! Tidak butuh privilege (cukup `no_new_privs`); Linux saja. Dipakai `--sandbox*` di CLI dan
//! diteruskan ke plugin proses oleh `ramonyx.spawn(..., { sandbox })`.
//!
//! Semantik kelas akses (deny-by-default per kelas yang diaktifkan):
//! - `handle_read` aktif → hanya path di `allow_read` yang boleh dibaca; tanpa path = baca ditolak.
//! - `handle_write` aktif → hanya path di `allow_write` yang boleh ditulis.
//! - `deny_net` → TCP bind/connect ditolak (butuh ABI ≥ 4; DNS/UDP di luar cakupan Landlock).
//! - Kelas yang tidak diaktifkan tidak dibatasi oleh kernel (tetap dijaga lapisan permission JS).

use std::path::PathBuf;

/// Spesifikasi sandbox hasil gabungan CLI/opsi spawn.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct SandboxSpec {
    /// Path yang boleh dibaca (dir/berkas) — mengaktifkan kelas baca.
    pub allow_read: Vec<PathBuf>,
    /// Path yang boleh ditulis — mengaktifkan kelas tulis.
    pub allow_write: Vec<PathBuf>,
    /// Kelas baca ditangani (deny-by-default); `allow_read` kosong = tolak semua baca.
    pub handle_read: bool,
    /// Kelas tulis ditangani; `allow_write` kosong = tolak semua tulis.
    pub handle_write: bool,
    /// Tolak TCP bind/connect (Landlock ABI ≥ 4).
    pub deny_net: bool,
}

impl SandboxSpec {
    /// `true` bila tidak ada kelas yang perlu ditegakkan (no-op — aman untuk kernel lama).
    pub fn is_noop(&self) -> bool {
        !self.handle_read && !self.handle_write && !self.deny_net
    }
}

/// Versi ABI Landlock kernel ini (`None` = tidak didukung).
pub fn abi() -> Option<i32> {
    #[cfg(target_os = "linux")]
    {
        // SAFETY: probe tanpa atribut; hanya membaca versi ABI dari kernel.
        let result = unsafe {
            libc::syscall(
                libc::SYS_landlock_create_ruleset,
                std::ptr::null::<u8>(),
                0usize,
                LANDLOCK_CREATE_RULESET_VERSION,
            )
        };
        if result < 0 {
            None
        } else {
            Some(result as i32)
        }
    }
    #[cfg(not(target_os = "linux"))]
    {
        None
    }
}

/// Terapkan sandbox ke proses ini. Gagal keras (tanpa fallback diam-diam) bila diminta
/// tetapi kernel tidak mendukung — filosofi deny-by-default.
pub fn apply(spec: &SandboxSpec) -> Result<(), String> {
    let handle_read = spec.handle_read || !spec.allow_read.is_empty();
    let handle_write = spec.handle_write || !spec.allow_write.is_empty();
    if !handle_read && !handle_write && !spec.deny_net {
        return Ok(());
    }

    #[cfg(target_os = "linux")]
    {
        linux_apply(spec, handle_read, handle_write)
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = (handle_read, handle_write);
        Err("sandbox OS hanya didukung di Linux (Landlock)".to_string())
    }
}

// ---------------------------------------------------------------------------
// Implementasi Linux (Landlock UAPI)
// ---------------------------------------------------------------------------

#[cfg(target_os = "linux")]
const LANDLOCK_CREATE_RULESET_VERSION: u32 = 1;
#[cfg(target_os = "linux")]
const LANDLOCK_RULE_PATH_BENEATH: u32 = 1;

// Bit akses FS (linux/landlock.h). Bit di luar ABI kernel akan ditolak EINVAL → disaring
// lewat `fs_access_for_abi`.
#[cfg(target_os = "linux")]
const FS_EXECUTE: u64 = 1 << 0;
#[cfg(target_os = "linux")]
const FS_WRITE_FILE: u64 = 1 << 1;
#[cfg(target_os = "linux")]
const FS_READ_FILE: u64 = 1 << 2;
#[cfg(target_os = "linux")]
const FS_READ_DIR: u64 = 1 << 3;
#[cfg(target_os = "linux")]
const FS_REMOVE_DIR: u64 = 1 << 4;
#[cfg(target_os = "linux")]
const FS_REMOVE_FILE: u64 = 1 << 5;
#[cfg(target_os = "linux")]
const FS_MAKE_CHAR: u64 = 1 << 6;
#[cfg(target_os = "linux")]
const FS_MAKE_DIR: u64 = 1 << 7;
#[cfg(target_os = "linux")]
const FS_MAKE_REG: u64 = 1 << 8;
#[cfg(target_os = "linux")]
const FS_MAKE_SOCK: u64 = 1 << 9;
#[cfg(target_os = "linux")]
const FS_MAKE_FIFO: u64 = 1 << 10;
#[cfg(target_os = "linux")]
const FS_MAKE_BLOCK: u64 = 1 << 11;
#[cfg(target_os = "linux")]
const FS_MAKE_SYM: u64 = 1 << 12;
#[cfg(target_os = "linux")]
const FS_REFER: u64 = 1 << 13; // ABI ≥ 2
#[cfg(target_os = "linux")]
const FS_TRUNCATE: u64 = 1 << 14; // ABI ≥ 3
#[cfg(target_os = "linux")]
const FS_IOCTL_DEV: u64 = 1 << 15; // ABI ≥ 5

#[cfg(target_os = "linux")]
const NET_BIND_TCP: u64 = 1 << 0;
#[cfg(target_os = "linux")]
const NET_CONNECT_TCP: u64 = 1 << 1;

/// Bit FS yang dikenali ABI tertentu (menghindari EINVAL pada kernel lama).
#[cfg(target_os = "linux")]
pub(crate) fn fs_access_for_abi(abi: i32) -> u64 {
    let mut mask = FS_EXECUTE
        | FS_WRITE_FILE
        | FS_READ_FILE
        | FS_READ_DIR
        | FS_REMOVE_DIR
        | FS_REMOVE_FILE
        | FS_MAKE_CHAR
        | FS_MAKE_DIR
        | FS_MAKE_REG
        | FS_MAKE_SOCK
        | FS_MAKE_FIFO
        | FS_MAKE_BLOCK
        | FS_MAKE_SYM;
    if abi >= 2 {
        mask |= FS_REFER;
    }
    if abi >= 3 {
        mask |= FS_TRUNCATE;
    }
    if abi >= 5 {
        mask |= FS_IOCTL_DEV;
    }
    mask
}

/// Bit net yang dikenali ABI tertentu (0 bila ABI < 4).
#[cfg(target_os = "linux")]
pub(crate) fn net_access_for_abi(abi: i32) -> u64 {
    if abi >= 4 {
        NET_BIND_TCP | NET_CONNECT_TCP
    } else {
        0
    }
}

/// Bit akses untuk rule baca.
#[cfg(target_os = "linux")]
const READ_ACCESS: u64 = FS_READ_FILE | FS_READ_DIR;

/// Bit akses untuk rule tulis (tanpa EXECUTE; `REFER`/`TRUNCATE` disaring ABI).
#[cfg(target_os = "linux")]
fn write_access_for_abi(abi: i32) -> u64 {
    let mut mask = FS_WRITE_FILE
        | FS_REMOVE_DIR
        | FS_REMOVE_FILE
        | FS_MAKE_CHAR
        | FS_MAKE_DIR
        | FS_MAKE_REG
        | FS_MAKE_SOCK
        | FS_MAKE_FIFO
        | FS_MAKE_BLOCK
        | FS_MAKE_SYM;
    if abi >= 2 {
        mask |= FS_REFER;
    }
    if abi >= 3 {
        mask |= FS_TRUNCATE;
    }
    mask
}

#[cfg(target_os = "linux")]
fn linux_apply(spec: &SandboxSpec, handle_read: bool, handle_write: bool) -> Result<(), String> {
    let Some(version) = abi() else {
        return Err(
            "sandbox: Landlock tidak didukung kernel ini (butuh Linux ≥ 5.13 dengan Landlock aktif)"
                .to_string(),
        );
    };

    let handled_net = net_access_for_abi(version);
    if spec.deny_net && handled_net == 0 {
        return Err(format!(
            "sandbox: pembatasan net butuh Landlock ABI ≥ 4 (kernel ini ABI {version})"
        ));
    }

    let full_fs = fs_access_for_abi(version);
    let mut handled_fs = 0u64;
    if handle_read {
        handled_fs |= READ_ACCESS;
    }
    if handle_write {
        handled_fs |= write_access_for_abi(version);
    }
    debug_assert!(handled_fs & !full_fs == 0, "bit FS di luar ABI");

    // SAFETY: `prctl` dengan argumen skalar; tidak ada memori bersama.
    if unsafe { libc::prctl(libc::PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) } != 0 {
        return Err(format!(
            "sandbox: prctl(NO_NEW_PRIVS) gagal: {}",
            std::io::Error::last_os_error()
        ));
    }

    let ruleset_fd = create_ruleset(handled_fs, if spec.deny_net { handled_net } else { 0 })?;

    let write_access = write_access_for_abi(version);
    let mut result = Ok(());
    for path in &spec.allow_read {
        if handle_read {
            result = add_path_rule(ruleset_fd, path, READ_ACCESS);
            if result.is_err() {
                break;
            }
        }
    }
    if result.is_ok() && handle_write {
        for path in &spec.allow_write {
            result = add_path_rule(ruleset_fd, path, write_access);
            if result.is_err() {
                break;
            }
        }
    }

    if let Err(error) = result {
        // SAFETY: fd milik kami; belum ada pembatasan yang aktif.
        unsafe { libc::close(ruleset_fd) };
        return Err(error);
    }

    // SAFETY: fd ruleset valid; setelah sukses proses (dan turunannya) dibatasi kernel.
    if unsafe { libc::syscall(libc::SYS_landlock_restrict_self, ruleset_fd, 0u32) } != 0 {
        let error = std::io::Error::last_os_error();
        // SAFETY: fd milik kami.
        unsafe { libc::close(ruleset_fd) };
        return Err(format!("sandbox: landlock_restrict_self gagal: {error}"));
    }
    // SAFETY: fd tidak diperlukan lagi setelah pembatasan aktif.
    unsafe { libc::close(ruleset_fd) };
    Ok(())
}

#[cfg(target_os = "linux")]
fn create_ruleset(handled_fs: u64, handled_net: u64) -> Result<i32, String> {
    // Kernel ABI ≤ 3 hanya mengenal field pertama (8 byte); ABI ≥ 4 menambah field net.
    // Coba 16 byte dulu, fallback ke 8 bila kernel menolak dengan E2BIG.
    let mut attr16 = [0u8; 16];
    attr16[0..8].copy_from_slice(&handled_fs.to_ne_bytes());
    attr16[8..16].copy_from_slice(&handled_net.to_ne_bytes());
    // SAFETY: buffer 16 byte sesuai `struct landlock_create_ruleset_attr` (ABI ≥ 4).
    let fd = unsafe {
        libc::syscall(
            libc::SYS_landlock_create_ruleset,
            attr16.as_ptr(),
            attr16.len(),
            0u32,
        )
    };
    if fd >= 0 {
        return Ok(fd as i32);
    }
    let error = std::io::Error::last_os_error();
    if error.raw_os_error() == Some(libc::E2BIG) {
        let mut attr8 = [0u8; 8];
        attr8.copy_from_slice(&handled_fs.to_ne_bytes());
        // SAFETY: buffer 8 byte (ABI ≤ 3).
        let fd = unsafe {
            libc::syscall(
                libc::SYS_landlock_create_ruleset,
                attr8.as_ptr(),
                attr8.len(),
                0u32,
            )
        };
        if fd >= 0 {
            return Ok(fd as i32);
        }
        return Err(format!(
            "sandbox: landlock_create_ruleset gagal: {}",
            std::io::Error::last_os_error()
        ));
    }
    Err(format!("sandbox: landlock_create_ruleset gagal: {error}"))
}

#[cfg(target_os = "linux")]
fn add_path_rule(ruleset_fd: i32, path: &std::path::Path, access: u64) -> Result<(), String> {
    let c_path = std::ffi::CString::new(path.as_os_str().as_encoded_bytes())
        .map_err(|_| format!("sandbox: path memuat NUL: {}", path.display()))?;
    // SAFETY: `c_path` valid (NUL-terminated); O_PATH tidak membuka isi berkas.
    let path_fd = unsafe { libc::open(c_path.as_ptr(), libc::O_PATH | libc::O_CLOEXEC) };
    if path_fd < 0 {
        return Err(format!(
            "sandbox: tidak bisa membuka path '{}': {}",
            path.display(),
            std::io::Error::last_os_error()
        ));
    }

    // `struct landlock_path_beneath_attr { u64 allowed_access; i32 parent_fd }` = 12 byte
    // (packed). Disusun sebagai byte-buffer agar tidak bergantung padding repr(Rust).
    let mut attr = [0u8; 12];
    attr[0..8].copy_from_slice(&access.to_ne_bytes());
    attr[8..12].copy_from_slice(&path_fd.to_ne_bytes());
    // SAFETY: buffer 12 byte sesuai struct kernel; `ruleset_fd` valid.
    let result = unsafe {
        libc::syscall(
            libc::SYS_landlock_add_rule,
            ruleset_fd,
            LANDLOCK_RULE_PATH_BENEATH,
            attr.as_ptr(),
            0u32,
        )
    };
    // SAFETY: fd milik kami.
    unsafe { libc::close(path_fd) };

    if result != 0 {
        return Err(format!(
            "sandbox: landlock_add_rule '{}' gagal: {}",
            path.display(),
            std::io::Error::last_os_error()
        ));
    }
    Ok(())
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::*;

    #[test]
    fn bit_fs_disaring_sesuai_abi() {
        let abi1 = fs_access_for_abi(1);
        assert_eq!(abi1 & FS_REFER, 0, "ABI 1 tanpa REFER");
        assert_eq!(abi1 & FS_TRUNCATE, 0, "ABI 1 tanpa TRUNCATE");
        assert_eq!(abi1 & FS_IOCTL_DEV, 0, "ABI 1 tanpa IOCTL_DEV");

        let abi3 = fs_access_for_abi(3);
        assert_ne!(abi3 & FS_REFER, 0);
        assert_ne!(abi3 & FS_TRUNCATE, 0);
        assert_eq!(abi3 & FS_IOCTL_DEV, 0);

        let abi5 = fs_access_for_abi(5);
        assert_ne!(abi5 & FS_IOCTL_DEV, 0);
        assert_eq!(
            abi5,
            fs_access_for_abi(7),
            "ABI lebih baru tak menambah bit dikenal"
        );
    }

    #[test]
    fn bit_net_hanya_abi_4_ke_atas() {
        assert_eq!(net_access_for_abi(3), 0);
        assert_eq!(net_access_for_abi(4), NET_BIND_TCP | NET_CONNECT_TCP);
    }

    #[test]
    fn spec_kosong_adalah_noop_dan_tidak_menerapkan_apa_pun() {
        let spec = SandboxSpec::default();
        assert!(spec.is_noop());
        // No-op tidak menyentuh kernel sama sekali — aman dipanggil di proses test.
        assert_eq!(apply(&spec), Ok(()));
    }
}
