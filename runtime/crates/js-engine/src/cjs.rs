//! Interop CommonJS v1 (ADR-0029): menjalankan modul CJS lewat loader ESM.
//!
//! Alur: begitu loader menjumpai file CJS (ekstensi `.cjs`, atau `.js` yang
//! `package.json` terdekatnya bukan `"type": "module"`), seluruh graf
//! `require()` **statis** dipindai lebih dulu di sisi Rust; sumber-sumbernya
//! di-embed ke satu modul ESM sintetis. Di dalam mesin, `require` sinkron
//! dilayani dari record yang sudah di memori — wrapper CJS klasik
//! (`exports`/`require`/`module`/`__filename`/`__dirname`) dijalankan lewat
//! `new Function`.
//!
//! Cakupan v1: require literal (relative + bare via `node_modules`), JSON,
//! mengikuti rantai `module.exports = require(...)`, named export heuristik
//! untuk konsumen ESM, `process` minimal, cache modul global per realm.
//!
//! Batasan (dicatat, bukan klaim): tanpa require dinamis, `require()` modul
//! ESM/TypeScript, modul bawaan Node, `require.resolve`, dan tanpa
//! `Object.defineProperty` sebagai sumber named export.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use deno_core::ModuleSpecifier;
use serde_json::json;

use crate::resolve::resolve_bare;

/// Kedalaman maksimum graf require (jaga-jaga terhadap paket aneh).
const MAX_DEPTH: usize = 64;

