// Contract test untuk `KeyValueStore` (ADR-0065) — SETIAP implementasi (memory, redis, dll.)
// wajib lolos suite yang sama. Dipakai `tests/contracts/store.test.ts`.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { KeyValueStore } from "@ramonyx/core";

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function runStoreContract(name: string, createStore: () => KeyValueStore): void {
  test(`[${name}] get/set/delete dasar`, async () => {
    const store = createStore();
    assert.equal(await store.get("a"), undefined);
    await store.set("a", { angka: 1 });
    assert.deepEqual((await store.get("a"))?.value, { angka: 1 });
    assert.equal((await store.get("a"))?.expiresAt, null);
    await store.delete("a");
    assert.equal(await store.get("a"), undefined);
  });

  test(`[${name}] TTL: kedaluwarsa hilang dari get`, async () => {
    const store = createStore();
    // TTL longgar (0.3 dtk) agar tidak flaky di mesin yang sibuk; tetap jauh lebih pendek dari sleep.
    await store.set("pendek", "nilai", { ttlSeconds: 0.3 });
    assert.equal((await store.get("pendek"))?.value, "nilai");
    await sleep(400);
    assert.equal(await store.get("pendek"), undefined, "entri kedaluwarsa → undefined");
  });

  test(`[${name}] set ulang menimpa nilai + TTL lama tidak bocor`, async () => {
    const store = createStore();
    await store.set("k", "lama", { ttlSeconds: 0.3 });
    await store.set("k", "baru");
    await sleep(400);
    assert.equal((await store.get("k"))?.value, "baru", "TTL lama tidak membunuh nilai baru");
  });

  test(`[${name}] invalidateTags menghapus entri bertag & mengembalikan jumlah`, async () => {
    const store = createStore();
    await store.set("p1", 1, { tags: ["produk"] });
    await store.set("p2", 2, { tags: ["produk", "promo"] });
    await store.set("lain", 3, { tags: ["lain"] });

    assert.equal(await store.invalidateTags(["produk"]), 2);
    assert.equal(await store.get("p1"), undefined);
    assert.equal(await store.get("p2"), undefined);
    assert.equal((await store.get("lain"))?.value, 3, "entri tanpa tag terkait tetap ada");
    assert.equal(await store.invalidateTags(["produk"]), 0, "invalidasi kedua = 0");
  });

  test(`[${name}] set ulang memindahkan tag lama (tidak ada tag hantu)`, async () => {
    const store = createStore();
    await store.set("k", 1, { tags: ["lama"] });
    await store.set("k", 2, { tags: ["baru"] });
    assert.equal(await store.invalidateTags(["lama"]), 0, "tag lama sudah tidak menunjuk k");
    assert.equal((await store.get("k"))?.value, 2);
    assert.equal(await store.invalidateTags(["baru"]), 1);
  });

  test(`[${name}] increment (opsional): fixed window`, async () => {
    const store = createStore();
    if (store.increment === undefined) {
      return; // implementasi tanpa increment → dilewati (fitur memeriksa undefined)
    }
    assert.equal(await store.increment("klien", { windowSeconds: 1 }), 1);
    assert.equal(await store.increment("klien", { windowSeconds: 1 }), 2);
    await sleep(1100);
    assert.equal(await store.increment("klien", { windowSeconds: 1 }), 1, "window baru → reset");
  });

  test(`[${name}] take (opsional): ambil-lalu-hapus atomik + TTL`, async () => {
    const store = createStore();
    if (store.take === undefined) {
      return;
    }
    await store.set("token", { user: "u1" });
    assert.deepEqual(await store.take("token"), { user: "u1" });
    assert.equal(await store.get("token"), undefined, "take menghapus entri");
    await store.set("token", "nilai", { ttlSeconds: 0.3 });
    await sleep(400);
    assert.equal(await store.take("token"), undefined, "entri kedaluwarsa tidak diambil");
  });
}
