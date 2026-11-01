import mysql from "mysql2/promise";
import type { Pool, PoolConnection, ResultSetHeader } from "mysql2/promise";

/**
 * MySQL / MariaDB access (server only).
 * Configure with DATABASE_URL, e.g. mysql://dmojo:dmojo@localhost:3306/dmojo
 *
 *   sql`SELECT …`     -> rows (array of plain objects)
 *   exec`INSERT …`    -> { affectedRows, insertId }   (affectedRows counts *matched* rows)
 *   transaction(tx => { tx.sql`…`; tx.exec`…` })
 *
 * Values interpolated with ${} are always sent as bound parameters (never concatenated).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

type Runner = { query: (text: string, params: unknown[]) => Promise<[unknown, unknown]> };

function tags(run: Runner) {
  const prep = (strings: TemplateStringsArray, values: unknown[]) => ({
    text: strings.join("?"),
    params: values.map((v) => (v === undefined ? null : v)),
  });
  return {
    sql: async <T = Row[]>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T> => {
      const { text, params } = prep(strings, values);
      const [rows] = await run.query(text, params);
      return rows as T;
    },
    exec: async (strings: TemplateStringsArray, ...values: unknown[]): Promise<ResultSetHeader> => {
      const { text, params } = prep(strings, values);
      const [header] = await run.query(text, params);
      return header as ResultSetHeader;
    },
  };
}

export type Tx = ReturnType<typeof tags>;

// Plain strings for the UI: booleans for TINYINT(1), ISO text for DATETIME, "yyyy-mm-dd" for DATE.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function typeCast(field: any, next: () => unknown) {
  switch (field.type) {
    case "TINY":
      if (field.length === 1) {
        const s = field.string();
        return s === null ? null : s !== "0";
      }
      break;
    case "DATETIME":
    case "TIMESTAMP": {
      const s = field.string();
      return s === null ? null : new Date(`${s.replace(" ", "T")}Z`).toISOString();
    }
    case "DATE":
    case "NEWDATE":
      return field.string();
  }
  return next();
}

function createPool(): Pool {
  const raw = process.env["DATABASE_URL"];
  if (!raw) throw new Error("DATABASE_URL is not set. Copy .env.example to .env and start the database.");
  const u = new URL(raw);
  const pool = mysql.createPool({
    host: u.hostname,
    port: u.port ? Number(u.port) : 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
    charset: "UTF8MB4_UNICODE_CI",
    connectionLimit: Number(process.env["DATABASE_POOL_MAX"] ?? 10),
    waitForConnections: true,
    flags: ["+FOUND_ROWS"],
    timezone: "Z",
    typeCast,
    ...(process.env["DATABASE_SSL"] === "true" ? { ssl: { rejectUnauthorized: true } } : {}),
  });
  // Store and compare every timestamp in UTC regardless of the server's own time zone.
  (pool as unknown as { on: (e: string, f: (c: { query: (q: string) => void }) => void) => void }).on(
    "connection",
    (c) => c.query("SET time_zone = '+00:00'"),
  );
  return pool;
}

const g = globalThis as unknown as { __dmojoPool?: Pool };
// Cached on globalThis so dev-server reloads don't leak pools. mysql2 connects lazily.
const pool: Pool = (g.__dmojoPool ??= createPool());

export const { sql, exec } = tags(pool as unknown as Runner);

/** Runs `fn` in a transaction (commit on success, rollback on error). `lock` serialises callers by name. */
export async function transaction<T>(fn: (tx: Tx) => Promise<T>, opts: { lock?: string } = {}): Promise<T> {
  const conn: PoolConnection = await pool.getConnection();
  const tx = tags(conn as unknown as Runner);
  let locked = false;
  try {
    if (opts.lock) {
      const [r] = await tx.sql<{ ok: number | null }[]>`SELECT GET_LOCK(${opts.lock}, 10) AS ok`;
      if (Number(r?.ok) !== 1) throw new Error("Server is busy, please try again.");
      locked = true;
    }
    await conn.beginTransaction();
    const result = await fn(tx);
    await conn.commit();
    return result;
  } catch (e) {
    try {
      await conn.rollback();
    } catch {
      /* connection already gone */
    }
    throw e;
  } finally {
    if (locked) await tx.exec`DO RELEASE_LOCK(${opts.lock})`.catch(() => undefined);
    conn.release();
  }
}

export const uuid = (): string => crypto.randomUUID();

/** JS Date -> "YYYY-MM-DD HH:MM:SS.mmm" (UTC) for DATETIME columns. */
export const dbTime = (d = new Date()): string => d.toISOString().slice(0, 23).replace("T", " ");

/** True for a duplicate-key error (unique index violation). */
export const isDuplicate = (e: unknown): boolean => (e as { errno?: number }).errno === 1062;
