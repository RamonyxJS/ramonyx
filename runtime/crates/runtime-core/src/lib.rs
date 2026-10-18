//! Ramonyx runtime core (R0): konfigurasi, structured logging, helper lifecycle.
//!
//! Tahap R0 (BLUEPRINT §3): CLI, konfigurasi, entry point, logging. Belum ada eksekusi JavaScript —
//! itu R1 (`js-engine`). Lihat `docs/adr/0019-runtime-r0.md`.

use std::fmt;
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

mod permissions;
pub use permissions::{Permission, Permissions};

pub const CONFIG_FILE_NAME: &str = "ramonyx.runtime.json";

/// Level log dengan urutan prioritas debug < info < warn < error.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Default)]
pub enum LogLevel {
    Debug,
    #[default]
    Info,
    Warn,
    Error,
}

impl LogLevel {
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "debug" => Some(Self::Debug),
            "info" => Some(Self::Info),
            "warn" => Some(Self::Warn),
            "error" => Some(Self::Error),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Debug => "debug",
            Self::Info => "info",
            Self::Warn => "warn",
            Self::Error => "error",
        }
    }
}

/// Konfigurasi runtime (R0). Field bertambah per tahap; key tak dikenal diabaikan (forward-compat).
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct RuntimeConfig {
    /// Entry point default bila CLI tidak memberi file.
    pub entry: Option<PathBuf>,
    pub log_level: LogLevel,
}

#[derive(Debug)]
pub enum ConfigError {
    Read {
        path: PathBuf,
        source: io::Error,
    },
    Parse {
        path: PathBuf,
        message: String,
    },
    InvalidField {
        field: &'static str,
        message: String,
    },
}

impl fmt::Display for ConfigError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Read { path, source } => {
                write!(
                    formatter,
                    "tidak bisa membaca config {}: {source}",
                    path.display()
                )
            }
            Self::Parse { path, message } => {
                write!(
                    formatter,
                    "config {} bukan JSON valid: {message}",
                    path.display()
                )
            }
            Self::InvalidField { field, message } => {
                write!(formatter, "field config {field} tidak valid: {message}")
            }
        }
    }
}

impl std::error::Error for ConfigError {}

/// Muat konfigurasi: dari `path` bila diberikan, jika tidak dari `ramonyx.runtime.json` di cwd
/// (opsional — tanpa file memakai default).
pub fn load_config(path: Option<&Path>) -> Result<RuntimeConfig, ConfigError> {
    let resolved: Option<PathBuf> = match path {
        Some(explicit) => {
            if !explicit.exists() {
                return Err(ConfigError::Read {
                    path: explicit.to_path_buf(),
                    source: io::Error::new(io::ErrorKind::NotFound, "file tidak ditemukan"),
                });
            }
            Some(explicit.to_path_buf())
        }
        None => {
            let default_path = PathBuf::from(CONFIG_FILE_NAME);
            default_path.exists().then_some(default_path)
        }
    };

    let Some(config_path) = resolved else {
        return Ok(RuntimeConfig::default());
    };

    let raw = fs::read_to_string(&config_path).map_err(|source| ConfigError::Read {
        path: config_path.clone(),
        source,
    })?;
    let value: serde_json::Value =
        serde_json::from_str(&raw).map_err(|error| ConfigError::Parse {
            path: config_path.clone(),
            message: error.to_string(),
        })?;

    let object = value.as_object().ok_or_else(|| ConfigError::Parse {
        path: config_path.clone(),
        message: "root harus berupa object JSON".to_string(),
    })?;

    let mut config = RuntimeConfig::default();

    if let Some(entry) = object.get("entry") {
        let entry_str = entry.as_str().ok_or_else(|| ConfigError::InvalidField {
            field: "entry",
            message: "harus string".to_string(),
        })?;
        config.entry = Some(PathBuf::from(entry_str));
    }

    if let Some(level) = object.get("logLevel") {
        let level_str = level.as_str().ok_or_else(|| ConfigError::InvalidField {
            field: "logLevel",
            message: "harus string".to_string(),
        })?;
        config.log_level = LogLevel::parse(level_str).ok_or_else(|| ConfigError::InvalidField {
            field: "logLevel",
            message: format!("nilai tidak dikenal: {level_str} (pakai debug|info|warn|error)"),
        })?;
    }

    Ok(config)
}

/// Structured logger JSON-lines: satu object JSON per baris, field stabil
/// (`ts` epoch-millis, `level`, `message`, `fields`).
pub struct Logger {
    level: LogLevel,
    sink: Box<dyn Write + Send>,
}

impl Logger {
    pub fn new(level: LogLevel, sink: Box<dyn Write + Send>) -> Self {
        Self { level, sink }
    }

    pub fn stdout(level: LogLevel) -> Self {
        Self::new(level, Box::new(io::stdout()))
    }

    pub fn stderr(level: LogLevel) -> Self {
        Self::new(level, Box::new(io::stderr()))
    }

    pub fn level(&self) -> LogLevel {
        self.level
    }