/// Nama-nama modul bawaan Node yang dikenali untuk pesan error yang jelas.
const NODE_BUILTINS: &[&str] = &[
    "assert",
    "async_hooks",
    "buffer",
    "child_process",
    "cluster",
    "console",
    "constants",
    "crypto",
    "dgram",
    "diagnostics_channel",
    "dns",
    "domain",
    "events",
    "fs",
    "http",
    "http2",
    "https",
    "inspector",
    "module",
    "net",
    "os",
    "path",
    "perf_hooks",
    "process",
    "punycode",
    "querystring",
    "readline",
    "repl",
    "stream",
    "string_decoder",
    "sys",
    "timers",
    "tls",
    "trace_events",
    "tty",
    "url",
    "util",
    "v8",
    "vm",
    "wasi",
    "worker_threads",
    "zlib",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum CjsKind {
    Js,
    Json,
}

/// Hasil resolusi satu `require("...")`.
#[derive(Debug, Clone)]
pub(crate) enum RequireTarget {
    Resolved(PathBuf),
    Error(String),
}

#[derive(Debug)]
pub(crate) struct CjsModule {
    pub path: PathBuf,
    pub kind: CjsKind,
    pub source: String,
    pub requires: Vec<(String, RequireTarget)>,
}

#[derive(Debug)]
pub(crate) struct CjsGraph {
    pub entry: PathBuf,
    pub modules: Vec<CjsModule>,
    pub export_names: Vec<String>,
}

fn canonical(path: &Path) -> PathBuf {
    std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

/// Apakah file ini harus diperlakukan sebagai CommonJS?
/// Aturan mengikuti Node: `.cjs` selalu CJS; `.js` mengikuti `"type"` di
/// `package.json` terdekat (tanpa package.json → CJS); `.mjs`/`.tsx`/dll bukan.
pub(crate) fn is_cjs_file(path: &Path) -> bool {
    match path.extension().and_then(|ext| ext.to_str()) {
        Some("cjs") => true,
        Some("js") => !package_type_is_module(path),
        _ => false,
    }
}

fn package_type_is_module(path: &Path) -> bool {
    let mut directory = path.parent();
    while let Some(current) = directory {
        let manifest = current.join("package.json");
        if manifest.is_file() {
            return std::fs::read_to_string(&manifest)
                .ok()
                .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
                .and_then(|value| {
                    value
                        .get("type")
                        .and_then(serde_json::Value::as_str)
                        .map(|kind| kind == "module")
                })
                .unwrap_or(false);
        }
        directory = current.parent();
    }
    false
}

/// Bangun graf require untuk modul CJS `entry` (rekursif, dedupe per path kanonik).
pub(crate) fn build_graph(entry: &Path) -> Result<CjsGraph, String> {
    let entry = canonical(entry);
    let mut modules: Vec<CjsModule> = Vec::new();
    let mut index: HashMap<PathBuf, usize> = HashMap::new();
    load_module(&entry, &mut modules, &mut index, 0)?;
    let export_names = collect_export_names(&entry, &modules, &index, 0);
    Ok(CjsGraph {
        entry,
        modules,
        export_names,
    })
}

fn load_module(
    path: &Path,
    modules: &mut Vec<CjsModule>,
    index: &mut HashMap<PathBuf, usize>,
    depth: usize,
) -> Result<(), String> {
    if index.contains_key(path) {
        return Ok(());
    }
    if depth > MAX_DEPTH {
        return Err(format!(
            "graf require terlalu dalam ({depth} level) di {}",
            path.display()
        ));
    }

    let kind = match path.extension().and_then(|ext| ext.to_str()) {
        Some("json") => CjsKind::Json,
        _ => CjsKind::Js,
    };

    let mut source = std::fs::read_to_string(path)
        .map_err(|error| format!("tidak bisa membaca {}: {error}", path.display()))?;
    if kind == CjsKind::Js && source.starts_with("#!") {
        // Node memotong shebang sebelum membungkus modul — kita ikuti.
        source = source
            .split_once('\n')
            .map(|(_, rest)| rest.to_string())
            .unwrap_or_default();
    }

    index.insert(path.to_path_buf(), modules.len());
    let requires = if kind == CjsKind::Js {
        scan_require_targets(&source, path)
    } else {
        Vec::new()
    };

    modules.push(CjsModule {
        path: path.to_path_buf(),
        kind,
        source,
        requires,
    });

    let children: Vec<PathBuf> = modules
        .last()
        .into_iter()
        .flat_map(|module| module.requires.iter())
        .filter_map(|(_, target)| match target {
            RequireTarget::Resolved(child) => Some(child.clone()),
            RequireTarget::Error(_) => None,
        })
        .collect();

    for child in children {
        load_module(&child, modules, index, depth + 1)?;
    }
    Ok(())
}

fn scan_require_targets(source: &str, from: &Path) -> Vec<(String, RequireTarget)> {
    let masked = mask_comments(source);
    let mut targets = Vec::new();
    let mut seen = HashSet::new();
    for spec in scan_require_args(&masked) {
        if !seen.insert(spec.clone()) {
            continue;
        }
        targets.push((spec.clone(), resolve_require(&spec, from)));
    }
    targets
}

fn resolve_require(spec: &str, from: &Path) -> RequireTarget {
    let lower = spec.to_ascii_lowercase();
    let builtin = lower.strip_prefix("node:").unwrap_or(&lower);
    let head = builtin.split('/').next().unwrap_or(builtin);
    if spec.starts_with("node:") || NODE_BUILTINS.contains(&head) {
        return RequireTarget::Error(format!(
            "modul bawaan Node \"{spec}\" belum didukung runtime ini"
        ));
    }

    let resolved = if spec.starts_with("./") || spec.starts_with("../") || spec.starts_with('/') {
        let base = from.parent().unwrap_or_else(|| Path::new("/")).join(spec);
        resolve_relative_candidates(&base)
    } else {
        ModuleSpecifier::from_file_path(from)
            .ok()
            .map(|url| url.to_string())
            .and_then(|referrer| resolve_bare(spec, &referrer).ok())
            .and_then(|url| url.to_file_path().ok())
    };

    let Some(path) = resolved else {
        return RequireTarget::Error(format!(
            "tidak bisa me-resolve \"{spec}\" dari {}",
            from.display()
        ));
    };
    let path = canonical(&path);

    match path.extension().and_then(|ext| ext.to_str()) {
        Some("json") => RequireTarget::Resolved(path),
        _ if is_cjs_file(&path) => RequireTarget::Resolved(path),
        Some(ext) => RequireTarget::Error(format!(
            "require() ke modul non-CJS (\"{spec}\", .{ext}) belum didukung"
        )),
        None => RequireTarget::Error(format!(
            "require() ke \"{spec}\" tanpa ekstensi yang dikenali belum didukung"
        )),
    }
}

/// Resolusi `require`, gaya CJS: file persis → ekstensi → `index.*`.
fn resolve_relative_candidates(base: &Path) -> Option<PathBuf> {
    if base.is_file() {
        return Some(base.to_path_buf());
    }
    if base.extension().is_none() {
        for extension in ["js", "cjs", "json", "mjs", "ts", "tsx"] {
            let candidate = base.with_extension(extension);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    if base.is_dir() {
        for entry in ["index.js", "index.cjs", "index.json", "index.mjs"] {
            let candidate = base.join(entry);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

// --- Pemindai sumber (komentar dimask, string dilewati saat pemindaian) ------------------

fn is_ident_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'$'
}

/// Ganti isi komentar dengan spasi agar pemindaian tidak terkecoh kode yang
/// dikomentari. String literal dibiarkan utuh (dibutuhkan untuk argumen `require`).
fn mask_comments(source: &str) -> String {
    #[derive(Clone, Copy, PartialEq)]
    enum State {
        Normal,
        Line,
        Block,
        Single,
        Double,
        Template,
    }

    let bytes = source.as_bytes();
    let mut out = bytes.to_vec();
    let mut state = State::Normal;
    let mut i = 0;
    while i < bytes.len() {
        let byte = bytes[i];
        match state {
            State::Normal => {
                if byte == b'/' && i + 1 < bytes.len() && bytes[i + 1] == b'/' {
                    out[i] = b' ';
                    out[i + 1] = b' ';
                    state = State::Line;
                    i += 2;
                } else if byte == b'/' && i + 1 < bytes.len() && bytes[i + 1] == b'*' {
                    out[i] = b' ';
                    out[i + 1] = b' ';
                    state = State::Block;
                    i += 2;
                } else {
                    state = match byte {
                        b'\'' => State::Single,
                        b'"' => State::Double,
                        b'`' => State::Template,
                        _ => State::Normal,
                    };
                    i += 1;
                }
            }
            State::Line => {
                if byte == b'\n' {
                    state = State::Normal;
                } else {
                    out[i] = b' ';
                }
                i += 1;
            }
            State::Block => {
                if byte == b'*' && i + 1 < bytes.len() && bytes[i + 1] == b'/' {
                    out[i] = b' ';
                    out[i + 1] = b' ';
                    state = State::Normal;
                    i += 2;
                } else {
                    out[i] = b' ';
                    i += 1;
                }
            }
            State::Single | State::Double | State::Template => {
                let quote = match state {
                    State::Single => b'\'',
                    State::Double => b'"',
                    _ => b'`',
                };
                if byte == b'\\' {
                    i += 2;
                } else if byte == quote {
                    state = State::Normal;
                    i += 1;
                } else {
                    i += 1;
                }
            }
        }
    }
    // Semua penggantian hanya spasi ASCII → hasil tetap UTF-8 valid.
    String::from_utf8(out).unwrap_or_else(|_| source.to_string())
}

/// Lewati string literal (single/double/template) mulai dari `start`.
fn skip_string(bytes: &[u8], start: usize) -> usize {
    let quote = bytes[start];
    let mut i = start + 1;
    while i < bytes.len() {
        if bytes[i] == b'\\' {
            i += 2;
        } else if bytes[i] == quote {
            return i + 1;
        } else {
            i += 1;
        }
    }
    bytes.len()
}

fn skip_whitespace(bytes: &[u8], mut i: usize) -> usize {
    while i < bytes.len() && bytes[i].is_ascii_whitespace() {
        i += 1;
    }
    i
}

/// Baca `require("...")` bila dimulai pada `at` (posisi huruf `r`).
fn try_require_at(code: &str, at: usize) -> Option<(String, usize)> {
    let bytes = code.as_bytes();
    if !code[at..].starts_with("require") {
        return None;
    }
    if at > 0 && is_ident_byte(bytes[at - 1]) {
        return None;
    }
    let mut i = skip_whitespace(bytes, at + "require".len());
    if i >= bytes.len() || bytes[i] != b'(' {
        return None;
    }
    i = skip_whitespace(bytes, i + 1);
    if i >= bytes.len() || (bytes[i] != b'"' && bytes[i] != b'\'') {
        return None;
    }
    let quote = bytes[i];
    let mut value = String::new();
    let mut escaped = false;
    let mut index = i + 1;
    for character in code[i + 1..].chars() {
        if escaped {
            value.push(character);
            escaped = false;
            index += character.len_utf8();
            continue;
        }
        if character == '\\' {
            escaped = true;
            index += 1;
            continue;
        }
        if character == quote as char {
            // Lanjut setelah kutip penutup agar isi string tidak dipindai lagi.
            return Some((value, index + 1));
        }
        if character == '\n' {
            return None;
        }
        value.push(character);
        index += character.len_utf8();
    }
    None
}

/// Kumpulkan argumen literal `require("...")` (komentar & string dilewati).
fn scan_require_args(code: &str) -> Vec<String> {
    let bytes = code.as_bytes();
    let mut specs = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'"' | b'\'' | b'`' => i = skip_string(bytes, i),
            b'r' => {
                if let Some((spec, next)) = try_require_at(code, i) {
                    specs.push(spec);
                    i = next;
                } else {
                    i += 1;
                }
            }
            _ => i += 1,
        }
    }
    specs
}

fn is_valid_export_name(name: &str) -> bool {
    if name.is_empty() || name == "default" || name == "__esModule" {
        return false;
    }
    const RESERVED: &[&str] = &[
        "await",
        "break",
        "case",
        "catch",
        "class",
        "const",
        "continue",
        "debugger",
        "delete",
        "do",
        "else",
        "enum",
        "export",
        "extends",
        "false",
        "finally",
        "for",
        "function",
        "if",
        "implements",
        "import",
        "in",
        "instanceof",
        "interface",
        "let",
        "new",
        "null",
        "package",
        "private",
        "protected",
        "public",
        "return",
        "static",
        "super",
        "switch",
        "this",
        "throw",
        "true",
        "try",
        "typeof",
        "var",
        "void",
        "while",
        "with",
        "yield",
    ];
    if RESERVED.contains(&name) {
        return false;
    }
    let mut chars = name.chars();
    match chars.next() {
        Some(first) if first.is_ascii_alphabetic() || first == '_' || first == '$' => {}
        _ => return false,
    }
    chars.all(|character| character.is_ascii_alphanumeric() || character == '_' || character == '$')
}

/// `= assignment` (bukan `==`/`===`).
fn is_simple_assignment(bytes: &[u8], at: usize) -> bool {
    let i = skip_whitespace(bytes, at);
    bytes.get(i) == Some(&b'=')
        && bytes.get(i + 1) != Some(&b'=')
        && bytes.get(i + 1) != Some(&b'>')
}

/// Baca `exports.NAME =` / `exports["NAME"] =` mulai dari `at` (posisi `e`).
fn parse_named_export_at(code: &str, at: usize) -> Option<(String, usize)> {
    let bytes = code.as_bytes();
    let after = at + "exports".len();
    match bytes.get(after) {
        Some(b'.') => {
            let name_start = after + 1;
            let mut end = name_start;
            while end < bytes.len() && is_ident_byte(bytes[end]) {
                end += 1;
            }
            if end == name_start {
                return None;
            }
            let name = code[name_start..end].to_string();
            if !is_simple_assignment(bytes, end) {
                return None;
            }
            Some((name, end))
        }
        Some(b'[') => {
            let mut i = skip_whitespace(bytes, after + 1);
            let quote = *bytes.get(i)?;
            if quote != b'"' && quote != b'\'' {
                return None;
            }
            i += 1;
            let mut name = String::new();
            let mut escaped = false;
            let mut closing = None;
            let mut index = i;
            for character in code[i..].chars() {
                if escaped {
                    name.push(character);
                    escaped = false;
                    index += character.len_utf8();
                    continue;
                }
                if character == '\\' {
                    escaped = true;
                    index += 1;
                    continue;
                }
                if character == quote as char {
                    closing = Some(index);
                    break;
                }
                if character == '\n' {
                    return None;
                }
                name.push(character);
                index += character.len_utf8();
            }
            let closing = closing?;
            let mut after_name = skip_whitespace(bytes, closing + 1);
            if bytes.get(after_name) != Some(&b']') {
                return None;
            }
            after_name = skip_whitespace(bytes, after_name + 1);
            if !is_simple_assignment(bytes, after_name) {
                return None;
            }
            Some((name, after_name))
        }
        _ => None,
    }
}

/// Baca string literal pada posisi `at` (kutip tunggal/ganda), kembalikan isi
/// dan indeks setelah kutip penutup.
fn read_quoted_at(code: &str, at: usize) -> Option<(String, usize)> {
    let bytes = code.as_bytes();
    let quote = *bytes.get(at)?;
    if quote != b'"' && quote != b'\'' {
        return None;
    }
    let mut value = String::new();
    let mut escaped = false;
    let mut index = at + 1;
    for character in code[at + 1..].chars() {
        if escaped {
            value.push(character);
            escaped = false;
            index += character.len_utf8();
            continue;
        }
        if character == '\\' {
            escaped = true;
            index += 1;
            continue;
        }
        if character == quote as char {
            return Some((value, index + 1));
        }
        if character == '\n' {
            return None;
        }
        value.push(character);
        index += character.len_utf8();
    }
    None
}

/// Lewati satu nilai hingga `,`/`}` pada level teratas (menghormati nesting).
fn skip_balanced_value(bytes: &[u8], mut i: usize) -> usize {
    let mut depth: i32 = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'"' | b'\'' | b'`' => i = skip_string(bytes, i),
            b'(' | b'[' | b'{' => {
                depth += 1;
                i += 1;
            }
            b')' | b']' => {
                if depth == 0 {
                    return i;
                }
                depth -= 1;
                i += 1;
            }
            b'}' => {
                if depth == 0 {
                    return i;
                }
                depth -= 1;
                i += 1;
            }
            b',' if depth == 0 => return i,
            _ => i += 1,
        }
    }
    i
}

/// Named export dari bentuk `module.exports = { ... }` (key level pertama,
/// termasuk shorthand `{ halo, versi }`).
fn parse_module_exports_object_names(code: &str) -> Vec<String> {
    let bytes = code.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'"' | b'\'' | b'`' => i = skip_string(bytes, i),
            b'm' if code[i..].starts_with("module") => {
                let boundary_ok = i == 0 || !is_ident_byte(bytes[i - 1]);
                if boundary_ok {
                    let mut j = skip_whitespace(bytes, i + "module".len());
                    if bytes.get(j) == Some(&b'.') {
                        j = skip_whitespace(bytes, j + 1);
                        if code[j..].starts_with("exports") {
                            j = skip_whitespace(bytes, j + "exports".len());
                            if bytes.get(j) == Some(&b'=') && bytes.get(j + 1) != Some(&b'=') {
                                j = skip_whitespace(bytes, j + 1);
                                if bytes.get(j) == Some(&b'{') {
                                    return parse_object_keys(code, j);
                                }
                            }
                        }
                    }
                }
                i += 1;
            }
            _ => i += 1,
        }
    }
    Vec::new()
}

