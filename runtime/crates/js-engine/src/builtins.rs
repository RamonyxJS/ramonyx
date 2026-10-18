//! Modul bawaan (subset `node:*`) + operasi sistem pendukung shim (ADR-0031).
//!
//! Allowlist v1: `node:net` (`isIP`) dan `node:dns/promises` (`lookup` via `op_dns_lookup`).
//! Modul bawaan lain ditolak dengan pesan jelas yang menyebutkan yang didukung.
//! `require("node:...")` dari modul CJS belum didukung — hanya `import` ESM.

use std::cell::RefCell;
use std::rc::Rc;

use deno_core::{ModuleSpecifier, OpState, op2};
use deno_error::JsErrorBox;
use runtime_core::{Permission, Permissions};
use serde::Serialize;

/// Skema URL sintetis untuk modul bawaan (mis. `ramonyx-builtin:net`).
pub const BUILTIN_SCHEME: &str = "ramonyx-builtin";

const SUPPORTED: &[&str] = &["node:net", "node:dns/promises"];

pub fn is_builtin_specifier(specifier: &str) -> bool {
    specifier.starts_with("node:") || specifier.starts_with("ramonyx-builtin:")
}

pub fn resolve_builtin(specifier: &str) -> Result<ModuleSpecifier, JsErrorBox> {
    let name = specifier
        .strip_prefix("node:")
        .or_else(|| specifier.strip_prefix("ramonyx-builtin:"))
        .unwrap_or(specifier);
    if !["net", "dns/promises"].contains(&name) {
        return Err(JsErrorBox::generic(format!(
            "modul bawaan Node \"{specifier}\" belum didukung runtime ini (didukung: {})",
            SUPPORTED.join(", ")
        )));
    }
    ModuleSpecifier::parse(&format!("{BUILTIN_SCHEME}:{name}"))
        .map_err(|error| JsErrorBox::generic(format!("specifier bawaan tidak valid: {error}")))
}

pub fn source_for(specifier: &ModuleSpecifier) -> Option<&'static str> {
    match specifier.path() {
        "net" => Some(NODE_NET),
        "dns/promises" => Some(NODE_DNS_PROMISES),
        _ => None,
    }
}

/// Ringkasan permission untuk `ramonyx.permissions.get()`.
#[derive(Serialize)]
pub struct PermissionsSnapshot {
    read: String,
    write: String,
    net: String,
    env: String,
}

#[op2]
#[serde]
pub fn op_permissions_get(state: &mut OpState) -> PermissionsSnapshot {
    let permissions = state.borrow::<Permissions>();
    PermissionsSnapshot {
        read: permissions.read.as_label(),
        write: permissions.write.as_label(),
        net: permissions.net.as_label(),
        env: permissions.env.as_label(),
    }
}

/// Pencabutan permission saat runtime (ADR-0033): hanya bisa **mengurangi** akses —
/// kode JS tidak dapat memberi dirinya sendiri izin baru.
#[op2(fast)]
pub fn op_permissions_revoke(
    state: &mut OpState,
    #[string] kind: String,
) -> Result<(), JsErrorBox> {
    let permissions = state.borrow_mut::<Permissions>();
    match kind.as_str() {
        "read" => permissions.read = Permission::Deny,
        "write" => permissions.write = Permission::Deny,
        "net" => permissions.net = Permission::Deny,
        "env" => permissions.env = Permission::Deny,
        other => {
            return Err(JsErrorBox::generic(format!(
                "permission tidak dikenal: \"{other}\" (read|write|net|env)"
            )));
        }
    }
    Ok(())
}

/// Byte acak dari OS — dipakai `crypto.getRandomValues` di web shim.
#[op2]
#[buffer]
pub fn op_random_bytes(#[smi] length: u32) -> Result<Vec<u8>, JsErrorBox> {
    if length > 65_536 {
        return Err(JsErrorBox::generic(
            "getRandomValues: panjang maksimum 65536 byte",
        ));
    }
    let mut buffer = vec![0u8; length as usize];
    getrandom::fill(&mut buffer)
        .map_err(|error| JsErrorBox::generic(format!("gagal mengambil byte acak: {error}")))?;
    Ok(buffer)
}

