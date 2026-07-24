// Config-driven, COMPREHENSIVE region artifact generator. For a region it pulls
// every matching denomination out of the pinned INAO membership file (by exact
// name or family prefix), so sub-regions / villages / named crus / lieux-dits
// are captured in full without hand-typing accented names. Emits
// data/wine-map/<region>-appellations.json for preview-inao-region.mjs.
// Re-derivable: run to regenerate byte-for-byte.
//
// Usage: node scripts/wine-map-sources/generate-region-artifact.mjs --region=<slug>
import { readFile, writeFile } from "node:fs/promises";

const membership = JSON.parse(
  await readFile("data/wine-map/inao-denomination-membership.json", "utf8"),
).membership;

const slugify = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// Concave dissolve presets by level (finer for smaller/site-scale footprints).
const CONCAVE = {
  region: { gridSize: 0.06, simplifyTolerance: 0.002, minComponentShare: 0.01, concavity: 2 },
  district: { gridSize: 0.05, simplifyTolerance: 0.0015, minComponentShare: 0.01, concavity: 2 },
  village: { gridSize: 0.03, simplifyTolerance: 0.0008, minComponentShare: 0.03, concavity: 2 },
  grand_cru: { gridSize: 0.02, simplifyTolerance: 0.0004, minComponentShare: 0.05, concavity: 2 },
  climat: { gridSize: 0.02, simplifyTolerance: 0.0003, minComponentShare: 0.06, concavity: 2 },
};

const provenance = (caveats) => ({
  authority: "IGN Geoplateforme WFS AOC-VITICOLES:aire_parcellaire (INAO delimited AOC parcels), Licence Ouverte Etalab",
  membership_source: "data/wine-map/inao-denomination-membership.json (exact member names + parcel counts, pinned in-repo)",
  reviewed_at: "2026-07-24",
  method: "GENERALIZED_FROM_OFFICIAL_SOURCE - server-side denom LIKE bound, client-side exact membership match, client-side concave dissolve (same engine as the live pipeline). Denomination set extracted comprehensively from the pinned membership file by rule.",
  caveats,
});

// Each selector is { exact } or { prefix }, a level, and optional display name /
// strip. Prefix selectors strip the prefix for the display name by default.
const CONFIGS = {
  savoie: {
    region: "Savoie",
    keyBase: "france.savoie",
    window: { minLon: 5.6, minLat: 45.3, maxLon: 7.0, maxLat: 46.5 },
    caveats: [
      "Savoie vineyards are scattered pockets (Lake Geneva down through the Combe de Savoie) - the base 'Vin de Savoie' and 'Roussette de Savoie' dissolves are expected to be strongly MULTI-component (correct).",
      "Comprehensive: base Vin de Savoie + Roussette de Savoie + Seyssel + all named Vin de Savoie crus (Apremont, Abymes, Chignin, Chignin-Bergeron, Chautagne, Cruet, Jongieux, Arbin, Crepy, Marin, Marignan, Montmelian, Ripaille, Ayze, Saint-Jean-de-la-Porte, Saint-Jeoire-Prieure) + Roussette de Savoie crus (Frangy, Marestel, Monterminod, Monthoux).",
      "Bugey (in the Ain) is a separate neighbouring region, not modeled here.",
    ],
    modeling: "france.savoie region (display 'Savoie', tier 1): boundary = dissolve of the base 'Vin de Savoie ou Savoie' at flip time. Base 'Vin de Savoie' + 'Roussette de Savoie' = appellation_level district; Seyssel + the named crus = village. All is_appellation=true, appellation_system=AOC, classification=GENERALIZED_FROM_OFFICIAL_SOURCE, primary_parent=france.savoie. Grapes: Jacquere (Apremont/Abymes), Altesse (Roussette), Mondeuse (reds), Roussanne (Chignin-Bergeron). Scoring links exact-name (never fuzzy); no exact row -> PENDING. NOT run live - reviewable groundwork pending the owner shape-review gate.",
    selectors: [
      { exact: "Vin de Savoie ou Savoie", regionPlace: true },
      { exact: "Roussette de Savoie", level: "district" },
      { exact: "Seyssel", level: "village" },
      { prefix: "Vin de Savoie ", level: "village" },
      { prefix: "Roussette de Savoie ", level: "village" },
    ],
  },
  jura: {
    region: "Jura",
    keyBase: "france.jura",
    window: { minLon: 5.3, minLat: 46.3, maxLon: 6.0, maxLat: 47.4 },
    caveats: [
      "Geographic AOCs only: Cotes du Jura (region-wide), Arbois, Arbois Pupillin (a named sub of Arbois), Chateau-Chalon (the vin jaune AOC, tiny - 12 parcels), L'Etoile.",
      "Cremant du Jura (1720) and Macvin du Jura (1719) are product/style AOCs over essentially the Cotes du Jura footprint - better modeled as designations than as separate overlapping map places, so they are excluded here.",
      "Cotes du Jura is a long scattered N-S strip along the Revermont - expect several components (correct).",
    ],
    modeling: "france.jura region (display 'Jura', tier 1): boundary = dissolve of 'Cotes du Jura' at flip time (the region-wide AOC). Cotes du Jura = appellation_level district; Arbois/Arbois Pupillin/Chateau-Chalon/L'Etoile = village. All is_appellation=true, appellation_system=AOC, classification=GENERALIZED_FROM_OFFICIAL_SOURCE, primary_parent=france.jura. Grapes: Savagnin (vin jaune - Chateau-Chalon), Chardonnay, Poulsard/Trousseau (reds), Pinot Noir. Scoring links exact-name; no exact row -> PENDING. NOT run live - reviewable groundwork pending the owner shape-review gate.",
    selectors: [
      { exact: "Côtes du Jura", regionPlace: true },
      { exact: "Arbois", level: "village" },
      { exact: "Arbois Pupillin", level: "village" },
      { exact: "Château-Chalon", level: "village" },
      { exact: "L'Etoile", name: "L'Étoile", level: "village" },
    ],
  },
};

const region = process.argv.find((a) => a.startsWith("--region="))?.split("=")[1];
const cfg = CONFIGS[region];
if (!cfg) throw new Error(`unknown --region (have: ${Object.keys(CONFIGS).join(", ")})`);

const targets = [];
const seen = new Set();
for (const sel of cfg.selectors) {
  const keys = sel.exact
    ? membership[sel.exact] != null
      ? [sel.exact]
      : []
    : Object.keys(membership).filter((k) => k.startsWith(sel.prefix));
  for (const key of keys.sort((a, b) => a.localeCompare(b))) {
    if (cfg.exclude?.includes(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    const name = sel.regionPlace
      ? cfg.region
      : (sel.name ?? (sel.prefix ? key.slice(sel.prefix.length) : key));
    const level = sel.regionPlace ? "region" : sel.level;
    const slug = slugify(name);
    targets.push({
      slug,
      key: sel.regionPlace ? cfg.keyBase : `${cfg.keyBase}.${slug}`,
      name,
      level,
      members: [key],
      parcels: membership[key],
      concave: CONCAVE[level],
    });
  }
}

const artifact = {
  region: cfg.region,
  provenance: provenance(cfg.caveats),
  modeling_decision: cfg.modeling,
  region_window: cfg.window,
  targets,
};
const out = `data/wine-map/${region}-appellations.json`;
await writeFile(out, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(`wrote ${out}: ${targets.length} targets`);