    pub fn log(&mut self, level: LogLevel, message: &str, fields: &serde_json::Value) {
        if level < self.level {
            return;
        }

        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis())
            .unwrap_or(0);

        let record = serde_json::json!({
            "ts": timestamp,
            "level": level.as_str(),
            "message": message,
            "fields": fields,
        });

        // Kegagalan menulis log tidak boleh menjatuhkan runtime; didiamkan secara sadar.
        let _ = writeln!(self.sink, "{record}");
    }

    pub fn debug(&mut self, message: &str, fields: &serde_json::Value) {
        self.log(LogLevel::Debug, message, fields);
    }

    pub fn info(&mut self, message: &str, fields: &serde_json::Value) {
        self.log(LogLevel::Info, message, fields);
    }

    pub fn warn(&mut self, message: &str, fields: &serde_json::Value) {
        self.log(LogLevel::Warn, message, fields);
    }

    pub fn error(&mut self, message: &str, fields: &serde_json::Value) {
        self.log(LogLevel::Error, message, fields);
    }
}

/// Versi crate (dipakai `ramonyx-runtime version`).
pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    #[derive(Clone, Default)]
    struct SharedBuffer(Arc<Mutex<Vec<u8>>>);

    impl Write for SharedBuffer {
        fn write(&mut self, buffer: &[u8]) -> io::Result<usize> {
            self.0.lock().expect("lock").extend_from_slice(buffer);
            Ok(buffer.len())
        }

        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    impl SharedBuffer {
        fn contents(&self) -> String {
            String::from_utf8(self.0.lock().expect("lock").clone()).expect("utf8")
        }
    }

    #[test]
    fn config_default_tanpa_file() {
        let config = load_config(None).expect("default");
        assert_eq!(config.log_level, LogLevel::Info);
        assert_eq!(config.entry, None);
    }

    #[test]
    fn config_membaca_file_dan_override() {
        let directory = std::env::temp_dir().join(format!("ramonyx-rt-{}", std::process::id()));
        fs::create_dir_all(&directory).expect("mkdir");
        let path = directory.join("ramonyx.runtime.json");
        fs::write(&path, r#"{ "entry": "src/main.ts", "logLevel": "debug" }"#).expect("write");

        let config = load_config(Some(&path)).expect("load");
        assert_eq!(config.entry, Some(PathBuf::from("src/main.ts")));
        assert_eq!(config.log_level, LogLevel::Debug);

        fs::remove_dir_all(&directory).expect("cleanup");
    }

    #[test]
    fn config_error_jelas_untuk_json_rusak_dan_level_salah() {
        let directory = std::env::temp_dir().join(format!("ramonyx-rt-bad-{}", std::process::id()));
        fs::create_dir_all(&directory).expect("mkdir");

        let broken = directory.join("broken.json");
        fs::write(&broken, "{ bukan json").expect("write");
        let error = load_config(Some(&broken)).expect_err("harus error");
        assert!(error.to_string().contains("bukan JSON valid"));

        let bad_level = directory.join("bad-level.json");
        fs::write(&bad_level, r#"{ "logLevel": "verbose" }"#).expect("write");
        let error = load_config(Some(&bad_level)).expect_err("harus error");
        assert!(error.to_string().contains("logLevel"));

        fs::remove_dir_all(&directory).expect("cleanup");
    }

    #[test]
    fn config_file_eksplisit_tidak_ada_menghasilkan_error() {
        let missing = std::env::temp_dir().join("ramonyx-rt-tidak-ada.json");
        let error = load_config(Some(&missing)).expect_err("harus error");
        assert!(error.to_string().contains("tidak bisa membaca config"));
    }

    #[test]
    fn logger_menulis_json_lines_dengan_filter_level() {
        let buffer = SharedBuffer::default();
        let mut logger = Logger::new(LogLevel::Warn, Box::new(buffer.clone()));

        logger.info("tidak tampil", &serde_json::json!({}));
        logger.warn("tampil", &serde_json::json!({ "kode": 1 }));

        let lines = buffer.contents();
        let mut parsed = lines.lines().map(|line| {
            serde_json::from_str::<serde_json::Value>(line).expect("JSON valid per baris")
        });
        let first = parsed.next().expect("satu baris");
        assert!(parsed.next().is_none(), "hanya satu baris (info terfilter)");
        assert_eq!(first["level"], "warn");
        assert_eq!(first["message"], "tampil");
        assert_eq!(first["fields"]["kode"], 1);
        assert!(first["ts"].as_u64().unwrap_or(0) > 0);
    }

    #[test]
    fn logger_meng_escape_newline_di_message() {
        let buffer = SharedBuffer::default();
        let mut logger = Logger::new(LogLevel::Info, Box::new(buffer.clone()));
        logger.info("baris\nbaru \"kutip\"", &serde_json::json!({}));

        let contents = buffer.contents();
        assert_eq!(
            contents.lines().count(),
            1,
            "newline tidak memecah baris log"
        );
        let parsed: serde_json::Value = serde_json::from_str(contents.trim()).expect("valid");
        assert_eq!(parsed["message"], "baris\nbaru \"kutip\"");
    }
}