fn parse_object_keys(code: &str, brace: usize) -> Vec<String> {
    let bytes = code.as_bytes();
    let mut names = Vec::new();
    let mut seen = HashSet::new();
    let mut i = brace + 1;
    while i < bytes.len() {
        i = skip_whitespace(bytes, i);
        let Some(&byte) = bytes.get(i) else {
            break;
        };
        if byte == b'}' {
            break;
        }
        if byte == b',' {
            i += 1;
            continue;
        }

        let key = if byte == b'"' || byte == b'\'' {
            read_quoted_at(code, i).map(|(value, next)| {
                i = next;
                value
            })
        } else if is_ident_byte(byte) {
            let mut end = i;
            while end < bytes.len() && is_ident_byte(bytes[end]) {
                end += 1;
            }
            let value = code[i..end].to_string();
            i = end;
            Some(value)
        } else {
            None
        };

        if let Some(key) = key
            && is_valid_export_name(&key)
            && seen.insert(key.clone())
        {
            names.push(key);
        }

        i = skip_balanced_value(bytes, i);
        match bytes.get(i) {
            Some(&b',') => i += 1,
            Some(&b'}') => break,
            Some(_) => i += 1,
            None => break,
        }
    }
    names
}

/// Kumpulkan nama named export dari pola `exports.NAME =`, `exports["NAME"] =`,
/// `module.exports.NAME =`, dan `module.exports = { ... }`.
fn scan_export_names(code: &str) -> Vec<String> {
    let bytes = code.as_bytes();
    let mut names = Vec::new();
    let mut seen = HashSet::new();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'"' | b'\'' | b'`' => i = skip_string(bytes, i),
            b'e' if code[i..].starts_with("exports") => {
                let boundary_ok = i == 0 || !is_ident_byte(bytes[i - 1]);
                if boundary_ok && let Some((name, next)) = parse_named_export_at(code, i) {
                    if is_valid_export_name(&name) && seen.insert(name.clone()) {
                        names.push(name);
                    }
                    i = next;
                    continue;
                }
                i += 1;
            }
            _ => i += 1,
        }
    }
    names
}

