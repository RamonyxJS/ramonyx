//! CLI runtime Ramonyx (R0 + R1-lite). Lihat `docs/adr/0019-runtime-r0.md`.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

use js_engine::Engine;
use runtime_core::{LogLevel, Logger, load_config, version};

const USAGE: &str = "\
ramonyx-runtime — runtime Ramonyx (R0: CLI/konfigurasi/logging; R1-lite: eksekusi JS via V8)

USAGE:
    ramonyx-runtime version
    ramonyx-runtime config [--config <path>]
    ramonyx-runtime run <entry> [--config <path>] [--log-level <debug|info|warn|error>]
    ramonyx-runtime help

ENTRY:
    .js/.cjs/.mjs dieksekusi lewat V8 (script mode; ESM import menyusul).
    .ts/.tsx menunggu transform TypeScript (sisa R1) — hanya divalidasi dan dicatat.
";

#[derive(Debug, PartialEq, Eq)]
enum Command {
    Version,
    Help,
    Config {
        config: Option<PathBuf>,
    },
    Run {
        entry: Option<PathBuf>,
        config: Option<PathBuf>,
        log_level: Option<LogLevel>,
    },
}

fn parse_args(args: &[String]) -> Result<Command, String> {
    let mut iterator = args.iter();
    let Some(subcommand) = iterator.next() else {
        return Err("subcommand wajib (version|config|run|help)".to_string());
    };

    let mut config: Option<PathBuf> = None;
    let mut log_level: Option<LogLevel> = None;
    let mut positional: Option<String> = None;
    let mut rest = iterator.peekable();

    while let Some(argument) = rest.next() {
        match argument.as_str() {
            "--config" => {
                let value = rest.next().ok_or("--config butuh nilai <path>")?;
                config = Some(PathBuf::from(value));
            }
            "--log-level" => {
                let value = rest.next().ok_or("--log-level butuh nilai")?;
                log_level =
                    Some(LogLevel::parse(value).ok_or("--log-level harus debug|info|warn|error")?);
            }
            flag if flag.starts_with("--") => {
                return Err(format!("flag tidak dikenal: {flag}"));
            }
            value => {
                if positional.is_some() {
                    return Err(format!("argumen tak terduga: {value}"));
                }
                positional = Some(value.to_string());
            }
        }
    }

    match subcommand.as_str() {
        "version" => Ok(Command::Version),
        "help" | "--help" | "-h" => Ok(Command::Help),
        "config" => Ok(Command::Config { config }),
        "run" => Ok(Command::Run {
            entry: positional.map(PathBuf::from),
            config,
            log_level,
        }),
        other => Err(format!("subcommand tidak dikenal: {other}")),
    }
}

fn run_command(command: Command) -> ExitCode {
    match command {
        Command::Version => {
            println!("ramonyx-runtime {} (runtime-core {})", version(), version());
            ExitCode::SUCCESS
        }
        Command::Help => {
            println!("{USAGE}");
            ExitCode::SUCCESS
        }
        Command::Config { config } => match load_config(config.as_deref()) {
            Ok(resolved) => {
                let payload = serde_json::json!({
                    "entry": resolved.entry.map(|path| path.display().to_string()),
                    "logLevel": resolved.log_level.as_str(),
                });
                println!("{payload}");
                ExitCode::SUCCESS
            }
            Err(error) => {
                eprintln!("error: {error}");
                ExitCode::FAILURE
            }
        },
        Command::Run {
            entry,
            config,
            log_level,
        } => {
            let resolved = match load_config(config.as_deref()) {
                Ok(resolved) => resolved,
                Err(error) => {
                    eprintln!("error: {error}");
                    return ExitCode::FAILURE;
                }
            };

            let level = log_level.unwrap_or(resolved.log_level);
            let mut logger = Logger::stdout(level);

            let entry_path = entry.or(resolved.entry);
            let Some(entry_path) = entry_path else {
                eprintln!(
                    "error: entry point wajib (`ramonyx-runtime run <entry>` atau field `entry` di config)"
                );
                return ExitCode::FAILURE;
            };

            if !entry_path.exists() {
                logger.error(
                    "runtime.entry_missing",
                    &serde_json::json!({ "entry": entry_path.display().to_string() }),
                );
                eprintln!(
                    "error: entry point tidak ditemukan: {}",
                    entry_path.display()
                );
                return ExitCode::FAILURE;
            }

            let source_size = std::fs::metadata(&entry_path)
                .map(|metadata| metadata.len())
                .unwrap_or(0);

            logger.info(
                "runtime.start",
                &serde_json::json!({
                    "version": version(),
                    "entry": entry_path.display().to_string(),
                    "bytes": source_size,
                }),
            );

            let extension = entry_path
                .extension()
                .and_then(|value| value.to_str())
                .unwrap_or("");

            let success = match extension {
                "js" | "cjs" => execute_script(&entry_path, &mut logger),
                "mjs" => {
                    logger.warn(
                        "esm.module_loader_pending",
                        &serde_json::json!({
                            "stage": "R1",
                            "note": "mjs dijalankan sebagai script; module loader ESM menyusul",
                        }),
                    );
                    execute_script(&entry_path, &mut logger)
                }
                "ts" | "tsx" | "mts" | "cts" => {
                    logger.warn(
                        "transform.not_implemented",
                        &serde_json::json!({
                            "stage": "R1",
                            "note": "transform TypeScript sebelum eksekusi menyusul",
                        }),
                    );
                    true
                }
                other => {
                    logger.error(
                        "entry.unsupported",
                        &serde_json::json!({ "extension": other }),
                    );
                    eprintln!("error: entry tidak didukung: .{other} (pakai .js/.cjs/.mjs)");
                    false
                }
            };

            logger.log(
                if success {
                    LogLevel::Info
                } else {
                    LogLevel::Error
                },
                "runtime.stop",
                &serde_json::json!({ "code": if success { 0 } else { 1 } }),
            );

            if success {
                ExitCode::SUCCESS
            } else {
                ExitCode::FAILURE
            }
        }
    }
}

