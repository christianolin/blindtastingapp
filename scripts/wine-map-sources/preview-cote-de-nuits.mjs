// Renders one combined SVG of the staged Vosne-Romanée subtree (village +
// 1er-cru group + climats + grands crus) plus a numeric sanity report, for the
// owner's shape-review gate. Read-only against the DB.
import { writeFile } from "node:fs/promises";
import pg from "pg";
import { pgConfig } from "../wine-map-tiles/lib.mjs";

const client = new pg.Client(pgConfig());
await client.connect();
const { rows } = await client.query(
  `select p.canonical_key, p.name, p.appellation_level as level, p.display_tier as tier,
          extensions.ST_AsGeoJSON(b.display_geometry, 6) as geojson,
          extensions.ST_NPoints(b.display_geometry) as npoints,
          extensions.ST_NumGeometries(b.display_geometry) as ncomp,
          extensions.ST_XMin(extensions.Box3D(b.display_geometry)) as minx,
          extensions.ST_YMin(extensions.Box3D(b.display_geometry)) as miny,
          extensions.ST_XMax(extensions.Box3D(b.display_geometry)) as maxx,
          extensions.ST_YMax(extensions.Box3D(b.display_geometry)) as maxy,
          exists (
            select 1 from wine_places vp
            join wine_place_boundaries vb on vb.wine_place_id = vp.id and vb.quality_status = 'DRAFT'
            where vp.canonical_key = 'france.bourgogne.cote-de-nuits.vosne-romanee'
              and extensions.ST_Intersects(vb.display_geometry, b.display_geometry)
          ) as touches_village
     from wine_places p
     join wine_place_boundaries b on b.wine_place_id = p.id and b.quality_status = 'DRAFT'
    where p.canonical_key like 'france.bourgogne.cote-de-nuits.vosne-romanee%'
    order by p.display_tier, p.name`,
);
await client.end();

const bbox = [Infinity, Infinity, -Infinity, -Infinity];
for (const r of rows) {
  bbox[0] = Math.min(bbox[0], r.minx); bbox[1] = Math.min(bbox[1], r.miny);
  bbox[2] = Math.max(bbox[2], r.maxx); bbox[3] = Math.max(bbox[3], r.maxy);
}
const pad = 0.004;
const [w, s, e, n] = [bbox[0] - pad, bbox[1] - pad, bbox[2] + pad, bbox[3] + pad];
const scale = 1100 / Math.max(e - w, n - s);
const W = ((e - w) * scale).toFixed(0);
const H = ((n - s).toFixed ? (n - s) * scale : 0).toFixed(0);
const project = ([x, y]) => `${((x - w) * scale).toFixed(1)},${((n - y) * scale).toFixed(1)}`;

const style = (r) => {
  if (r.level === "grand_cru") return { fill: "#B78E42", op: 0.85, stroke: "#7a5a1e" };
  if (r.tier === 3) return { fill: "#f3e0e4", op: 0.5, stroke: "#5C1A2B" }; // village
  if (r.tier === 4 && r.level === "premier_cru") return { fill: "#d9b3c2", op: 0.35, stroke: "#8a3b57" }; // 1er group
  return { fill: "none", op: 1, stroke: "#8a3b57" }; // climats
};
const order = { 3: 0, 4: 1, 5: 2 };
const sorted = [...rows].sort((a, b) => (a.level === "grand_cru" ? 3 : order[a.tier]) - (b.level === "grand_cru" ? 3 : order[b.tier]));

let paths = "";
let labels = "";
for (const r of sorted) {
  const geom = JSON.parse(r.geojson);
  const st = style(r);
  const d = geom.coordinates
    .map((poly) => poly.map((ring) => `M${ring.map(project).join("L")}Z`).join(""))
    .join("");
  paths += `<path d="${d}" fill="${st.fill}" fill-opacity="${st.op}" stroke="${st.stroke}" stroke-width="0.6"/>`;
  if (r.level === "grand_cru" || r.tier === 3) {
    const cx = ((r.minx + r.maxx) / 2 - w) * scale;
    const cy = (n - (r.miny + r.maxy) / 2) * scale;
    labels += `<text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" font-size="9" text-anchor="middle" fill="#2b0f18">${r.name}</text>`;
  }
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="sans-serif"><rect width="${W}" height="${H}" fill="#F5EFE3"/>${paths}${labels}</svg>\n`;
await writeFile(".superpowers/sdd/preview-vosne-romanee.svg", svg);

console.log(`bbox lon ${w.toFixed(3)}..${e.toFixed(3)} lat ${s.toFixed(3)}..${n.toFixed(3)}  (${rows.length} boundaries)`);
console.log("level        tier vtx parts  in-village  name");
for (const r of rows) {
  console.log(
    `${(r.level ?? "-").padEnd(11)} ${r.tier}   ${String(r.npoints).padStart(3)} ${String(r.ncomp).padStart(3)}   ${r.touches_village ? "yes" : "NO "}       ${r.name}`,
  );
}
