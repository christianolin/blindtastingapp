// Read-only activity check before any rolled-back catalogue write (plan
// 2026-09-29-usa-wine-map-us2 Task 2 Step 5): nobody else is writing the
// catalogue (by query text, and by write locks on the catalogue tables), no
// tiles run is in flight, no DRAFT boundary exists. All of active, writers and
// building must be empty before a rolled-back catalogue write.
import { withReadOnly } from "../wine-map-sources/read-only-client.mjs";

await withReadOnly(async (c) => {
  const a = await c.query(`select pid, state, now() - query_start as for, left(query, 120) q from pg_stat_activity
    where datname = current_database() and pid <> pg_backend_pid() and state <> $1 and query ~* $2`, ["idle", "wine_place|wine_boundary|refresh_wine_place"]);
  const r = await c.query(`select version, status, created_at from wine_map_releases where status = $1 and created_at > now() - interval '1 hour'`, ["BUILDING"]);
  const d = await c.query(`select count(*)::int n from wine_place_boundaries where quality_status = $1`, ["DRAFT"]);
  const f = await c.query("select fresh, built_at from wine_place_neighbours_state");
  // pg_stat_activity.query holds only the first 1 KB of a statement, and a
  // migration file's header comments can fill it, so the text match above
  // misses a running migration. Locks on the catalogue tables do not.
  const l = await c.query(`select distinct l.pid, a.state, now() - a.xact_start as xact, c.relname
      from pg_locks l join pg_class c on c.oid = l.relation join pg_stat_activity a on a.pid = l.pid
     where l.pid <> pg_backend_pid() and c.relname = any($1) and l.mode <> 'AccessShareLock'`,
    [["wine_places", "wine_place_boundaries", "wine_place_neighbours_state", "wine_place_neighbours"]]);
  console.log(JSON.stringify({ active: a.rows, writers: l.rows, building: r.rows, draft_boundaries: d.rows[0].n, cache: f.rows[0] }));
});
