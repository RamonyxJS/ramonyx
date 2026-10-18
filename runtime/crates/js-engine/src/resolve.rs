//! Resolusi bare specifier (`node_modules`) untuk ESM — versi 1.
//!
//! Cakupan: walk-up `node_modules`, field `exports` (string, kondisi `import`/`module`/`default`,
//! subpath + wildcard `./*`), fallback `module` → `main` → `index.js`, fallback ekstensi.
//! Batasan dicatat: urutan key kondisi tidak penuh sesuai spesifikasi, tanpa self-reference,
//! dan **CommonJS (.cjs) ditolak** dengan pesan jelas (lihat ADR-0026).

use std::path::{Path, PathBuf};

use deno_core::ModuleSpecifier;
use deno_error::JsErrorBox;
use serde_json::Value;

/// Pecah specifier menjadi (nama paket, subpath). Subpath selalu diawali `"./"` (atau `"."`).
fn split_specifier(specifier: &str) -> Result<(String, String), JsErrorBox> {
    if specifier.is_empty() {
        return Err(JsErrorBox::generic("specifier kosong"));
    }

    let (name, rest) = if specifier.starts_with('@') {
        let mut parts = specifier.splitn(3, '/');
        let scope = parts.next().unwrap_or_default();
        let package = parts
            .next()
            .ok_or_else(|| JsErrorBox::generic(format!("specifier tidak valid: {specifier}")))?;
        let rest = parts.next().unwrap_or_default();
        (format!("{scope}/{package}"), rest)
    } else {
        let mut parts = specifier.splitn(2, '/');
        let package = parts.next().unwrap_or_default().to_string();
        let rest = parts.next().unwrap_or_default();
        (package, rest)
    };

    let subpath = if rest.is_empty() {
        ".".to_string()
    } else {
        format!("./{rest}")
    };
    Ok((name, subpath))
}

/// Resolusi kondisi `exports`: string / array (pertama yang berhasil) / object kondisi.
fn resolve_condition(value: &Value) -> Option<PathBuf> {
    match value {
        Value::String(target) => Some(PathBuf::from(target)),
        Value::Array(items) => items.iter().find_map(resolve_condition),
        Value::Object(map) => {
            for key in ["import", "module", "default"] {
                if let Some(inner) = map.get(key)
                    && let Some(path) = resolve_condition(inner)
                {
                    return Some(path);
                }
            }
            None
        }
        _ => None,
    }
}

fn resolve_exports(exports: &Value, subpath: &str) -> Option<PathBuf> {
    match exports {
        Value::String(target) if subpath == "." => Some(PathBuf::from(target)),
        Value::Object(map) => {
            let is_subpath_map = map.keys().any(|key| key == "." || key.starts_with("./"));
            if is_subpath_map {
                if let Some(value) = map.get(subpath) {
                    return resolve_condition(value);
                }
                for (key, value) in map {
                    if let Some(prefix) = key.strip_suffix('*')
                        && let Some(rest) = subpath.strip_prefix(prefix)
                        && let Some(target) = resolve_condition(value)
                    {
                        let replaced = target.to_string_lossy().replace('*', rest);
                        return Some(PathBuf::from(replaced));
                    }
                }
                None
            } else {
                resolve_condition(exports)
            }
        }
        _ => None,
    }
}

