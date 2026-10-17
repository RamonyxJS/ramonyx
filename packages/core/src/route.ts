import type { RouteDefinition } from "./types.ts";

/**
 * Identitas + inferensi tipe untuk definisi route.
 * Nilai dikembalikan apa adanya; kegunaannya adalah tipe context yang terinferensi dari schema.
 */
export function route<P = unknown, Q = unknown, B = unknown, O = unknown>(
  definition: RouteDefinition<P, Q, B, O>,
): RouteDefinition<P, Q, B, O> {
  return definition;
}
