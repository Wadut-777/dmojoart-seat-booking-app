#!/usr/bin/env node
// Creates (or resets the password of) an admin login.
// Usage: node --env-file=.env scripts/create-admin.mjs <email> <password>
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { connect } from "./db-lib.mjs";

const [email, password] = process.argv.slice(2);
if (!email || !password || password.length < 8) {
  console.error("Usage: create-admin <email> <password (min 8 chars)>");
  process.exit(1);
}

// Must match src/server/auth.server.ts (scrypt$N$salt$hash).
const N = 16384;
const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64, { N });
const passwordHash = `scrypt$${N}$${salt.toString("base64")}$${hash.toString("base64")}`;

const db = await connect();
try {
  const mail = email.trim();
  const [rows] = await db.query("SELECT id FROM users WHERE email = ?", [mail]);
  let id = rows[0]?.id;
  if (id) {
    await db.query("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, id]);
  } else {
    id = randomUUID();
    await db.query("INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)", [id, mail, passwordHash]);
  }
  await db.query("INSERT IGNORE INTO user_roles (id, user_id, role) VALUES (?, ?, 'admin')", [randomUUID(), id]);
  await db.query("DELETE FROM sessions WHERE user_id = ?", [id]);
  console.log(`Admin ready: ${mail}`);
} catch (err) {
  console.error("Failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await db.end();
}
