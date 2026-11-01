#!/usr/bin/env node
// Applies db/migrations/*.sql (once each) and, with --seed, loads db/seed.sql
// into an empty database.  Usage:  node --env-file=.env scripts/db-setup.mjs [--seed]
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { connect } from "./db-lib.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const db = await connect(true);

try {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name VARCHAR(100) NOT NULL PRIMARY KEY,
    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`);

  const files = (await readdir(join(root, "db", "migrations"))).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const [done] = await db.query("SELECT 1 FROM schema_migrations WHERE name = ?", [file]);
    if (done.length) continue;
    // MySQL DDL cannot be rolled back, so the migration is recorded only after it fully succeeds.
    await db.query(await readFile(join(root, "db", "migrations", file), "utf8"));
    await db.query("INSERT INTO schema_migrations (name) VALUES (?)", [file]);
    console.log(`applied  ${file}`);
  }

  if (process.argv.includes("--seed")) {
    const [[h]] = await db.query("SELECT COUNT(*) AS n FROM halls");
    const [[e]] = await db.query("SELECT COUNT(*) AS n FROM events");
    if (Number(h.n) > 0 || Number(e.n) > 0) {
      console.log("seed skipped: halls/events already exist");
    } else {
      await db.query(await readFile(join(root, "db", "seed.sql"), "utf8"));
      console.log("seeded   starter events, halls and seat categories");
    }
  }
  console.log("database ready");
} catch (err) {
  console.error("Database setup failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await db.end();
}
