import { route } from "ramonyx";

/** Demo env/binding (ADR-0068): `get` untuk string, `getRaw` untuk binding apa adanya. */
export const GET = route({
  handler: ({ env, json }) =>
    json({
      rahasia: env.get("RAHASIA") ?? null,
      kv: env.getRaw?.("KV") ?? null,
    }),
});