/// Cari pola `module.exports = require("...")` (untuk mengikuti rantai re-export).
fn find_module_exports_require(code: &str) -> Option<String> {
    let bytes = code.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'"' | b'\'' | b'`' => i = skip_string(bytes, i),
            b'm' if code[i..].starts_with("module") => {
                let boundary_ok = i == 0 || !is_ident_byte(bytes[i - 1]);
                if boundary_ok {
                    let mut j = i + "module".len();
                    j = skip_whitespace(bytes, j);
                    if bytes.get(j) == Some(&b'.') {
                        j = skip_whitespace(bytes, j + 1);
                        if code[j..].starts_with("exports") {
                            j += "exports".len();
                            j = skip_whitespace(bytes, j);
                            if bytes.get(j) == Some(&b'=') && bytes.get(j + 1) != Some(&b'=') {
                                j = skip_whitespace(bytes, j + 1);
                                if code[j..].starts_with("require") {
                                    j += "require".len();
                                    j = skip_whitespace(bytes, j);
                                    if bytes.get(j) == Some(&b'(') {
                                        j = skip_whitespace(bytes, j + 1);
                                        let quote = *bytes.get(j)?;
                                        if quote == b'"' || quote == b'\'' {
                                            let mut value = String::new();
                                            let mut escaped = false;
                                            for character in code[j + 1..].chars() {
                                                if escaped {
                                                    value.push(character);
                                                    escaped = false;
                                                    continue;
                                                }
                                                if character == '\\' {
                                                    escaped = true;
                                                    continue;
                                                }
                                                if character == quote as char {
                                                    return Some(value);
                                                }
                                                if character == '\n' {
                                                    break;
                                                }
                                                value.push(character);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                i += 1;
            }
            _ => i += 1,
        }
    }
    None
}

/// Named export entri; bila entri hanya `module.exports = require(...)` ikuti rantai.
fn collect_export_names(
    path: &Path,
    modules: &[CjsModule],
    index: &HashMap<PathBuf, usize>,
    depth: usize,
) -> Vec<String> {
    if depth > 8 {
        return Vec::new();
    }
    let Some(&position) = index.get(path) else {
        return Vec::new();
    };
    let module = &modules[position];
    if module.kind == CjsKind::Json {
        return Vec::new();
    }
    let masked = mask_comments(&module.source);
    let names = scan_export_names(&masked);
    if !names.is_empty() {
        return names;
    }
    let object_names = parse_module_exports_object_names(&masked);
    if !object_names.is_empty() {
        return object_names;
    }
    if let Some(spec) = find_module_exports_require(&masked)
        && let Some((_, RequireTarget::Resolved(target))) = module
            .requires
            .iter()
            .find(|(candidate, _)| candidate == &spec)
    {
        return collect_export_names(target, modules, index, depth + 1);
    }
    Vec::new()
}

/// Rakit modul ESM sintetis yang menjalankan graf CJS.
pub(crate) fn generate_module(graph: &CjsGraph, cwd: &str) -> String {
    let mut records = serde_json::Map::new();
    let mut requires = serde_json::Map::new();
    let mut errors = serde_json::Map::new();

    for module in &graph.modules {
        let key = module.path.display().to_string();
        records.insert(
            key.clone(),
            json!({
                "kind": match module.kind {
                    CjsKind::Js => "js",
                    CjsKind::Json => "json",
                },
                "source": module.source.as_str(),
            }),
        );

        let mut target_map = serde_json::Map::new();
        let mut error_map = serde_json::Map::new();
        for (spec, target) in &module.requires {
            match target {
                RequireTarget::Resolved(path) => {
                    target_map.insert(spec.clone(), json!(path.display().to_string()));
                }
                RequireTarget::Error(reason) => {
                    error_map.insert(spec.clone(), json!(reason));
                }
            }
        }
        requires.insert(key.clone(), serde_json::Value::Object(target_map));
        errors.insert(key, serde_json::Value::Object(error_map));
    }

    let named_exports = graph
        .export_names
        .iter()
        .map(|name| format!("export const {name} = __ns[{name:?}];"))
        .collect::<Vec<_>>()
        .join("\n");

    let template = r#"// Dibuat otomatis oleh runtime ramonyx: interop CommonJS v1 (ADR-0029).
// Sumber di-embed agar `require` sinkron tidak memerlukan I/O di JS.
const __records = __RECORDS__;
const __requires = __REQUIRES__;
const __errors = __REQUIRE_ERRORS__;
const __entry = __ENTRY__;
const __cwd = __CWD__;
const __cache = globalThis.__ramonyxCjsCache ?? (globalThis.__ramonyxCjsCache = new Map());
const __process = {
  env: { NODE_ENV: "production" },
  platform: __PLATFORM__,
  arch: __ARCH__,
  version: "v0.0.0",
  versions: {},
  argv: [__ENTRY__],
  argv0: "ramonyx",
  cwd: () => __cwd,
  nextTick: (callback, ...args) => queueMicrotask(() => callback(...args)),
  emitWarning: (warning) => console.warn(String(warning)),
  on: () => __process,
  once: () => __process,
  off: () => __process,
  removeListener: () => __process,
};
function __load(path) {
  if (__cache.has(path)) {
    return __cache.get(path);
  }
  const record = __records[path];
  if (record === undefined) {
    throw new Error("modul CJS tidak ada di graf: " + path);
  }
  if (record.kind === "json") {
    const value = JSON.parse(record.source);
    __cache.set(path, value);
    return value;
  }
  const module = { exports: {} };
  __cache.set(path, module.exports);
  const dirname = path.slice(0, path.lastIndexOf("/"));
  const requireFromPath = (spec) => {
    const target = (__requires[path] || {})[spec];
    if (typeof target === "string") {
      return __load(target);
    }
    const reason = (__errors[path] || {})[spec];
    throw new Error(
      "Cannot find module '" + spec + "' from '" + path + "'" +
        (reason
          ? ": " + reason
          : " (require dinamis belum didukung — hanya require statis yang dipindai)"),
    );
  };
  let factory;
  try {
    factory = new Function(
      "exports",
      "require",
      "module",
      "__filename",
      "__dirname",
      "process",
      "global",
      record.source + "\n//# sourceURL=" + path,
    );
  } catch (error) {
    throw new Error("gagal compile modul CJS " + path + ": " + error.message);
  }
  factory.call(
    module.exports,
    module.exports,
    requireFromPath,
    module,
    path,
    dirname,
    __process,
    globalThis,
  );
  __cache.set(path, module.exports);
  return module.exports;
}
const __ns = __load(__entry);
export default __ns;
__NAMED_EXPORTS__
"#;

    template
        .replace(
            "__RECORDS__",
            &serde_json::Value::Object(records).to_string(),
        )
        .replace(
            "__REQUIRES__",
            &serde_json::Value::Object(requires).to_string(),
        )
        .replace(
            "__REQUIRE_ERRORS__",
            &serde_json::Value::Object(errors).to_string(),
        )
        .replace(
            "__ENTRY__",
            &json!(graph.entry.display().to_string()).to_string(),
        )
        .replace("__CWD__", &json!(cwd).to_string())
        .replace("__PLATFORM__", &json!(std::env::consts::OS).to_string())
        .replace("__ARCH__", &json!(std::env::consts::ARCH).to_string())
        .replace("__NAMED_EXPORTS__", &named_exports)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scanner_mengabaikan_komentar_dan_string() {
        let source = r#"
            const satu = require('./satu.js');
            // require('./di-komentar.js')
            /* require('./di-blok.js') */
            const teks = "require('./di-string.js')";
            const dinamis = require(nama);
            const dua = require("./dua.js");
            const node = require('node:fs');
            const fs = require('fs');
        "#;
        let specs = scan_require_args(&mask_comments(source));
        assert_eq!(
            specs,
            vec![
                "./satu.js".to_string(),
                "./dua.js".to_string(),
                "node:fs".to_string(),
                "fs".to_string(),
            ]
        );

        for builtin in ["fs", "node:path"] {
            match resolve_require(builtin, Path::new("/tmp/x/index.js")) {
                RequireTarget::Error(reason) => {
                    assert!(reason.contains("bawaan Node"), "{builtin}: {reason}");
                }
                other => panic!("{builtin} harus error builtin: {other:?}"),
            }
        }
    }

    #[test]
    fn scanner_named_export_dasar() {
        let source = r#"
            exports.a = 1;
            module.exports.b = 2;
            exports["c"] = 3;
            exports['d'] = 4;
            exports.e == 5;
            exports.default = 6;
            const s = 'exports.palsu = 7';
            // exports.komentar = 8;
        "#;
        let names = scan_export_names(&mask_comments(source));
        assert_eq!(
            names,
            vec![
                "a".to_string(),
                "b".to_string(),
                "c".to_string(),
                "d".to_string()
            ]
        );
    }

    #[test]
    fn scanner_object_literal_dan_shorthand() {
        let source = r#"
            module.exports = {
              halo: function () { return 'a,b)c'; },
              versi: 1,
              gagal: { dalam: true, lain: [1, 2, 3] },
              singkat,
              'nama-bukan-identifier': 2,
              [`komputasi`]: 3,
            };
        "#;
        let names = parse_module_exports_object_names(&mask_comments(source));
        assert_eq!(
            names,
            vec![
                "halo".to_string(),
                "versi".to_string(),
                "gagal".to_string(),
                "singkat".to_string(),
            ]
        );
    }

    #[test]
    fn rantai_reexport_ditemukan() {
        let source = r#"
            'use strict';
            if (process.env.NODE_ENV === 'production') {
              module.exports = require('./prod.js');
            } else {
              module.exports = require('./dev.js');
            }
        "#;
        assert_eq!(
            find_module_exports_require(&mask_comments(source)),
            Some("./prod.js".to_string())
        );
    }

    #[test]
    fn cjs_deteksi_mengikuti_package_json() {
        let root = std::env::temp_dir().join(format!("ramonyx-cjs-detect-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("pkg/lib")).expect("mkdir");
        std::fs::write(root.join("pkg/package.json"), r#"{ "name": "pkg" }"#).expect("manifest");
        std::fs::write(root.join("pkg/lib/umd.cjs"), "module.exports = {};").expect("cjs");
        std::fs::write(root.join("pkg/lib/biasa.js"), "exports.x = 1;").expect("js");

        assert!(is_cjs_file(&root.join("pkg/lib/umd.cjs")));
        assert!(is_cjs_file(&root.join("pkg/lib/biasa.js")));
        assert!(!is_cjs_file(&root.join("pkg/lib/modul.mjs")));

        std::fs::write(
            root.join("pkg/package.json"),
            r#"{ "name": "pkg", "type": "module" }"#,
        )
        .expect("manifest esm");
        assert!(!is_cjs_file(&root.join("pkg/lib/biasa.js")));

        let _ = std::fs::remove_dir_all(&root);
    }
}
