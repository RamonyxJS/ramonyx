/**
 * Type test (dijalankan `tsc`, bukan `node --test`):
 * context handler harus terinferensi dari schema Standard Schema.
 */
import type { StandardSchema } from "@ramonyx/schema";
import { route } from "../src/index.ts";

declare const idSchema: StandardSchema<unknown, { id: string }>;
declare const echoBodySchema: StandardSchema<unknown, { message: string }>;

export const definition = route({
  params: idSchema,
  body: echoBodySchema,
  async handler(context) {
    const id: string = context.params.id;
    const message: string = context.body.message;
    const result = context.json({ id, message });
    return result;
  },
});
