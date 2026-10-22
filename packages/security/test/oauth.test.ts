import assert from "node:assert/strict";
import { test } from "node:test";

import { createMemoryStore } from "@ramonyx/core";
import {
  createMemoryUserStore,
  createOAuthAccountLinker,
  createOAuthClient,
} from "../src/index.ts";

function fakeProvider(): {
  fetch: typeof fetch;
  calls: Array<{ url: string; init?: RequestInit }>;
} {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, ...(init === undefined ? {} : { init }) });
    if (url.endsWith("/token")) {
      return new Response(
        JSON.stringify({
          access_token: "access-1",
          token_type: "Bearer",
          refresh_token: "refresh-1",
          expires_in: 3600,
          id_token: "id-token-1",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.endsWith("/userinfo")) {
      return new Response(JSON.stringify({ sub: "subject-1", email: "rina@example.test" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("not found", { status: 404 });
  };
  return { fetch: fetchImpl, calls };
}

test("OAuth: authorize URL has PKCE/state/nonce; exchange + userinfo", async () => {
  const fake = fakeProvider();
  const client = createOAuthClient(
    {
      clientId: "client-1",
      clientSecret: "secret-1",
      authorizationEndpoint: "https://provider.test/authorize",
      tokenEndpoint: "https://provider.test/token",
      userInfoEndpoint: "https://provider.test/userinfo",
      redirectUri: "https://app.test/callback",
      scopes: ["openid", "email"],
    },
    { fetch: fake.fetch },
  );

  const authorization = await client.authorize({ state: "state-1" });
  const url = new URL(authorization.url);
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("client_id"), "client-1");
  assert.equal(url.searchParams.get("redirect_uri"), "https://app.test/callback");
  assert.equal(url.searchParams.get("state"), "state-1");
  assert.equal(url.searchParams.get("scope"), "openid email");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.ok(authorization.nonce.length > 10);
  assert.ok(authorization.codeChallenge.length >= 43);
  assert.ok(authorization.codeVerifier.length >= 43);

  const tokens = await client.exchange("code-1", authorization.codeVerifier);
  assert.equal(tokens.accessToken, "access-1");
  assert.equal(tokens.refreshToken, "refresh-1");
  assert.equal(tokens.expiresIn, 3600);
  const tokenCall = fake.calls.find((call) => call.url.endsWith("/token"));
  assert.ok(tokenCall?.init?.body instanceof URLSearchParams);
  assert.equal(tokenCall.init.body.get("grant_type"), "authorization_code");
  assert.equal(tokenCall.init.body.get("code"), "code-1");
  assert.equal(tokenCall.init.body.get("code_verifier"), authorization.codeVerifier);
  assert.equal(tokenCall.init.body.get("client_secret"), "secret-1");

  const profile = await client.userInfo(tokens);
  assert.equal(profile.email, "rina@example.test");
  const infoCall = fake.calls.find((call) => call.url.endsWith("/userinfo"));
  assert.equal(new Headers(infoCall?.init?.headers).get("authorization"), "Bearer access-1");
});

test("OAuth account linking: verified email links, unverified email does not", async () => {
  const store = createMemoryStore();
  const users = createMemoryUserStore();
  const linker = createOAuthAccountLinker({ store, users });

  const first = await linker.link({
    provider: "github",
    subject: "123",
    email: "rina@example.test",
    emailVerified: true,
    username: "rina",
  });
  assert.equal(first.username, "rina");
  assert.equal(first.emailVerified, true);
  assert.equal((await users.getByEmail("rina@example.test"))?.id, first.id);

  const again = await linker.link({ provider: "github", subject: "123" });
  assert.equal(again.id, first.id, "subject yang sama memakai akun yang sama");
  assert.equal(await linker.unlink({ provider: "github", subject: "123" }), true);
  assert.equal(await linker.unlink({ provider: "github", subject: "123" }), false);

  const unverified = await linker.link({
    provider: "other",
    subject: "456",
    email: "rina@example.test",
    emailVerified: false,
    username: "rina",
  });
  assert.notEqual(unverified.id, first.id);
  assert.equal(unverified.email, undefined, "email belum verified tidak disimpan");
  assert.equal((await users.getByEmail("rina@example.test"))?.id, first.id);
});
