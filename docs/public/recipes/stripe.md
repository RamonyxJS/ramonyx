---
recipe: stripe
title: Add Stripe Checkout and webhooks
summary: Create Checkout Sessions from a server route and verify Stripe webhooks before changing entitlements.
when: The app needs hosted payments or subscriptions without handling card data itself.
files: src/stripe.server.ts, src/routes/api/billing/checkout.ts, src/routes/api/stripe/webhook.ts
verify: pnpm test
---

# Add Stripe Checkout and webhooks

Stripe Checkout keeps card data off your server. The application creates a Checkout Session, then
changes entitlements only after a **verified webhook** says payment succeeded.

## Install

```bash
pnpm add stripe
```

The Node SDK requires Node ≥20. For a Worker/edge target, use the SDK's fetch HTTP client or verify
that your bundler resolves its worker export; test the built artifact before deploying.

## Client

```ts
// src/stripe.server.ts — server-only
import type { EnvReader } from "ramonyx";
import Stripe from "stripe";

export function stripeFor(env: EnvReader): Stripe {
  const key = env.get("STRIPE_SECRET_KEY");
  if (key === undefined) throw new Error("STRIPE_SECRET_KEY belum diatur");
  return new Stripe(key, {
    maxNetworkRetries: 2,
    appInfo: { name: "my-ramonyx-app" },
  });
}
```

Never expose `STRIPE_SECRET_KEY` or the webhook secret to client code. Use test-mode keys locally and
`wrangler secret put` / your host's secret store in production.

## Create a Checkout Session

```ts
// src/routes/api/billing/checkout.ts
import { HttpError, route } from "ramonyx";
import { stripeFor } from "../../../stripe.server.ts";

export const POST = route({
  handler: async ({ env, json, request }) => {
    // Authenticate first: never create a billable session for an anonymous request.
    const user = await requireUser(request);
    const priceId = env.get("STRIPE_PRICE_ID");
    const appOrigin = env.get("APP_ORIGIN");
    if (priceId === undefined || appOrigin === undefined) {
      throw new HttpError(500, "Billing belum dikonfigurasi");
    }

    const stripe = stripeFor(env);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: user.email,
      client_reference_id: user.id,
      metadata: { userId: user.id },
      success_url: `${appOrigin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appOrigin}/billing/cancel`,
    });
    if (session.url === null) {
      throw new HttpError(502, "Checkout tidak tersedia");
    }
    return json({ url: session.url });
  },
});
```

`requireUser`, `user.id`, and `user.email` are application code (session auth, Better Auth, or
another provider). The important boundary is server-side: the client sends **no price or amount**.
Use a Price ID from configuration, not a number from the request body.

## Receive webhooks

```ts
// src/routes/api/stripe/webhook.ts
import { HttpError, route } from "ramonyx";
import { stripeFor } from "../../../stripe.server.ts";

export const POST = route({
  handler: async ({ env, json, request }) => {
    const signature = request.headers.get("stripe-signature");
    const secret = env.get("STRIPE_WEBHOOK_SECRET");
    if (signature === null || secret === undefined) {
      return json({ error: "missing signature" }, 400);
    }

    // Raw bytes/string are required; do not JSON.parse before verification.
    const payload = await request.text();
    let event: import("stripe").Stripe.Event;
    try {
      event = stripeFor(env).webhooks.constructEvent(payload, signature, secret);
    } catch {
      return json({ error: "invalid signature" }, 400);
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        // Idempotent write: event.id is stable across retries.
        await applyCheckoutSession(event.id, session);
        break;
      }
      case "customer.subscription.deleted": {
        await revokeEntitlement(event.id, event.data.object);
        break;
      }
      default:
        break;
    }

    return json({ received: true });
  },
});
```

`applyCheckoutSession` and `revokeEntitlement` are your database writes. Use `event.id` as a
deduplication key (or an upsert), because Stripe retries deliveries and does not guarantee ordering.
Return 2xx only after the durable write; otherwise Stripe will retry.

`constructEvent` uses Node crypto. On a non-Node/edge runtime use `await constructEventAsync(...)`
and verify the bundled SDK path.

## Verify

```bash
pnpm test -- tests/integrations/stripe.test.ts
ramonyx check --json
```

The executable example [`tests/integrations/stripe.test.ts`](../../../tests/integrations/stripe.test.ts):

- points the real Stripe SDK at a local HTTP server with `host`/`port`/`protocol`
- asserts the Checkout Session form payload (`line_items[0][price]`, mode, URLs)
- signs a webhook with `stripe.webhooks.generateTestHeaderString`
- verifies a valid event through a real Ramonyx route
- rejects the same payload after tampering

No Stripe account, API key, or public network request is required.

For a real end-to-end check, use test-mode keys, `stripe listen --forward-to
localhost:3000/api/stripe/webhook`, and Stripe's test cards. Never use live keys in automated tests.

## Security and deployment notes

- **Raw body:** the webhook route must receive the exact bytes Stripe signed. Do not add a body
  schema or a global parser that consumes it first. If global CSRF middleware is enabled, exclude
  the webhook path and authenticate it with the Stripe signature instead.
- **Price authority:** never accept `amount`, `currency`, or an arbitrary `price` from the client.
  Resolve the authenticated user's plan on the server.
- **URLs:** build `success_url`/`cancel_url` from configured `APP_ORIGIN`, not the untrusted Host
  header.
- **Secrets:** keep `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in bindings; rotate them if
  exposed. `STRIPE_PRICE_ID` is not secret.
- **Webhook availability:** the endpoint must be public HTTPS. Stripe retries failed deliveries;
  make handlers idempotent and fast. Move slow email/provisioning work to a queue.
- **Test/live separation:** use separate keys, price IDs, and webhook secrets per environment.
- **Scope:** this recipe creates Checkout Sessions and handles two events. Customer Portal,
  subscription upgrades/proration, invoices, tax, refunds, and dispute handling remain application
  work.
