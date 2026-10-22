import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import {
  guardedFetch,
  SsrfError,
  validateFormDataUrls,
  validateRequestFormDataUrls,
} from "../src/ssrf.ts";

test("alamat privat/loopback/link-local literal ditolak sebelum fetch", async () => {
  const targets = [
    "http://127.0.0.1/",
    "http://10.0.0.1/admin",
    "http://169.254.169.254/latest/meta-data/",
    "http://192.168.1.1/",
    "http://[::1]/",
    "http://[fe80::1]/",
  ];
  for (const target of targets) {
    await assert.rejects(
      guardedFetch(target),
      (error: unknown) => error instanceof SsrfError,
      `harus menolak ${target}`,
    );
  }
});

test("hostname localhost ditolak; protokol non-http ditolak", async () => {
  await assert.rejects(guardedFetch("http://localhost:3000/"), SsrfError);
  await assert.rejects(guardedFetch("http://sub.localhost/"), SsrfError);
  await assert.rejects(guardedFetch("ftp://example.com/file"), SsrfError);
});

test("allowHosts melewati pemeriksaan alamat (untuk API internal tepercaya)", async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("ok-dari-server-lokal");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;

  try {
    const response = await guardedFetch(
      `http://127.0.0.1:${port}/`,
      {},
      { allowHosts: ["127.0.0.1"] },
    );
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "ok-dari-server-lokal");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("redirect divalidasi ulang per hop (default: tidak diikuti)", async () => {
  const server = createServer((request, response) => {
    if (request.url === "/redirect") {
      response.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" });
      response.end();
    } else {
      response.writeHead(200);
      response.end("ok");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  const allowed = { allowHosts: ["127.0.0.1"] };

  try {
    // Default maxRedirects=0: 3xx dikembalikan apa adanya, tidak diikuti.
    const manual = await guardedFetch(`http://127.0.0.1:${port}/redirect`, {}, allowed);
    assert.equal(manual.status, 302);

    // maxRedirects=2: hop berikutnya (literal metadata) harus ditolak.
    await assert.rejects(
      guardedFetch(`http://127.0.0.1:${port}/redirect`, {}, { ...allowed, maxRedirects: 2 }),
      SsrfError,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("pinning: DNS di-resolve sekali lalu alamat dipatok (tanpa resolve ulang oleh klien)", async () => {
  const lookupCalls: string[] = [];
  // Alamat publik (TEST-NET-3) — lolos validasi; koneksi diarahkan ke alamat terpin.
  await assert.rejects(
    guardedFetch(
      "http://situs-uji.test/",
      { signal: AbortSignal.timeout(1_500) },
      {
        dnsLookup: async (hostname) => {
          lookupCalls.push(hostname);
          return [{ address: "203.0.113.7", family: 4 }];
        },
      },
    ),
    (error: unknown) => !(error instanceof SsrfError),
    "validasi lolos; kegagalan terjadi di koneksi (bukan SSRF)",
  );
  assert.deepEqual(lookupCalls, ["situs-uji.test"], "resolve tepat sekali (pinning)");
});

test("pinning: hasil DNS privat tetap ditolak walau hostname terlihat publik", async () => {
  await assert.rejects(
    guardedFetch(
      "http://terlihat-publik.test/",
      {},
      {
        dnsLookup: async () => [{ address: "127.0.0.1", family: 4 }],
      },
    ),
    SsrfError,
  );
});

test("body string/URLSearchParams dikirim lewat jalur pinned (allowHosts)", async () => {
  const diterima: { body: string; contentType: string | undefined }[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      diterima.push({
        body: Buffer.concat(chunks).toString(),
        contentType: request.headers["content-type"],
      });
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("ok");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;

  try {
    const post = await guardedFetch(
      `http://localhost:${port}/kirim`,
      {
        method: "POST",
        body: JSON.stringify({ a: 1 }),
        headers: { "content-type": "application/json" },
      },
      { allowHosts: ["localhost"] },
    );
    assert.equal(post.status, 200);
    assert.equal(await post.text(), "ok");

    const form = await guardedFetch(
      `http://localhost:${port}/form`,
      { method: "POST", body: new URLSearchParams({ nama: "Rina" }) },
      { allowHosts: ["localhost"] },
    );
    assert.equal(form.status, 200);

    assert.equal(diterima[0]?.body, '{"a":1}');
    assert.equal(diterima[0]?.contentType, "application/json");
    assert.equal(diterima[1]?.body, "nama=Rina");
    assert.match(diterima[1]?.contentType ?? "", /application\/x-www-form-urlencoded/);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("FormData: URL privat ditolak, request asli tidak dikonsumsi", async () => {
  const form = new FormData();
  form.set("callback", "http://127.0.0.1/admin");
  form.set("catatan", "bukan URL");
  await assert.rejects(validateFormDataUrls(form), SsrfError);

  const request = new Request("http://test.local/kirim", { method: "POST", body: form });
  await assert.rejects(
    validateRequestFormDataUrls(request, {
      dnsLookup: async () => [{ address: "203.0.113.8", family: 4 }],
    }),
    SsrfError,
  );
  // clone() hanya membaca salinan; body request asli tetap dapat dipakai handler.
  const asli = await request.formData();
  assert.equal(asli.get("catatan"), "bukan URL");
});

test("FormData: URL publik lolos dengan DNS kustom (sekali resolve)", async () => {
  const lookups: string[] = [];
  const form = new FormData();
  form.set("target", "https://api.contoh.test/v1");
  await validateFormDataUrls(form, {
    dnsLookup: async (hostname) => {
      lookups.push(hostname);
      return [{ address: "203.0.113.9", family: 4 }];
    },
  });
  assert.deepEqual(lookups, ["api.contoh.test"]);
});

test("FormData body: multipart terkirim ke pinned fetch (text + file)", async () => {
  const diterima: { body: string; contentType: string | undefined }[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      diterima.push({
        body: Buffer.concat(chunks).toString(),
        contentType: request.headers["content-type"],
      });
      response.writeHead(200);
      response.end("ok");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  try {
    const form = new FormData();
    form.set("nama", "Rina");
    form.set("berkas", new File(["isi-berkas"], "catatan.txt", { type: "text/plain" }));
    const response = await guardedFetch(
      `http://127.0.0.1:${port}/unggah`,
      { method: "POST", body: form },
      { allowHosts: ["127.0.0.1"] },
    );
    assert.equal(response.status, 200);
    const sent = diterima[0];
    assert.match(sent?.contentType ?? "", /^multipart\/form-data; boundary=/);
    assert.match(sent?.body ?? "", /name="nama"\r\n\r\nRina/);
    assert.match(sent?.body ?? "", /filename="catatan.txt"/);
    assert.match(sent?.body ?? "", /isi-berkas/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
