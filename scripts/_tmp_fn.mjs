import pg from "pg";
import { pgConfig } from "./wine-map-tiles/lib.mjs";
const c = new pg.Client(pgConfig());
await c.connect();
const r = await c.query(`select p.proname, p.prosecdef, pg_get_functiondef(p.oid) as def from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('add_cellar_lot')`);
for (const row of r.rows) { console.log("secdef:", row.prosecdef); console.log(row.def); }
await c.end();
