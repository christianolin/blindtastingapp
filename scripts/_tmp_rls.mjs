import pg from "pg";
import { pgConfig } from "./wine-map-tiles/lib.mjs";
const c = new pg.Client(pgConfig());
await c.connect();
const q = `select tablename, policyname, cmd, roles::text, coalesce(with_check, qual) as expr
from pg_policies
where schemaname='public' and tablename in ('producers','grapes','appellations','catalog_wines','cellar_lots','regions','countries')
and cmd in ('INSERT','ALL')
order by tablename, cmd`;
const r = await c.query(q);
for (const x of r.rows) console.log(`${x.tablename} | ${x.cmd} | ${x.policyname} | ${x.expr}`);
await c.end();
