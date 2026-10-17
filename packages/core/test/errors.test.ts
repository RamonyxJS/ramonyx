import assert from "node:assert/strict";
import { test } from "node:test";
import { HttpError } from "../src/index.ts";

test("4xx terbuka secara default", async () => {
  const error = new HttpError(404, "Not Found");
  assert.equal(error.expose, true);

  const response = error.toResponse();
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Not Found" });
});

test("5xx tertutup: body generik, pesan asli tidak bocor", async () => {
  const error = new HttpError(500, "koneksi database gagal");
  assert.equal(error.expose, false);

  const body = await error.toResponse().json();
  assert.deepEqual(body, { error: "Internal Server Error" });
});

test("expose eksplisit untuk 5xx + details", async () => {
  const error = new HttpError(503, "Maintenance", {
    expose: true,
    details: { retryAfterSeconds: 60 },
  });
  const body = await error.toResponse().json();
  assert.deepEqual(body, {
    error: "Maintenance",
    details: { retryAfterSeconds: 60 },
  });
});

test("cause diteruskan ke Error", () => {
  const cause = new Error("penyebab");
  const error = new HttpError(500, "gagal", { cause });
  assert.equal(error.cause, cause);
});
