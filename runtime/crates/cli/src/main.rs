//! CLI runtime Ramonyx (R0 + R1-lite). Lihat `docs/adr/0019-runtime-r0.md`.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

use js_engine::{Engine, EngineOptions};
use runtime_core::{LogLevel, Logger, Permission, Permissions, load_config, version};

const USAGE: &str = "\
ramonyx-runtime — runtime Ramonyx (R0: CLI/konfigurasi/logging; R1: eksekusi JS/TS via V8)

USAGE:
    ramonyx-runtime version
    ramonyx-runtime config [--config <path>]
    ramonyx-runtime run <entry> [--config <path>] [--log-level <debug|info|warn|error>]
    ramonyx-runtime help

ENTRY:
    .js/.mjs/.ts/.tsx/.mts dieksekusi sebagai modul ESM (import relatif + fallback ekstensi;
    TypeScript ditranspile via deno_ast).
    .cjs/.cts dieksekusi sebagai script (tanpa import).
    Bare specifier: resolusi node_modules ESM v1; paket CommonJS via interop CJS (ADR-0026/0029).

PERMISSIONS (default: semua ditolak):
    --allow-read[=path,...]   --allow-write[=path,...]
    --allow-net[=host,...]    --allow-env[=NAME,...]
    Tanpa nilai (mis. --allow-read) berarti mengizinkan semua.

RESOURCE LIMITS (opsional):
    --max-heap-mb <MiB>   Batas heap V8; pelanggaran → error jelas (bukan abort).
    --timeout-ms <ms>     Batas waktu wall-clock per eksekusi (watchdog V8).
    --tls-ca <path.pem>   CA tambahan untuk fetch https (verifikasi tetap aktif).
    --op-metrics          Log metrik op (jumlah + waktu) setelah eksekusi (profiling).
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
        permissions: Permissions,
        max_heap_mb: Option<usize>,
        timeout_ms: Option<u64>,
        tls_ca: Option<PathBuf>,
        op_metrics: bool,
    },
}

