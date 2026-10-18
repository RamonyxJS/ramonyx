//! `js-engine` (R1-lite): eksekusi JavaScript lewat V8 (deno_core).
//!
//! Cakupan saat ini: script JS (bukan ESM import), `console.*` lewat op, error dilaporkan apa adanya.
//! Module loader/ESM dan transform TypeScript adalah sisa R1 (lihat `docs/roadmap/phase-0-1.md`).

use deno_core::{JsRuntime, RuntimeOptions, extension, op2};
use std::fmt;

const BOOTSTRAP: &str = r#"
globalThis.console = {
  log: (...args) => Deno.core.ops.op_log(args.map((value) => String(value)).join(" ")),
  info: (...args) => Deno.core.ops.op_log(args.map((value) => String(value)).join(" ")),
  warn: (...args) => Deno.core.ops.op_log_error(args.map((value) => String(value)).join(" ")),
  error: (...args) => Deno.core.ops.op_log_error(args.map((value) => String(value)).join(" ")),
};
"#;

#[op2(fast)]
fn op_log(#[string] text: String) {
    println!("{text}");
}

#[op2(fast)]
fn op_log_error(#[string] text: String) {
    eprintln!("{text}");
}

extension!(ramonyx_engine, ops = [op_log, op_log_error]);

#[derive(Debug)]
pub struct EngineError {
    message: String,
}

impl fmt::Display for EngineError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}", self.message)
    }
}

impl std::error::Error for EngineError {}

pub struct Engine {
    runtime: JsRuntime,
}

impl Engine {
    pub fn new() -> Result<Self, EngineError> {
        let mut runtime = JsRuntime::new(RuntimeOptions {
            extensions: vec![ramonyx_engine::init()],
            ..Default::default()
        });
        runtime
            .execute_script("[ramonyx:bootstrap]".to_string(), BOOTSTRAP.to_string())
            .map_err(|error| EngineError {
                message: format!("bootstrap gagal: {error}"),
            })?;
        Ok(Self { runtime })
    }

    /// Jalankan script JS; error (syntax/runtime) dikembalikan sebagai `EngineError`.
    pub fn execute(&mut self, name: &str, source: &str) -> Result<(), EngineError> {
        self.runtime
            .execute_script(name.to_string(), source.to_string())
            .map(|_| ())
            .map_err(|error| EngineError {
                message: error.to_string(),
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mengeksekusi_script_sederhana() {
        let mut engine = Engine::new().expect("engine");
        engine
            .execute("[test]", "globalThis.__ramonyx_test = 1 + 1;")
            .expect("eksekusi");
    }

    #[test]
    fn syntax_error_dilaporkan() {
        let mut engine = Engine::new().expect("engine");
        let error = engine
            .execute("[test]", "function ( {")
            .expect_err("harus error");
        assert!(!error.to_string().is_empty());
    }

    #[test]
    fn runtime_throw_dilaporkan() {
        let mut engine = Engine::new().expect("engine");
        let error = engine
            .execute("[test]", "throw new Error('boom');")
            .expect_err("harus error");
        assert!(error.to_string().contains("boom"));
    }
}
