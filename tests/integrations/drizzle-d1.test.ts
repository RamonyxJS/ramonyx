// Integrasi Drizzle + Cloudflare D1 (contoh resmi).
//
// D1 asli hanya tersedia sebagai binding Cloudflare. Untuk test lokal kita memakai
// node:sqlite sebagai shim D1-compatible: bentuk `prepare().bind().all()/raw()/run()`
// sama dengan D1, sehingga adapter Drizzle yang diuji adalah adapter D1 yang sebenarnya.

import assert from "node:assert/strict";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const notes = sqliteTable("notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  text: text("text").notNull(),
});

interface D1Result<T> {
  readonly results: T[];
  readonly success: true;
  readonly meta: Record<string, unknown>;
}

class SqliteStatement {
  #params: unknown[] = [];
  readonly #db: DatabaseSync;
  readonly #sql: string;

  constructor(db: DatabaseSync, sql: string) {
    this.#db = db;
    this.#sql = sql;
  }

  bind(...params: unknown[]): this {
    this.#params = params;
    return this;
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const results = this.#db.prepare(this.#sql).all(...(this.#params as SQLInputValue[])) as T[];
    return { results, success: true, meta: {} };
  }

  async raw<T = unknown[]>(): Promise<T[]> {
    const rows = this.#db.prepare(this.#sql).all(...(this.#params as SQLInputValue[])) as Record<
      string,
      unknown
    >[];
    return rows.map((row) => Object.values(row) as T);
  }

  async run(): Promise<D1Result<never>> {
    const result = this.#db.prepare(this.#sql).run(...(this.#params as SQLInputValue[]));
    return {
      results: [],
      success: true,
      meta: { changes: result.changes, last_row_id: Number(result.lastInsertRowid) },
    };
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const row = this.#db.prepare(this.#sql).get(...(this.#params as SQLInputValue[])) as
      | T
      | undefined;
    return row ?? null;
  }
}

class SqliteD1 {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  prepare(sql: string): SqliteStatement {
    return new SqliteStatement(this.#db, sql);
  }

  async batch(
    statements: readonly SqliteStatement[],
  ): Promise<D1Result<Record<string, unknown>>[]> {
    return Promise.all(statements.map((statement) => statement.all()));
  }

  async exec(sql: string): Promise<{ count: number; duration: number }> {
    this.#db.exec(sql);
    return { count: 0, duration: 0 };
  }
}

test("Drizzle D1: insert, select, update, delete", async () => {
  const sqlite = new DatabaseSync(":memory:");
  const client = new SqliteD1(sqlite);
  sqlite.exec(`
    CREATE TABLE notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL
    );
  `);
  const db = drizzle(client as never, { schema: { notes } });

  try {
    await db.insert(notes).values({ text: "hello" }).run();
    const inserted = await db.select().from(notes).where(eq(notes.text, "hello")).all();
    assert.deepEqual(inserted, [{ id: 1, text: "hello" }]);

    await db.update(notes).set({ text: "updated" }).where(eq(notes.id, 1)).run();
    const updated = await db.select().from(notes).where(eq(notes.id, 1)).all();
    assert.deepEqual(updated, [{ id: 1, text: "updated" }]);

    await db.delete(notes).where(eq(notes.id, 1)).run();
    assert.deepEqual(await db.select().from(notes).all(), []);
  } finally {
    sqlite.close();
  }
});
