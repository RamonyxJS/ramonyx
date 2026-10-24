// Integrasi email (contoh resmi): Resend dan Postmark.
//
// Test menjalankan server HTTP lokal yang meniru endpoint kedua provider, sehingga tidak ada
// email/network nyata. SDK asli tetap dipakai: Resend memakai `baseUrl`, Postmark memakai
// `requestHost` + `useHttps: false`.

import assert from "node:assert/strict";
import { createServer, type IncomingHttpHeaders } from "node:http";
import { test } from "node:test";
import { Models, ServerClient } from "postmark";
import { Resend } from "resend";

interface CapturedRequest {
  readonly path: string;
  readonly method: string;
  readonly headers: IncomingHttpHeaders;
  readonly body: string;
}

test("Resend + Postmark: kirim email lewat endpoint HTTP yang kompatibel", async () => {
  const captured: CapturedRequest[] = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) {
      body += String(chunk);
    }
    const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    captured.push({
      path,
      method: request.method ?? "GET",
      headers: request.headers,
      body,
    });

    response.setHeader("content-type", "application/json");
    if (path === "/emails") {
      response.end(JSON.stringify({ id: "email_test_123" }));
      return;
    }
    if (path === "/email") {
      response.end(JSON.stringify({ ErrorCode: 0, Message: "OK", MessageID: "postmark_test_123" }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ message: "not found" }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address !== null && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const resend = new Resend("re_test_key", { baseUrl });
    const resendResult = await resend.emails.send({
      from: "Ramonyx <halo@example.test>",
      to: "rina@example.test",
      subject: "Halo dari Ramonyx",
      html: "<p>Halo, Rina.</p>",
      text: "Halo, Rina.",
    });
    assert.equal(resendResult.error, null);
    assert.equal(resendResult.data?.id, "email_test_123");

    const resendRequest = captured.find((entry) => entry.path === "/emails");
    assert.ok(resendRequest !== undefined);
    assert.equal(resendRequest.method, "POST");
    assert.equal(resendRequest.headers.authorization, "Bearer re_test_key");
    assert.deepEqual(JSON.parse(resendRequest.body), {
      from: "Ramonyx <halo@example.test>",
      to: "rina@example.test",
      subject: "Halo dari Ramonyx",
      html: "<p>Halo, Rina.</p>",
      text: "Halo, Rina.",
    });

    const postmark = new ServerClient(
      "pm_test_token",
      new Models.ClientOptions.Configuration(false, `127.0.0.1:${address.port}`),
    );
    const postmarkResult = await postmark.sendEmail({
      From: "Ramonyx <halo@example.test>",
      To: "rina@example.test",
      Subject: "Halo dari Ramonyx",
      HtmlBody: "<p>Halo, Rina.</p>",
      TextBody: "Halo, Rina.",
      MessageStream: "outbound",
    });
    assert.equal(postmarkResult.MessageID, "postmark_test_123");
    assert.equal(postmarkResult.ErrorCode, 0);

    const postmarkRequest = captured.find((entry) => entry.path === "/email");
    assert.ok(postmarkRequest !== undefined);
    assert.equal(postmarkRequest.method, "POST");
    assert.equal(postmarkRequest.headers["x-postmark-server-token"], "pm_test_token");
    assert.deepEqual(JSON.parse(postmarkRequest.body), {
      From: "Ramonyx <halo@example.test>",
      To: "rina@example.test",
      Subject: "Halo dari Ramonyx",
      HtmlBody: "<p>Halo, Rina.</p>",
      TextBody: "Halo, Rina.",
      MessageStream: "outbound",
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
