import pg from "pg";
import { pgConfig } from "./wine-map-tiles/lib.mjs";
const c = new pg.Client(pgConfig());
await c.connect();
const r = await c.query("select prosecdef, pg_get_functiondef(oid) d from pg_proc where proname='find_or_create_catalog_wine'");
console.log("secdef:", r.rows[0].prosecdef);
console.log(r.rows[0].d);
await c.end();
