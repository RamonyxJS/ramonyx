// Contract test store (ADR-0065): implementasi default in-memory harus lolos suite kontrak.
// Implementasi eksternal (redis dll.) menambah baris `runStoreContract("redis", ...)` di sini.
import { createMemoryStore } from "@ramonyx/core";
import { runStoreContract } from "./store.contract.ts";

runStoreContract("memory", () => createMemoryStore());