#[derive(Serialize)]
pub struct DnsEntry {
    address: String,
    family: u32,
}

/// Resolusi DNS (`node:dns/promises` → `lookup`), permission `--allow-net` per host.
#[op2(async(lazy), fast)]
#[serde]
pub async fn op_dns_lookup(
    state: Rc<RefCell<OpState>>,
    #[string] host: String,
) -> Result<Vec<DnsEntry>, JsErrorBox> {
    let permissions = state.borrow().borrow::<Permissions>().clone();
    permissions.check_net(&host).map_err(JsErrorBox::generic)?;

    let resolved = tokio::net::lookup_host((host.as_str(), 0))
        .await
        .map_err(|error| JsErrorBox::generic(format!("getaddrinfo gagal untuk {host}: {error}")))?;

    let mut entries: Vec<DnsEntry> = Vec::new();
    for address in resolved {
        let family = if address.is_ipv4() { 4 } else { 6 };
        let value = address.ip().to_string();
        if entries.iter().all(|entry| entry.address != value) {
            entries.push(DnsEntry {
                address: value,
                family,
            });
        }
    }
    if entries.is_empty() {
        return Err(JsErrorBox::generic(format!("getaddrinfo ENOTFOUND {host}")));
    }
    Ok(entries)
}

const NODE_NET: &str = r#"
// `node:net` (subset) — ADR-0031. Validator ketat: ragu → 0 (aman, ditolak hulu).
function isIPv4(text) {
  const parts = text.split(".");
  if (parts.length !== 4) {
    return false;
  }
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) {
      return false;
    }
    if (part.length > 1 && part[0] === "0") {
      return false; // leading zero tidak valid (inet_pton)
    }
    if (Number(part) > 255) {
      return false;
    }
  }
  return true;
}

function isIPv6(text) {
  if (text.length === 0 || text.length > 45) {
    return false;
  }
  let host = text;
  const zone = host.indexOf("%");
  if (zone >= 0) {
    host = host.slice(0, zone);
  }
  const parts = host.split("::");
  if (parts.length > 2) {
    return false;
  }
  const head = parts[0];
  const tail = parts.length === 2 ? parts[1] : null;
  const groups = [
    ...(head === "" ? [] : head.split(":")),
    ...(tail === null || tail === "" ? [] : tail.split(":")),
  ];
  let count = 0;
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index];
    if (index === groups.length - 1 && group.includes(".")) {
      if (!isIPv4(group)) {
        return false;
      }
      count += 2;
      continue;
    }
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) {
      return false;
    }
    count += 1;
  }
  if (tail === null) {
    return count === 8;
  }
  return count < 8;
}

export function isIP(value) {
  if (typeof value !== "string") {
    return 0;
  }
  if (isIPv4(value)) {
    return 4;
  }
  if (value.includes(":") && isIPv6(value)) {
    return 6;
  }
  return 0;
}
"#;

const NODE_DNS_PROMISES: &str = r#"
// `node:dns/promises` (subset) — ADR-0031; resolusi lewat `op_dns_lookup`
// (permission `--allow-net` per host).
export async function lookup(hostname, options) {
  const entries = await Deno.core.ops.op_dns_lookup(String(hostname));
  if (options?.all === true) {
    return entries;
  }
  const first = entries[0];
  if (first === undefined) {
    const error = new Error(`getaddrinfo ENOTFOUND ${hostname}`);
    error.code = "ENOTFOUND";
    throw error;
  }
  return first;
}
"#;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_allowlist_dan_error_jelas() {
        let net = resolve_builtin("node:net").expect("net");
        assert_eq!(net.scheme(), BUILTIN_SCHEME);
        assert_eq!(net.path(), "net");
        assert!(source_for(&net).is_some());

        let dns = resolve_builtin("node:dns/promises").expect("dns");
        assert_eq!(dns.path(), "dns/promises");
        assert!(source_for(&dns).is_some());

        let error = resolve_builtin("node:fs").expect_err("fs ditolak");
        let message = error.to_string();
        assert!(message.contains("belum didukung"), "{message}");
        assert!(message.contains("node:net"), "{message}");
    }
}
