// One read-only transaction against live, always rolled back (spec 2026-09-29
// US-0: nothing written live). Geometry travels as query parameters; nothing is
// created. A write attempted inside `fn` fails with "cannot execute ... in a
// read-only transaction".
import { readFile } from "node:fs/promises";
import pg from "pg";

export async function withReadOnly(fn, { statementTimeoutMs = 600000 } = {}) {
  const env = Object.fromEntries(
    (await readFile(".env.local", "utf8")).split(/\r?\n/)
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  );
  const client = new pg.Client({
    connectionString: env.DATABASE_URL.trim().replace(/^["']|["']$/g, ""),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query("begin read only");
    const { rows } = await client.query("show transaction_read_only");
    if (rows[0].transaction_read_only !== "on") throw new Error("transaction is not read-only; refusing to continue");
    await client.query(`set local statement_timeout = ${Number(statementTimeoutMs)}`);
    return await fn(client);
  } finally {
    try { await client.query("rollback"); } catch { /* the connection may already be gone */ }
    await client.end();
  }
}
