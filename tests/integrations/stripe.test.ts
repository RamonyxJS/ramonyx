// Integrasi Stripe (contoh resmi).
//
// Test membuat Checkout Session lewat SDK asli terhadap server HTTP lokal, lalu memverifikasi
// webhook dengan signature asli di route Ramonyx. Tidak ada request ke Stripe/network publik.

import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { createHandler } from "@ramonyx/server";
import { route } from "ramonyx";
import Stripe from "stripe";

const WEBHOOK_SECRET = "whsec_ramonyx_integration_test";

test("Stripe: Checkout Session dan verifikasi webhook", async () => {
  let capturedBody = "";
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) {
      body += String(chunk);
    }
    if (request.url === "/v1/checkout/sessions" && request.method === "POST") {
      capturedBody = body;
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          id: "cs_test_123",
          object: "checkout.session",
          url: "https://checkout.stripe.test/cs_test_123",
        }),
      );
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: { message: "not found" } }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address !== null && typeof address === "object");

  try {
    const stripe = new Stripe("sk_test_ramonyx", {
      host: "127.0.0.1",
      port: address.port,
      protocol: "http",
      maxNetworkRetries: 0,
      telemetry: false,
    });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: "price_ramonyx_pro", quantity: 1 }],
      success_url: "http://localhost:3000/billing/success",
      cancel_url: "http://localhost:3000/billing/cancel",
    });
    assert.equal(session.id, "cs_test_123");
    assert.equal(session.url, "https://checkout.stripe.test/cs_test_123");

    const form = new URLSearchParams(capturedBody);
    assert.equal(form.get("mode"), "payment");
    assert.equal(form.get("line_items[0][price]"), "price_ramonyx_pro");
    assert.equal(form.get("line_items[0][quantity]"), "1");

    const webhook = createHandler({
      routes: [
        {
          method: "POST",
          path: "/api/stripe/webhook",
          definition: route({
            handler: async ({ request, json }) => {
              const signature = request.headers.get("stripe-signature");
              if (signature === null) {
                return json({ error: "missing signature" }, 400);
              }
              const payload = await request.text();
              try {
                const event = stripe.webhooks.constructEvent(payload, signature, WEBHOOK_SECRET);
                return json({ received: event.type });
              } catch {
                return json({ error: "invalid signature" }, 400);
              }
            },
          }),
        },
      ],
    });

    const eventPayload = JSON.stringify({
      id: "evt_test_123",
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_123",
          object: "checkout.session",
          payment_status: "paid",
        },
      },
    });
    const signature = stripe.webhooks.generateTestHeaderString({
      payload: eventPayload,
      secret: WEBHOOK_SECRET,
    });
    const valid = await webhook(
      new Request("http://test.local/api/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": signature, "content-type": "application/json" },
        body: eventPayload,
      }),
    );
    assert.equal(valid.status, 200);
    assert.deepEqual(await valid.json(), { received: "checkout.session.completed" });

    const tampered = await webhook(
      new Request("http://test.local/api/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": signature, "content-type": "application/json" },
        body: eventPayload.replace("cs_test_123", "cs_test_tampered"),
      }),
    );
    assert.equal(tampered.status, 400);
    assert.deepEqual(await tampered.json(), { error: "invalid signature" });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