/// Kandidat file dari target relatif (fallback ekstensi + index), sesuai loader.
fn resolve_file_candidates(base: &Path) -> Option<PathBuf> {
    if base.is_file() {
        return Some(base.to_path_buf());
    }
    if base.extension().is_none() {
        for extension in ["js", "mjs", "ts", "tsx"] {
            let candidate = base.with_extension(extension);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    if base.is_dir() {
        for entry in ["index.js", "index.mjs", "index.ts", "index.tsx"] {
            let candidate = base.join(entry);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

fn package_entry_from_manifest(
    package_dir: &Path,
    subpath: &str,
) -> Result<Option<PathBuf>, JsErrorBox> {
    let manifest_path = package_dir.join("package.json");
    let manifest: Option<Value> = if manifest_path.is_file() {
        let raw = std::fs::read_to_string(&manifest_path).map_err(|error| {
            JsErrorBox::generic(format!(
                "gagal membaca {}: {error}",
                manifest_path.display()
            ))
        })?;
        Some(serde_json::from_str(&raw).map_err(|error| {
            JsErrorBox::generic(format!(
                "package.json tidak valid di {}: {error}",
                package_dir.display()
            ))
        })?)
    } else {
        None
    };

    let package_name = manifest
        .as_ref()
        .and_then(|value| value.get("name"))
        .and_then(Value::as_str)
        .unwrap_or("(tanpa nama)")
        .to_string();

    if let Some(manifest) = &manifest
        && let Some(exports) = manifest.get("exports")
    {
        return match resolve_exports(exports, subpath) {
            Some(target) => Ok(Some(package_dir.join(target))),
            None => Err(JsErrorBox::generic(format!(
                "paket \"{package_name}\" tidak mengekspor \"{subpath}\" (field exports)"
            ))),
        };
    }

    if subpath != "." {
        // Tanpa exports: subpath dipetakan langsung dari direktori paket.
        return Ok(Some(package_dir.join(subpath.trim_start_matches("./"))));
    }

    if let Some(manifest) = &manifest {
        for field in ["module", "main"] {
            if let Some(target) = manifest.get(field).and_then(Value::as_str) {
                return Ok(Some(package_dir.join(target)));
            }
        }
    }

    Ok(None)
}

/// Resolusi bare specifier dari `referrer` (file:// URL modul yang mengimpor).
pub fn resolve_bare(specifier: &str, referrer: &str) -> Result<ModuleSpecifier, JsErrorBox> {
    let referrer_url = ModuleSpecifier::parse(referrer)
        .map_err(|error| JsErrorBox::generic(format!("referrer tidak valid: {error}")))?;
    let referrer_path = referrer_url
        .to_file_path()
        .map_err(|_| JsErrorBox::generic("hanya file:// yang didukung"))?;

    let (package_name, subpath) = split_specifier(specifier)?;

    let mut directory = referrer_path.parent().map(Path::to_path_buf);
    while let Some(current) = directory {
        let package_dir = current.join("node_modules").join(&package_name);
        if package_dir.is_dir() {
            let mut candidate = package_entry_from_manifest(&package_dir, &subpath)?;
            if candidate.is_none() {
                candidate = Some(package_dir.join("index.js"));
            }
            let candidate = candidate.expect("kandidat selalu ada");

            let resolved = resolve_file_candidates(&candidate).ok_or_else(|| {
                JsErrorBox::generic(format!(
                    "entri paket tidak ditemukan untuk \"{specifier}\" (dicoba: {})",
                    candidate.display()
                ))
            })?;

            if resolved.extension().is_some_and(|ext| ext == "cjs") {
                return Err(JsErrorBox::generic(format!(
                    "paket \"{package_name}\" adalah CommonJS (.cjs) — belum didukung runtime ini"
                )));
            }

            return ModuleSpecifier::from_file_path(&resolved).map_err(|_| {
                JsErrorBox::generic(format!("path tidak valid: {}", resolved.display()))
            });
        }
        directory = current.parent().map(Path::to_path_buf);
    }

    Err(JsErrorBox::generic(format!(
        "paket \"{package_name}\" tidak ditemukan di node_modules (dari {})",
        referrer_path.display()
    )))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    struct Fixture {
        root: PathBuf,
    }

    impl Fixture {
        fn new(name: &str) -> Self {
            let root =
                std::env::temp_dir().join(format!("ramonyx-resolve-{name}-{}", std::process::id()));
            let _ = fs::remove_dir_all(&root);
            fs::create_dir_all(root.join("app/src")).expect("mkdir");
            Self { root }
        }

        fn write(&self, relative: &str, contents: &str) {
            let path = self.root.join(relative);
            fs::create_dir_all(path.parent().expect("parent")).expect("mkdir");
            fs::write(path, contents).expect("write");
        }

        fn app_referrer(&self) -> String {
            ModuleSpecifier::from_file_path(self.root.join("app/src/main.mjs"))
                .expect("url")
                .to_string()
        }

        fn resolved(&self, specifier: &str) -> Result<ModuleSpecifier, JsErrorBox> {
            resolve_bare(specifier, &self.app_referrer())
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    #[test]
    fn exports_import_condition_dipakai() {
        let fixture = Fixture::new("exports-cond");
        fixture.write(
            "app/node_modules/demo/package.json",
            r#"{ "name": "demo", "exports": { ".": { "import": "./esm/main.js", "default": "./esm/main.js" } } }"#,
        );
        fixture.write("app/node_modules/demo/esm/main.js", "export const x = 1;");

        let resolved = fixture.resolved("demo").expect("resolve");
        assert!(resolved.path().ends_with("esm/main.js"), "{resolved}");
    }

    #[test]
    fn main_dan_subpath_dan_wildcard() {
        let fixture = Fixture::new("main-subpath");
        fixture.write(
            "app/node_modules/lama/package.json",
            r#"{ "name": "lama", "main": "lib/index.js" }"#,
        );
        fixture.write("app/node_modules/lama/lib/index.js", "export const x = 1;");
        assert!(
            fixture
                .resolved("lama")
                .expect("main")
                .path()
                .ends_with("lib/index.js")
        );

        fixture.write(
            "app/node_modules/banyak/package.json",
            r#"{ "name": "banyak", "exports": { "./fitur/*": "./dist/*.js" } }"#,
        );
        fixture.write(
            "app/node_modules/banyak/dist/alpha.js",
            "export const a = 1;",
        );
        let wildcard = fixture.resolved("banyak/fitur/alpha").expect("wildcard");
        assert!(wildcard.path().ends_with("dist/alpha.js"), "{wildcard}");
    }

    #[test]
    fn walk_up_menemukan_node_modules_di_root_app() {
        let fixture = Fixture::new("walk-up");
        fixture.write(
            "app/node_modules/naik/package.json",
            r#"{ "name": "naik", "module": "index.mjs" }"#,
        );
        fixture.write("app/node_modules/naik/index.mjs", "export const x = 1;");
        // referrer lebih dalam: app/src/… → node_modules ada di app/
        fixture.write("app/src/dalam/lagi.mjs", "");
        let referrer = ModuleSpecifier::from_file_path(fixture.root.join("app/src/dalam/lagi.mjs"))
            .expect("url")
            .to_string();
        let resolved = resolve_bare("naik", &referrer).expect("resolve");
        assert!(resolved.path().ends_with("index.mjs"), "{resolved}");
    }

    #[test]
    fn paket_hilang_dan_cjs_ditolak_dengan_pesan_jelas() {
        let fixture = Fixture::new("errors");
        let missing = fixture.resolved("tidak-ada").expect_err("hilang");
        assert!(missing.to_string().contains("tidak ditemukan"), "{missing}");

        fixture.write(
            "app/node_modules/cjs-pkg/package.json",
            r#"{ "name": "cjs-pkg", "main": "index.cjs" }"#,
        );
        fixture.write("app/node_modules/cjs-pkg/index.cjs", "module.exports = {};");
        let cjs = fixture.resolved("cjs-pkg").expect_err("cjs");
        assert!(cjs.to_string().contains("CommonJS"), "{cjs}");
    }

    #[test]
    fn exports_tanpa_subpath_yang_diminta_menu_error_jelas() {
        let fixture = Fixture::new("exports-gap");
        fixture.write(
            "app/node_modules/terbatas/package.json",
            r#"{ "name": "terbatas", "exports": { ".": "./index.js" } }"#,
        );
        fixture.write("app/node_modules/terbatas/index.js", "export const x = 1;");
        let error = fixture
            .resolved("terbatas/internal")
            .expect_err("tidak diekspor");
        assert!(error.to_string().contains("tidak mengekspor"), "{error}");
    }
}
