---
recipe: email-resend-postmark
title: Send transactional email with Resend or Postmark
summary: Keep the provider behind a small server-only interface, read API keys from bindings, and send from a route or action.
when: The app needs verification, reset, receipt, or notification email and should not hard-code one provider in route code.
files: src/email.server.ts, src/routes/api/contact.ts, wrangler.toml
verify: pnpm test
---

# Send transactional email with Resend or Postmark

Email delivery is an external side effect. Keep the provider behind a tiny interface so route code
does not depend on one SDK, and keep API keys on the server.

## Install

```bash
pnpm add resend postmark
```

## Provider adapter

```ts
// src/email.server.ts — server-only
import type { EnvReader } from "ramonyx";
import { Models, ServerClient } from "postmark";
import { Resend } from "resend";

export interface EmailMessage {
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<{ id: string }>;
}

export function resendProvider(env: EnvReader): EmailProvider {
  const key = env.get("RESEND_API_KEY");
  if (key === undefined) throw new Error("RESEND_API_KEY belum diatur");

  const client = new Resend(key);
  return {
    async send(message) {
      const { data, error } = await client.emails.send(message);
      if (error !== null) {
        throw new Error(`Resend gagal: ${error.message}`);
      }
      return { id: data.id };
    },
  };
}

export function postmarkProvider(env: EnvReader): EmailProvider {
  const token = env.get("POSTMARK_SERVER_TOKEN");
  if (token === undefined) throw new Error("POSTMARK_SERVER_TOKEN belum diatur");

  const client = new ServerClient(
    token,
    new Models.ClientOptions.Configuration(true, "api.postmarkapp.com"),
  );
  const stream = env.get("POSTMARK_MESSAGE_STREAM") ?? "outbound";
  return {
    async send(message) {
      const result = await client.sendEmail({
        From: message.from,
        To: message.to,
        Subject: message.subject,
        HtmlBody: message.html,
        TextBody: message.text,
        MessageStream: stream,
      });
      if (result.ErrorCode !== 0) {
        throw new Error(`Postmark gagal: ${result.Message}`);
      }
      return { id: result.MessageID };
    },
  };
}
```

`POSTMARK_MESSAGE_STREAM` is configuration, not a secret. Both API keys are secrets: use
`wrangler secret put RESEND_API_KEY` / `wrangler secret put POSTMARK_SERVER_TOKEN`, or the equivalent
secret store on your host. Never import this module from client code.

## Send from a route

```ts
// src/routes/api/contact.ts
import { HttpError, route } from "ramonyx";
import { postmarkProvider, resendProvider } from "../../email.server.ts";

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char,
  );
}

export const POST = route({
  handler: async ({ env, request, json }) => {
    const body = (await request.json()) as { to?: unknown; subject?: unknown; text?: unknown };
    const to = String(body.to ?? "").trim();
    const subject = String(body.subject ?? "").trim();
    const text = String(body.text ?? "").trim();
    if (to === "" || subject === "" || text === "") {
      return json({ error: "to, subject, dan text wajib" }, 400);
    }

    const provider =
      env.get("EMAIL_PROVIDER") === "postmark" ? postmarkProvider(env) : resendProvider(env);

    try {
      const sent = await provider.send({
        from: env.get("EMAIL_FROM") ?? "Ramonyx <no-reply@example.test>",
        to,
        subject,
        text,
        html: `<p>${escapeHtml(text)}</p>`,
      });
      return json({ ok: true, id: sent.id });
    } catch (error) {
      // Jangan bocorkan detail provider/API ke klien. Log internal, kirim pesan generik.
      throw new HttpError(502, "Email gagal dikirim", { cause: error });
    }
  },
});
```

`escapeHtml` must escape `& < > " '` before interpolating user text into HTML. Better still, use a
template file with explicit escaping.

## Verify

```bash
pnpm test -- tests/integrations/email.test.ts
ramonyx check --json
```

The executable example [`tests/integrations/email.test.ts`](../../../tests/integrations/email.test.ts)
runs a local HTTP server and points both real SDKs at it:

- Resend: `new Resend(key, { baseUrl })`, then asserts the `Authorization` header and payload.
- Postmark: `new ServerClient(token, new Models.ClientOptions.Configuration(false, host))`, then
  asserts the `X-Postmark-Server-Token` header and payload.

No email or external network request is made.

## Deployment notes

- **Sender identity:** verify the sending domain in Resend (DNS) or the sender signature/domain in
  Postmark before production. `From` must match the verified identity.
- **Bindings:** on Cloudflare use `wrangler secret put`; on Node use environment variables or your
  secret manager. `EMAIL_PROVIDER` and `EMAIL_FROM` can be plain vars.
- **Node vs edge:** both SDKs are now fetch-based, but they are published as Node packages. If you
  target Workers/edge, run a bundle smoke test; if the SDK pulls unsupported code, call the provider
  HTTP endpoint with `fetch` instead of changing the rest of the adapter.
- **Failure policy:** a provider timeout is not proof that no email was sent. Do not blindly retry
  non-idempotent sends; record an outbox/idempotency key if duplicates matter.
- **Do not block critical paths:** for large volumes, enqueue the send and return `202`; this
  recipe awaits the provider so errors are visible to the caller.
- **Bounces/complaints:** this recipe only sends. Subscribe to provider webhooks, verify signatures,
  and suppress recipients in your own store.

## Limits

- Postmark requires a message stream; the default `outbound` must exist in your server.
- Sending HTML from user input without escaping is an injection risk. Use React email/templates or
  an explicit escaper.
- API keys in client bundles or logs are leaked credentials. Keep `email.server.ts` server-only and
  never log request headers/API keys.
- This does not implement outbox, retries, rate limiting, or unsubscribe management.