/// Eksekusi file JS lewat V8 (`js-engine`). Mengembalikan sukses/gagal untuk exit code & log.
fn execute_script(entry_path: &Path, logger: &mut Logger) -> bool {
    let source = match fs::read_to_string(entry_path) {
        Ok(source) => source,
        Err(error) => {
            logger.error(
                "engine.read_error",
                &serde_json::json!({
                    "entry": entry_path.display().to_string(),
                    "error": error.to_string(),
                }),
            );
            eprintln!("error: tidak bisa membaca entry: {error}");
            return false;
        }
    };

    let mut engine = match Engine::new() {
        Ok(engine) => engine,
        Err(error) => {
            logger.error(
                "engine.init_error",
                &serde_json::json!({ "error": error.to_string() }),
            );
            eprintln!("error: inisialisasi V8 gagal: {error}");
            return false;
        }
    };

    match engine.execute(&entry_path.display().to_string(), &source) {
        Ok(()) => {
            logger.info(
                "engine.executed",
                &serde_json::json!({
                    "entry": entry_path.display().to_string(),
                    "bytes": source.len(),
                }),
            );
            true
        }
        Err(error) => {
            logger.error(
                "engine.error",
                &serde_json::json!({
                    "entry": entry_path.display().to_string(),
                    "error": error.to_string(),
                }),
            );
            eprintln!("error: {error}");
            false
        }
    }
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match parse_args(&args) {
        Ok(command) => run_command(command),
        Err(message) => {
            eprintln!("error: {message}\n\n{USAGE}");
            ExitCode::from(2)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| value.to_string()).collect()
    }

    #[test]
    fn parse_version_dan_help() {
        assert_eq!(parse_args(&args(&["version"])), Ok(Command::Version));
        assert_eq!(parse_args(&args(&["help"])), Ok(Command::Help));
        assert_eq!(parse_args(&args(&["--help"])), Ok(Command::Help));
    }

    #[test]
    fn parse_run_dengan_flag() {
        let parsed = parse_args(&args(&[
            "run",
            "src/main.ts",
            "--config",
            "rt.json",
            "--log-level",
            "debug",
        ]));
        assert_eq!(
            parsed,
            Ok(Command::Run {
                entry: Some(PathBuf::from("src/main.ts")),
                config: Some(PathBuf::from("rt.json")),
                log_level: Some(LogLevel::Debug),
            })
        );
    }

    #[test]
    fn parse_error_untuk_flag_dan_level_tidak_valid() {
        assert!(parse_args(&args(&["run", "--apa"])).is_err());
        assert!(parse_args(&args(&["run", "x", "--log-level", "verbose"])).is_err());
        assert!(parse_args(&args(&["tidak-ada"])).is_err());
        assert!(parse_args(&args(&[])).is_err());
    }

    #[test]
    fn parse_config_dengan_path() {
        assert_eq!(
            parse_args(&args(&["config", "--config", "a.json"])),
            Ok(Command::Config {
                config: Some(PathBuf::from("a.json")),
            })
        );
    }
}
