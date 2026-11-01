import mysql from "mysql2/promise";

/** Opens a connection from DATABASE_URL (mysql://user:pass@host:3306/dbname). */
export async function connect(multipleStatements = false) {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env first.");
    process.exit(1);
  }
  const u = new URL(raw);
  const conn = await mysql.createConnection({
    host: u.hostname,
    port: u.port ? Number(u.port) : 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
    charset: "UTF8MB4_UNICODE_CI",
    multipleStatements,
    ...(process.env.DATABASE_SSL === "true" ? { ssl: { rejectUnauthorized: true } } : {}),
  });
  await conn.query("SET time_zone = '+00:00'");
  return conn;
}
