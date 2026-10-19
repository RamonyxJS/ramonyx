// Helper href runtime (ADR-0073). Tipe ketat diberikan oleh modul generate
// `.ramonyx/routes.ts` (dibuat `ramonyx build|dev`) yang membungkus `fillHref`.

import { fillRouteParams } from "@ramonyx/core";

/**
 * Isi pola rute dengan params: `fillHref("/users/[id]", { id: "42" })` → `/users/42`.
 * Melempar bila ada param kurang (pemanggil bertipe seharusnya sudah mencegahnya saat typecheck).
 */
export function fillHref(pattern: string, params?: Record<string, string>): string {
  const filled = fillRouteParams(pattern, params ?? {});
  if (filled === null) {
    throw new Error(
      `fillHref: param kurang untuk "${pattern}" (diberikan ${JSON.stringify(params ?? {})}).`,
    );
  }
  return filled;
}
