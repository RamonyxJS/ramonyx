import type { ReactElement } from "react";
import { createLink } from "../src/link.ts";

const Link = createLink<{
  "/": undefined;
  "/users/[id]": { id: string };
}>();

const statis: ReactElement = <Link href="/">Beranda</Link>;
const dinamis: ReactElement = (
  <Link href="/users/[id]" params={{ id: "42" }}>
    Rina
  </Link>
);

// @ts-expect-error rute tidak ada di manifest
const salahRute: ReactElement = <Link href="/tidak-ada">Salah</Link>;
// @ts-expect-error params dinamis wajib
const paramsHilang: ReactElement = <Link href="/users/[id]">Tanpa params</Link>;
// @ts-expect-error params statis tidak boleh
const paramsStatis: ReactElement = (
  <Link href="/" params={{ id: "1" }}>
    Salah
  </Link>
);

void statis;
void dinamis;
void salahRute;
void paramsHilang;
void paramsStatis;
