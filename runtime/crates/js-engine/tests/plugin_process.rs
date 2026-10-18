//! Isolasi level proses untuk plugin (ADR-0040): plugin dijalankan sebagai proses
//! `ramonyx-runtime` terpisah — crash, exit, dan kill tidak menjatuhkan induk.
//!
//! Binari runtime ditemukan otomatis oleh runtime (sibling `target/<profil>/ramonyx-runtime`),
//! jadi jalankan lewat `cargo test --workspace` (binari CLI ikut dibangun).

use std::path::PathBuf;
use std::time::Duration;

use js_engine::{Engine, EngineOptions};
use runtime_core::Permissions;

fn temp_dir(name: &str) -> PathBuf {
    let directory =
        std::env::temp_dir().join(format!("ramonyx-plugin-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&directory);
    std::fs::create_dir_all(&directory).expect("mkdir");
    directory
}

/// Literal string JS yang aman (path sederhana; lewat Debug escaping).
fn js_literal(value: &std::path::Path) -> String {
    format!("{:?}", value.display().to_string())
}

fn engine(permissions: Permissions) -> Engine {
    Engine::with_options(EngineOptions {
        permissions,
        ..Default::default()
    })
    .expect("engine")
}

#[test]
fn plugin_proses_terpisah_pesan_dan_selesai() {
    let directory = temp_dir("pesan");
    let plugin = directory.join("plugin.mjs");
    std::fs::write(
        &plugin,
        r#"
const pesan = await ramonyx.parent.receive();
await ramonyx.parent.send({ hasil: pesan.a * 2 });
await ramonyx.parent.send({ selesai: true });
"#,
    )
    .expect("write");

    let main = directory.join("main.mjs");
    std::fs::write(
        &main,
        format!(
            r#"
const plugin = await ramonyx.spawn({plugin}, {{}});
await plugin.send({{ a: 21 }});
const balasan = await plugin.receive();
if (balasan?.hasil !== 42) throw new Error("balasan salah: " + JSON.stringify(balasan));
const selesai = await plugin.receive();
if (selesai?.selesai !== true) throw new Error("pesan kedua salah: " + JSON.stringify(selesai));
const akhir = await plugin.receive();
if (akhir !== null) throw new Error("plugin seharusnya selesai: " + JSON.stringify(akhir));
globalThis.__plugin_ok = true;
"#,
            plugin = js_literal(&plugin),
        ),
    )
    .expect("write");

    // Ping-pong plugin tidak butuh permission apa pun.
    let mut engine = Engine::with_options(EngineOptions::default()).expect("engine");
    engine.execute_module(&main).expect("plugin ping-pong");
    engine
        .execute(
            "[verify]",
            "if (globalThis.__plugin_ok !== true) throw new Error('plugin gagal');",
        )
        .expect("verify");

    let _ = std::fs::remove_dir_all(&directory);
}

#[test]
fn plugin_exit_tidak_menjatuhkan_induk() {
    let directory = temp_dir("exit");
    let plugin = directory.join("plugin-exit.mjs");
    std::fs::write(&plugin, "ramonyx.exit(7);\n").expect("write");

    let main = directory.join("main.mjs");
    std::fs::write(
        &main,
        format!(
            r#"
const plugin = await ramonyx.spawn({plugin}, {{}});
const akhir = await plugin.receive();
if (akhir !== null) throw new Error("receive harus null setelah exit");
const kode = await plugin.kill();
if (kode !== 7) throw new Error("exit code harus 7, dapat: " + kode);
// Induk tetap hidup dan dapat melanjutkan pekerjaan.
await ramonyx.sleep(10);
globalThis.__exit_ok = true;
"#,
            plugin = js_literal(&plugin),
        ),
    )
    .expect("write");

    let mut engine = Engine::with_options(EngineOptions::default()).expect("engine");
    engine.execute_module(&main).expect("plugin exit");
    engine
        .execute(
            "[verify]",
            "if (globalThis.__exit_ok !== true) throw new Error('exit gagal');",
        )
        .expect("verify");

    let _ = std::fs::remove_dir_all(&directory);
}

#[test]
fn plugin_menggantung_bisa_dikill() {
    let directory = temp_dir("kill");
    let plugin = directory.join("plugin-spin.mjs");
    std::fs::write(&plugin, "for (;;) {}\n").expect("write");

    let main = directory.join("main.mjs");
    std::fs::write(
        &main,
        format!(
            r#"
const plugin = await ramonyx.spawn({plugin}, {{ timeoutMs: 60000 }});
await ramonyx.sleep(100);
const mulai = Date.now();
await plugin.kill();
if (Date.now() - mulai > 3000) throw new Error("kill terlalu lambat");
const akhir = await plugin.receive();
if (akhir !== null) throw new Error("receive harus null setelah kill");
let pesanError = null;
try {{
  await plugin.send({{ x: 1 }});
}} catch (error) {{
  pesanError = String(error);
}}
if (pesanError === null) throw new Error("send setelah kill harus error");
globalThis.__kill_ok = true;
"#,
            plugin = js_literal(&plugin),
        ),
    )
    .expect("write");

    let mut engine = Engine::with_options(EngineOptions::default()).expect("engine");
    engine.execute_module(&main).expect("plugin kill");
    engine
        .execute(
            "[verify]",
            "if (globalThis.__kill_ok !== true) throw new Error('kill gagal');",
        )
        .expect("verify");

    let _ = std::fs::remove_dir_all(&directory);
}

#[test]
fn plugin_permission_irisan_dan_anti_eskalasi() {
    let directory = temp_dir("permission");
    let file = directory.join("data.txt");
    std::fs::write(&file, "rahasia").expect("write");

    let plugin = directory.join("plugin-baca.mjs");
    std::fs::write(
        &plugin,
        format!(
            r#"
const hasil = {{}};
try {{
  const isi = await ramonyx.readTextFile({file});
  hasil.baca = "lolos:" + isi;
}} catch (error) {{
  hasil.baca = String(error).includes("--allow-read") ? "ditolak" : "error-lain:" + String(error);
}}
await ramonyx.parent.send(hasil);
"#,
            file = js_literal(&file),
        ),
    )
    .expect("write");
    let plugin_literal = js_literal(&plugin);

    // 1) Induk allow_all + izin baca eksplisit → plugin dapat membaca.
    let main_allow = directory.join("main-allow.mjs");
    std::fs::write(
        &main_allow,
        format!(
            r#"
const plugin = await ramonyx.spawn({plugin}, {{ allow: {{ read: [{}] }} }});
const hasil = await plugin.receive();
if (hasil?.baca !== "lolos:rahasia") throw new Error("baca plugin harus lolos: " + JSON.stringify(hasil));
globalThis.__allow_ok = true;
"#,
            js_literal(&directory),
            plugin = plugin_literal,
        ),
    )
    .expect("write");

    // 2) Induk deny-all + plugin minta read → tetap ditolak (anti-eskalasi).
    let main_deny = directory.join("main-deny.mjs");
    std::fs::write(
        &main_deny,
        format!(
            r#"
const plugin = await ramonyx.spawn({plugin}, {{ allow: {{ read: true }} }});
const hasil = await plugin.receive();
if (hasil?.baca !== "ditolak") throw new Error("eskalasi harus ditolak: " + JSON.stringify(hasil));
globalThis.__deny_ok = true;
"#,
            plugin = plugin_literal,
        ),
    )
    .expect("write");

    let mut engine_allow = engine(Permissions::allow_all());
    engine_allow.execute_module(&main_allow).expect("allow");
    engine_allow
        .execute(
            "[verify]",
            "if (globalThis.__allow_ok !== true) throw new Error('allow gagal');",
        )
        .expect("verify");

    let mut engine_deny = engine(Permissions::default());
    engine_deny.execute_module(&main_deny).expect("deny");
    engine_deny
        .execute(
            "[verify]",
            "if (globalThis.__deny_ok !== true) throw new Error('deny gagal');",
        )
        .expect("verify");

    let _ = std::fs::remove_dir_all(&directory);
}

#[test]
fn plugin_timeout_kuota_menghentikan_proses() {
    let directory = temp_dir("timeout");
    let plugin = directory.join("plugin-spin.mjs");
    std::fs::write(&plugin, "for (;;) {}\n").expect("write");

    let main = directory.join("main.mjs");
    std::fs::write(
        &main,
        format!(
            r#"
const plugin = await ramonyx.spawn({plugin}, {{ timeoutMs: 300 }});
const mulai = Date.now();
const akhir = await plugin.receive();
if (akhir !== null) throw new Error("plugin timeout harus berakhir null");
if (Date.now() - mulai > 5000) throw new Error("timeout plugin terlalu lambat");
const kode = await plugin.kill();
if (kode !== 1) throw new Error("exit code timeout harus 1, dapat: " + kode);
globalThis.__timeout_ok = true;
"#,
            plugin = js_literal(&plugin),
        ),
    )
    .expect("write");

    let mut engine = Engine::with_options(EngineOptions::default()).expect("engine");
    engine.execute_module(&main).expect("plugin timeout");
    engine
        .execute(
            "[verify]",
            "if (globalThis.__timeout_ok !== true) throw new Error('timeout gagal');",
        )
        .expect("verify");

    let _ = std::fs::remove_dir_all(&directory);
    // beri waktu proses anak selesai (bila belum)
    std::thread::sleep(Duration::from_millis(50));
}

#[test]
fn plugin_supervisi_restart_otomatis() {
    let directory = temp_dir("restart");
    let marker = directory.join("generasi.txt");
    let plugin = directory.join("plugin-crash-sekali.mjs");
    std::fs::write(
        &plugin,
        format!(
            r#"
const berkas = {marker};
let generasi = 0;
try {{
  generasi = Number(await ramonyx.readTextFile(berkas));
}} catch {{
  generasi = 0;
}}
generasi += 1;
await ramonyx.writeTextFile(berkas, String(generasi));
if (generasi === 1) {{
  ramonyx.exit(3); // crash buatan pada generasi pertama
}}
await ramonyx.parent.send({{ generasi }});
"#,
            marker = js_literal(&marker),
        ),
    )
    .expect("write");

    let main = directory.join("main.mjs");
    std::fs::write(
        &main,
        format!(
            r#"
const plugin = await ramonyx.spawn({plugin}, {{
  allow: {{ read: [{dir}], write: [{dir}] }},
  restart: {{ maxRestarts: 3, delayMs: 50 }},
}});
const pesan = await plugin.receive();
if (pesan?.generasi !== 2) throw new Error("generasi harus 2 setelah restart: " + JSON.stringify(pesan));
// Beri waktu plugin generasi-2 selesai normal (exit 0) + supervisor mereap-nya.
await ramonyx.sleep(300);
const kode = await plugin.kill();
if (kode !== 0) throw new Error("exit akhir harus 0: " + kode);
const stats = plugin.stats();
if (stats.restarts !== 1) throw new Error("restarts harus 1: " + JSON.stringify(stats));
if (stats.stopped !== true) throw new Error("plugin harus berhenti: " + JSON.stringify(stats));
if (stats.lastExit !== 0) throw new Error("lastExit harus 0: " + JSON.stringify(stats));
globalThis.__restart_ok = true;
"#,
            plugin = js_literal(&plugin),
            dir = js_literal(&directory),
        ),
    )
    .expect("write");

    // Anti-eskalasi: induk harus MEMILIKI izin itu dulu agar plugin mendapatkannya.
    let mut engine = engine(Permissions {
        read: runtime_core::Permission::Allow(vec![directory.display().to_string()]),
        write: runtime_core::Permission::Allow(vec![directory.display().to_string()]),
        ..Default::default()
    });
    engine.execute_module(&main).expect("supervisi restart");
    engine
        .execute(
            "[verify]",
            "if (globalThis.__restart_ok !== true) throw new Error('restart gagal');",
        )
        .expect("verify");

    let _ = std::fs::remove_dir_all(&directory);
}

#[test]
fn plugin_supervisi_batas_restart_dihormati() {
    let directory = temp_dir("restart-batas");
    let plugin = directory.join("plugin-selalu-crash.mjs");
    std::fs::write(&plugin, "ramonyx.exit(4);\n").expect("write");

    let main = directory.join("main.mjs");
    std::fs::write(
        &main,
        format!(
            r#"
const plugin = await ramonyx.spawn({plugin}, {{ restart: {{ maxRestarts: 2, delayMs: 20 }} }});
const akhir = await plugin.receive();
if (akhir !== null) throw new Error("harus berakhir null: " + JSON.stringify(akhir));
const stats = plugin.stats();
if (stats.restarts !== 2) throw new Error("restarts harus 2: " + JSON.stringify(stats));
if (stats.lastExit !== 4) throw new Error("lastExit harus 4: " + JSON.stringify(stats));
if (stats.stopped !== true) throw new Error("harus stopped: " + JSON.stringify(stats));
globalThis.__batas_ok = true;
"#,
            plugin = js_literal(&plugin),
        ),
    )
    .expect("write");

    let mut engine = Engine::with_options(EngineOptions::default()).expect("engine");
    engine.execute_module(&main).expect("batas restart");
    engine
        .execute(
            "[verify]",
            "if (globalThis.__batas_ok !== true) throw new Error('batas restart gagal');",
        )
        .expect("verify");

    let _ = std::fs::remove_dir_all(&directory);
}

#[test]
fn plugin_supervisi_kill_menghentikan_tanpa_respawn() {
    let directory = temp_dir("restart-kill");
    let plugin = directory.join("plugin-spin.mjs");
    std::fs::write(&plugin, "for (;;) {}\n").expect("write");

    let main = directory.join("main.mjs");
    std::fs::write(
        &main,
        format!(
            r#"
const plugin = await ramonyx.spawn({plugin}, {{ restart: true }});
await ramonyx.sleep(150);
await plugin.kill();
await ramonyx.sleep(250); // beri kesempatan (seharusnya tidak ada respawn)
const stats = plugin.stats();
if (stats.stopped !== true) throw new Error("harus stopped: " + JSON.stringify(stats));
if (stats.restarts !== 0) throw new Error("tidak boleh restart: " + JSON.stringify(stats));
const akhir = await plugin.receive();
if (akhir !== null) throw new Error("receive harus null: " + JSON.stringify(akhir));
globalThis.__kill_supervisi_ok = true;
"#,
            plugin = js_literal(&plugin),
        ),
    )
    .expect("write");

    let mut engine = Engine::with_options(EngineOptions::default()).expect("engine");
    engine.execute_module(&main).expect("kill supervisi");
    engine
        .execute(
            "[verify]",
            "if (globalThis.__kill_supervisi_ok !== true) throw new Error('kill supervisi gagal');",
        )
        .expect("verify");

    let _ = std::fs::remove_dir_all(&directory);
}

/// Skrip plugin untuk uji health-check: heartbeat berkala + bisa dibuat "hang" (blokir JS).
const PLUGIN_HEARTBEAT: &str = r#"
const berkas = __MARKER__;
let generasi = 0;
try {
  generasi = Number(await ramonyx.readTextFile(berkas));
} catch {
  generasi = 0;
}
generasi += 1;
await ramonyx.writeTextFile(berkas, String(generasi));

// Heartbeat berkala selama pekerjaan berjalan.
(async () => {
  for (;;) {
    await ramonyx.sleep(100);
    await ramonyx.heartbeat();
  }
})();

await ramonyx.parent.send({ siap: generasi });
const perintah = await ramonyx.parent.receive();
if (perintah?.perintah === "hang") {
  for (;;) {} // blokir JS: heartbeat berhenti -> induk mendeteksi senyap
}
"#;

#[test]
fn plugin_health_check_restart_setelah_hang() {
    let directory = temp_dir("health");
    let marker = directory.join("generasi.txt");
    let plugin = directory.join("plugin-heartbeat.mjs");
    std::fs::write(
        &plugin,
        PLUGIN_HEARTBEAT.replace("__MARKER__", &js_literal(&marker)),
    )
    .expect("write");

    let main = directory.join("main.mjs");
    std::fs::write(
        &main,
        format!(
            r#"
const plugin = await ramonyx.spawn({plugin}, {{
  allow: {{ read: [{dir}], write: [{dir}] }},
  restart: {{ maxRestarts: 3, delayMs: 50 }},
  healthCheck: {{ deadlineMs: 700 }},
}});

const siap1 = await plugin.receive();
if (siap1?.siap !== 1) throw new Error("generasi awal harus 1: " + JSON.stringify(siap1));

await plugin.send({{ perintah: "hang" }});
// Induk menunggu; heartbeat berhenti -> deteksi senyap -> kill -> restart generasi 2.
const siap2 = await plugin.receive();
if (siap2?.siap !== 2) throw new Error("harus generasi 2 setelah hang: " + JSON.stringify(siap2));

const stats = plugin.stats();
if (stats.hangs !== 1) throw new Error("hangs harus 1: " + JSON.stringify(stats));
if (stats.restarts !== 1) throw new Error("restarts harus 1: " + JSON.stringify(stats));

await plugin.kill();
globalThis.__health_ok = true;
"#,
            plugin = js_literal(&plugin),
            dir = js_literal(&directory),
        ),
    )
    .expect("write");

    let mut engine = engine(Permissions {
        read: runtime_core::Permission::Allow(vec![directory.display().to_string()]),
        write: runtime_core::Permission::Allow(vec![directory.display().to_string()]),
        ..Default::default()
    });
    engine.execute_module(&main).expect("health check restart");
    engine
        .execute(
            "[verify]",
            "if (globalThis.__health_ok !== true) throw new Error('health gagal');",
        )
        .expect("verify");

    let _ = std::fs::remove_dir_all(&directory);
}

#[test]
fn plugin_health_check_tanpa_supervisi_berakhir_null() {
    let directory = temp_dir("health-null");
    let marker = directory.join("generasi.txt");
    let plugin = directory.join("plugin-heartbeat.mjs");
    std::fs::write(
        &plugin,
        PLUGIN_HEARTBEAT.replace("__MARKER__", &js_literal(&marker)),
    )
    .expect("write");

    let main = directory.join("main.mjs");
    std::fs::write(
        &main,
        format!(
            r#"
const plugin = await ramonyx.spawn({plugin}, {{
  allow: {{ read: [{dir}], write: [{dir}] }},
  healthCheck: {{ deadlineMs: 500 }},
}});

const siap = await plugin.receive();
if (siap?.siap !== 1) throw new Error("generasi awal harus 1: " + JSON.stringify(siap));

await plugin.send({{ perintah: "hang" }});
const akhir = await plugin.receive();
if (akhir !== null) throw new Error("harus null setelah hang tanpa supervisi: " + JSON.stringify(akhir));

const stats = plugin.stats();
if (stats.hangs !== 1) throw new Error("hangs harus 1: " + JSON.stringify(stats));
if (stats.stopped !== true) throw new Error("harus stopped: " + JSON.stringify(stats));
globalThis.__health_null_ok = true;
"#,
            plugin = js_literal(&plugin),
            dir = js_literal(&directory),
        ),
    )
    .expect("write");

    let mut engine = engine(Permissions {
        read: runtime_core::Permission::Allow(vec![directory.display().to_string()]),
        write: runtime_core::Permission::Allow(vec![directory.display().to_string()]),
        ..Default::default()
    });
    engine
        .execute_module(&main)
        .expect("health tanpa supervisi");
    engine
        .execute(
            "[verify]",
            "if (globalThis.__health_null_ok !== true) throw new Error('health null gagal');",
        )
        .expect("verify");

    let _ = std::fs::remove_dir_all(&directory);
}