fn parse_args(args: &[String]) -> Result<Command, String> {
    let mut iterator = args.iter();
    let Some(subcommand) = iterator.next() else {
        return Err("subcommand wajib (version|config|run|help)".to_string());
    };

    let mut config: Option<PathBuf> = None;
    let mut log_level: Option<LogLevel> = None;
    let mut permissions = Permissions::default();
    let mut max_heap_mb: Option<usize> = None;
    let mut timeout_ms: Option<u64> = None;
    let mut tls_ca: Option<PathBuf> = None;
    let mut op_metrics = false;
    let mut positional: Option<String> = None;
    let mut rest = iterator.peekable();

    while let Some(argument) = rest.next() {
        let flag = argument.as_str();
        let allow_value = |prefix: &str| -> Option<&str> { flag.strip_prefix(prefix) };

        match flag {
            "--config" => {
                let value = rest.next().ok_or("--config butuh nilai <path>")?;
                config = Some(PathBuf::from(value));
            }
            "--log-level" => {
                let value = rest.next().ok_or("--log-level butuh nilai")?;
                log_level =
                    Some(LogLevel::parse(value).ok_or("--log-level harus debug|info|warn|error")?);
            }
            "--max-heap-mb" => {
                let value = rest.next().ok_or("--max-heap-mb butuh nilai <MiB>")?;
                let parsed = value
                    .parse::<usize>()
                    .ok()
                    .filter(|mb| *mb > 0)
                    .ok_or("--max-heap-mb harus bilangan > 0")?;
                max_heap_mb = Some(parsed);
            }
            "--op-metrics" => op_metrics = true,
            "--tls-ca" => {
                let value = rest.next().ok_or("--tls-ca butuh nilai <path.pem>")?;
                tls_ca = Some(PathBuf::from(value));
            }
            "--timeout-ms" => {
                let value = rest.next().ok_or("--timeout-ms butuh nilai <ms>")?;
                let parsed = value
                    .parse::<u64>()
                    .ok()
                    .filter(|ms| *ms > 0)
                    .ok_or("--timeout-ms harus bilangan > 0")?;
                timeout_ms = Some(parsed);
            }
            "--allow-read" => permissions.read = Permission::AllowAll,
            "--allow-write" => permissions.write = Permission::AllowAll,
            "--allow-net" => permissions.net = Permission::AllowAll,
            "--allow-env" => permissions.env = Permission::AllowAll,
            _ if allow_value("--allow-read=").is_some() => {
                permissions.read = Permission::from_flag(allow_value("--allow-read="));
            }
            _ if allow_value("--allow-write=").is_some() => {
                permissions.write = Permission::from_flag(allow_value("--allow-write="));
            }
            _ if allow_value("--allow-net=").is_some() => {
                permissions.net = Permission::from_flag(allow_value("--allow-net="));
            }
            _ if allow_value("--allow-env=").is_some() => {
                permissions.env = Permission::from_flag(allow_value("--allow-env="));
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
            permissions,
            max_heap_mb,
            timeout_ms,
            tls_ca,
            op_metrics,
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
            permissions,
            max_heap_mb,
            timeout_ms,
            tls_ca,
            op_metrics,
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

            logger.info(
                "runtime.permissions",
                &serde_json::json!({
                    "read": permissions.read.as_label(),
                    "write": permissions.write.as_label(),
                    "net": permissions.net.as_label(),
                    "env": permissions.env.as_label(),
                }),
            );

            if op_metrics {
                logger.info(
                    "runtime.profiling",
                    &serde_json::json!({ "opMetrics": true }),
                );
            }

            if max_heap_mb.is_some() || timeout_ms.is_some() || tls_ca.is_some() {
                logger.info(
                    "runtime.limits",
                    &serde_json::json!({
                        "maxHeapMb": max_heap_mb,
                        "timeoutMs": timeout_ms,
                        "tlsCa": tls_ca.as_ref().map(|path| path.display().to_string()),
                    }),
                );
            }

            let engine_options = EngineOptions {
                permissions: permissions.clone(),
                max_heap_mb,
                timeout: timeout_ms.map(std::time::Duration::from_millis),
                tls_ca_file: tls_ca.clone(),
                op_metrics,
            };

            let extension = entry_path
                .extension()
                .and_then(|value| value.to_str())
                .unwrap_or("");

            let success = match extension {
                "js" | "mjs" | "ts" | "tsx" | "mts" => {
                    execute_module(&entry_path, &mut logger, &engine_options)
                }
                "cjs" | "cts" => execute_script(&entry_path, &mut logger, &engine_options),
                other => {
                    logger.error(
                        "entry.unsupported",
                        &serde_json::json!({ "extension": other }),
                    );
                    eprintln!(
                        "error: entry tidak didukung: .{other} (pakai .js/.mjs/.ts/.tsx/.mts/.cjs)"
                    );
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

/// Milidetik sebagai `f64` untuk log (presisi pecahan).
fn ms(duration: std::time::Duration) -> f64 {
    (duration.as_secs_f64() * 1000.0 * 100.0).round() / 100.0
}

/// Log `engine.executed` + `runtime.metrics` (bila `--op-metrics`) untuk satu eksekusi sukses.
fn log_engine_success(
    logger: &mut Logger,
    entry_path: &Path,
    mode: &str,
    startup_ms: f64,
    engine: &Engine,
    with_metrics: bool,
) {
    let timings = engine.last_timings().map(|timings| {
        serde_json::json!({
            "loadMs": ms(timings.load),
            "evalMs": ms(timings.evaluate),
            "totalMs": ms(timings.total),
        })
    });
    logger.info(
        "engine.executed",
        &serde_json::json!({
            "entry": entry_path.display().to_string(),
            "mode": mode,
            "startupMs": startup_ms,
            "timings": timings,
        }),
    );

    if with_metrics {
        let entries = engine.op_metrics();
        let top: Vec<serde_json::Value> = entries
            .iter()
            .take(15)
            .map(|entry| {
                serde_json::json!({
                    "op": entry.op,
                    "calls": entry.dispatched,
                    "errors": entry.errors,
                    "totalMs": ms(entry.total),
                })
            })
            .collect();
        logger.info(
            "runtime.metrics",
            &serde_json::json!({ "totalOps": entries.len(), "ops": top }),
        );
    }
}

/// Eksekusi file sebagai modul ESM (JS/TS) lewat `js-engine`. Mengembalikan sukses/gagal.
fn execute_module(entry_path: &Path, logger: &mut Logger, options: &EngineOptions) -> bool {
    let init_started = std::time::Instant::now();
    let mut engine = match Engine::with_options(options.clone()) {
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

    let startup_ms = ms(init_started.elapsed());

    match engine.execute_module(entry_path) {
        Ok(()) => {
            log_engine_success(
                logger,
                entry_path,
                "module",
                startup_ms,
                &engine,
                options.op_metrics,
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

/// Eksekusi file JS lewat V8 (`js-engine`). Mengembalikan sukses/gagal untuk exit code & log.
fn execute_script(entry_path: &Path, logger: &mut Logger, options: &EngineOptions) -> bool {
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

    let init_started = std::time::Instant::now();
    let mut engine = match Engine::with_options(options.clone()) {
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
    let startup_ms = ms(init_started.elapsed());

    match engine.execute(&entry_path.display().to_string(), &source) {
        Ok(()) => {
            log_engine_success(
                logger,
                entry_path,
                "script",
                startup_ms,
                &engine,
                options.op_metrics,
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
            "--allow-read=/tmp",
            "--allow-net",
            "--max-heap-mb",
            "64",
            "--timeout-ms",
            "1500",
            "--tls-ca",
            "ca.pem",
            "--op-metrics",
        ]));
        assert_eq!(
            parsed,
            Ok(Command::Run {
                entry: Some(PathBuf::from("src/main.ts")),
                config: Some(PathBuf::from("rt.json")),
                log_level: Some(LogLevel::Debug),
                permissions: Permissions {
                    read: Permission::Allow(vec!["/tmp".to_string()]),
                    net: Permission::AllowAll,
                    ..Default::default()
                },
                max_heap_mb: Some(64),
                timeout_ms: Some(1500),
                tls_ca: Some(PathBuf::from("ca.pem")),
                op_metrics: true,
            })
        );
    }

    #[test]
    fn parse_error_untuk_flag_dan_level_tidak_valid() {
        assert!(parse_args(&args(&["run", "--apa"])).is_err());
        assert!(parse_args(&args(&["run", "x", "--log-level", "verbose"])).is_err());
        assert!(parse_args(&args(&["tidak-ada"])).is_err());
        assert!(parse_args(&args(&[])).is_err());
        assert!(parse_args(&args(&["run", "x", "--max-heap-mb", "0"])).is_err());
        assert!(parse_args(&args(&["run", "x", "--max-heap-mb", "banyak"])).is_err());
        assert!(parse_args(&args(&["run", "x", "--timeout-ms", "-5"])).is_err());
        assert!(parse_args(&args(&["run", "x", "--timeout-ms"])).is_err());
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
