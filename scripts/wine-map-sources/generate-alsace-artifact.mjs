// Generate data/wine-map/alsace-appellations.json from the pinned INAO
// membership file: the regional Alsace AOC (dual-role region) + all 51
// "Alsace grand cru <name>" denominations as grand_cru appellations. Each
// Alsace Grand Cru is a full AOC, so is_appellation=true / appellation_level=
// grand_cru (unlike the Champagne echelle villages, which are ratings).
// Re-derivable: run to regenerate the artifact byte-for-byte.
//
// Usage: node scripts/wine-map-sources/generate-alsace-artifact.mjs
import { readFile, writeFile } from "node:fs/promises";

const OUT = "data/wine-map/alsace-appellations.json";
const membership = JSON.parse(
  await readFile("data/wine-map/inao-denomination-membership.json", "utf8"),
).membership;

const slugify = (s) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const GC_PREFIX = "Alsace grand cru ";
const gcTargets = Object.keys(membership)
  .filter((k) => k.startsWith(GC_PREFIX))
  .sort((a, b) => a.localeCompare(b))
  .map((full) => {
    const name = full.slice(GC_PREFIX.length);
    const slug = slugify(name);
    return {
      slug,
      key: `france.alsace.${slug}`,
      name,
      level: "grand_cru",
      members: [full],
      parcels: membership[full],
      concave: { gridSize: 0.02, simplifyTolerance: 0.0004, minComponentShare: 0.05, concavity: 2 },
    };
  });

const artifact = {
  region: "Alsace",
  provenance: {
    authority: "IGN Geoplateforme WFS AOC-VITICOLES:aire_parcellaire (INAO delimited AOC parcels), Licence Ouverte Etalab",
    membership_source: "data/wine-map/inao-denomination-membership.json (exact member names + parcel counts, pinned in-repo)",
    reviewed_at: "2026-07-24",
    method: "GENERALIZED_FROM_OFFICIAL_SOURCE - server-side denom LIKE bound, client-side exact membership match, client-side concave dissolve (same engine as the live pipeline).",
    caveats: [
      "Alsace is a dual-role region: the region place france.alsace IS the regional 'Alsace' AOC (single-entry member list), per the Phase 3 France design.",
      "The 51 grands crus are each a full AOC (Alsace Grand Cru delimited lieu-dit): is_appellation=true, appellation_level=grand_cru, primary_parent=france.alsace.",
      "Several grands crus are tiny (1-6 delimited parcels: Altenberg de Bergbieten, Bruderthal, Geisberg, Kessler, Kirchberg de Ribeauville, Wiebelsberg...) - their footprints are correspondingly small but valid.",
      "Deferred to a later breadth/depth pass: 'Alsace suivi d'un nom de lieu-dit' (2541), the communal complements (Alsace Bergheim/Ottrott/Cote de Rouffach/Klevener de Heiligenstein...), and Cremant d'Alsace.",
    ],
  },
  modeling_decision: "region france.alsace: is_appellation=true, appellation_level=region, appellation_system=AOC, classification=GENERALIZED_FROM_OFFICIAL_SOURCE, tier 1, min_zoom ~4, boundary = dissolve of member 'Alsace' (2595 parcels). 51 grands crus: is_appellation=true, appellation_level=grand_cru, primary_parent=france.alsace, tier 2, boundary = dissolve of each 'Alsace grand cru <name>' member. Grapes: the four noble varieties (Riesling, Gewurztraminer, Pinot Gris, Muscat) dominate the grands crus; content per-cru later. Scoring links: exact-name against the live French reference rows (never fuzzy); crus without an exact scoring row stay PENDING. NOT run live - reviewable groundwork; the catalog/boundary/flip/links/content build waits on the owner shape-review gate.",
  region_window: { minLon: 6.9, minLat: 47.7, maxLon: 7.8, maxLat: 49.2 },
  targets: [
    {
      slug: "alsace",
      key: "france.alsace",
      name: "Alsace",
      level: "region",
      members: ["Alsace"],
      parcels: membership["Alsace"],
      concave: { gridSize: 0.05, simplifyTolerance: 0.0015, minComponentShare: 0.02, concavity: 2 },
    },
    ...gcTargets,
  ],
};

await writeFile(OUT, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(`wrote ${OUT}: ${artifact.targets.length} targets (1 region + ${gcTargets.length} grands crus)`);
