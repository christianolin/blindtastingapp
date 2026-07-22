// Renders one combined SVG of staged (DRAFT) boundaries under a key prefix
// plus a numeric sanity report, for the owner's shape-review gate. Read-only.
// Usage: node preview-cote-de-nuits.mjs [key-prefix] [outfile-slug]
import { writeFile } from "node:fs/promises";
import pg from "pg";
import { pgConfig } from "../wine-map-tiles/lib.mjs";

const prefix = process.argv[2] ?? "france.bourgogne.cote-de-nuits.vosne-romanee";
const outSlug = process.argv[3] ?? "vosne-romanee";

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
          (p.primary_parent_id is null or exists (
            select 1
              from wine_place_boundaries pb
             where pb.wine_place_id = p.primary_parent_id
               and (pb.is_current or pb.quality_status = 'DRAFT')
               and extensions.ST_Intersects(pb.display_geometry, b.display_geometry)
          )) as touches_parent
     from wine_places p
     join wine_place_boundaries b on b.wine_place_id = p.id and b.quality_status = 'DRAFT'
    where p.canonical_key like $1 || '%'
    order by p.canonical_key`,
  [prefix],
);
await client.end();

if (rows.length === 0) {
  console.log("no staged DRAFT boundaries under", prefix);
  process.exit(0);
}

const bbox = [Infinity, Infinity, -Infinity, -Infinity];
for (const r of rows) {
  bbox[0] = Math.min(bbox[0], r.minx);
  bbox[1] = Math.min(bbox[1], r.miny);
  bbox[2] = Math.max(bbox[2], r.maxx);
  bbox[3] = Math.max(bbox[3], r.maxy);
}
const pad = 0.005;
const [w, s, e, n] = [bbox[0] - pad, bbox[1] - pad, bbox[2] + pad, bbox[3] + pad];
const scale = 1400 / Math.max(e - w, n - s);
const W = ((e - w) * scale).toFixed(0);
const H = ((n - s) * scale).toFixed(0);
const project = ([x, y]) => `${((x - w) * scale).toFixed(1)},${((n - y) * scale).toFixed(1)}`;

const style = (r) => {
  if (r.level === "grand_cru") return { fill: "#B78E42", op: 0.85, stroke: "#7a5a1e" };
  if (r.tier === 3) return { fill: "#f3e0e4", op: 0.45, stroke: "#5C1A2B" };
  if (r.level === "premier_cru" && r.tier === 4) return { fill: "#d9b3c2", op: 0.35, stroke: "#8a3b57" };
  return { fill: "none", op: 1, stroke: "#8a3b57" };
};
const rank = (r) => (r.level === "grand_cru" ? 3 : r.tier);
const sorted = [...rows].sort((a, b) => rank(a) - rank(b));

let paths = "";
let labels = "";
for (const r of sorted) {
  const geom = JSON.parse(r.geojson);
  const st = style(r);
  const d = geom.coordinates
    .map((poly) => poly.map((ring) => `M${ring.map(project).join("L")}Z`).join(""))
    .join("");
  paths += `<path d="${d}" fill="${st.fill}" fill-opacity="${st.op}" stroke="${st.stroke}" stroke-width="0.6"/>`;
  if (r.tier === 3 || r.level === "grand_cru") {
    const cx = ((r.minx + r.maxx) / 2 - w) * scale;
    const cy = (n - (r.miny + r.maxy) / 2) * scale;
    const size = r.tier === 3 ? 11 : 7;
    labels += `<text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" font-size="${size}" text-anchor="middle" fill="#2b0f18">${r.name}</text>`;
  }
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="sans-serif"><rect width="${W}" height="${H}" fill="#F5EFE3"/>${paths}${labels}</svg>\n`;
await writeFile(`.superpowers/sdd/preview-${outSlug}.svg`, svg);

console.log(
  `bbox lon ${w.toFixed(3)}..${e.toFixed(3)} lat ${s.toFixed(3)}..${n.toFixed(3)}  (${rows.length} staged boundaries)`,
);
console.log("level        tier vtx parts  in-parent  name");
for (const r of rows) {
  console.log(
    `${(r.level ?? "-").padEnd(11)} ${r.tier}  ${String(r.npoints).padStart(4)} ${String(r.ncomp).padStart(3)}   ${r.touches_parent ? "yes" : "NO "}       ${r.name}`,
  );
}
