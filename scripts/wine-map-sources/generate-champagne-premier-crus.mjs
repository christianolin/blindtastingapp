// Generate data/wine-map/champagne-premier-crus.json: the buildable Champagne
// Premier Cru villages, matched to real INAO communes (champagne-communes.json)
// for INSEE + assigned to their sub-region. Best-knowledge Echelle des Crus 1er
// cru list; villages whose commune merged away (Vertus, Mareuil-sur-Ay, Bisseuil)
// or that are absent are deferred (see `deferred`). Re-derivable.
//   node scripts/wine-map-sources/generate-champagne-premier-crus.mjs
import { readFile, writeFile } from "node:fs/promises";

const communes = JSON.parse(
  await readFile("data/wine-map/champagne-communes.json", "utf8"),
).communes;
const fold = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/œ/g, "oe").replace(/æ/g, "ae").replace(/[’]/g, "'").trim();
const byFold = new Map(communes.map((c) => [fold(c.name), c]));
const slugify = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/œ/g, "oe").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// [display, communeMatchName (if different), subregion-slug]
const list = [
  ["Bezannes", null, "montagne-de-reims"], ["Billy-le-Grand", null, "montagne-de-reims"],
  ["Chamery", null, "montagne-de-reims"], ["Chigny-les-Roses", null, "montagne-de-reims"],
  ["Cormontreuil", null, "montagne-de-reims"], ["Coulommes-la-Montagne", null, "montagne-de-reims"],
  ["Écueil", null, "montagne-de-reims"], ["Jouy-lès-Reims", null, "montagne-de-reims"],
  ["Les Mesneux", "Mesneux", "montagne-de-reims"], ["Ludes", null, "montagne-de-reims"],
  ["Montbré", null, "montagne-de-reims"], ["Pargny-lès-Reims", null, "montagne-de-reims"],
  ["Rilly-la-Montagne", null, "montagne-de-reims"], ["Sacy", null, "montagne-de-reims"],
  ["Sermiers", null, "montagne-de-reims"], ["Taissy", null, "montagne-de-reims"],
  ["Trépail", null, "montagne-de-reims"], ["Trois-Puits", null, "montagne-de-reims"],
  ["Vaudemange", null, "montagne-de-reims"], ["Villedommange", "Ville-Dommange", "montagne-de-reims"],
  ["Villers-Allerand", null, "montagne-de-reims"], ["Villers-aux-Nœuds", "51631", "montagne-de-reims"],
  ["Villers-Marmery", null, "montagne-de-reims"], ["Vrigny", null, "montagne-de-reims"],
  ["Avenay-Val-d'Or", null, "grande-vallee-de-la-marne"], ["Champillon", null, "grande-vallee-de-la-marne"],
  ["Cumières", null, "grande-vallee-de-la-marne"], ["Dizy", null, "grande-vallee-de-la-marne"],
  ["Hautvillers", null, "grande-vallee-de-la-marne"], ["Mutigny", null, "grande-vallee-de-la-marne"],
  ["Bergères-lès-Vertus", null, "cote-des-blancs"], ["Coligny", "Val-des-Marais", "cote-des-blancs"],
  ["Cuis", null, "cote-des-blancs"], ["Étréchy", null, "cote-des-blancs"],
  ["Grauves", null, "cote-des-blancs"], ["Pierry", null, "cote-des-blancs"],
  ["Villeneuve-Renneville-Chevigny", null, "cote-des-blancs"], ["Voipreux", null, "cote-des-blancs"],
];

const villages = [];
const missing = [];
for (const [display, match, sr] of list) {
  const c = match && /^5\d{4}$/.test(match)
    ? communes.find((x) => x.insee === match)
    : byFold.get(fold(match ?? display));
  if (!c) { missing.push(display); continue; }
  villages.push({ slug: slugify(display), name: display, insee: c.insee, subregion: sr });
}
if (missing.length) throw new Error("unmatched 1er cru: " + missing.join(", "));

const artifact = {
  classification: "Champagne — Echelle des Crus, Premier Cru villages (90-99% rated)",
  provenance: {
    authority: "Echelle des Crus 1er cru villages (best-knowledge list); commune footprints from IGN Admin Express by INSEE (subset of champagne-communes.json, INAO Licence Ouverte).",
    reviewed_at: "2026-07-24",
    caveats: [
      "A Champagne Premier Cru is a COMMUNE rating (90-99% on the Echelle des Crus), not a parcel AOC. The commune footprint is an over-approximation of the rated vineyard.",
      "'Coligny' uses the Val-des-Marais commune-nouvelle footprint (51158), which over-includes non-cru villages.",
    ],
  },
  modeling_decision: "kind=SITE, is_appellation=false, appellation_level=null, tier 3, primary_parent = the village's Champagne sub-region (Montagne de Reims / Cote des Blancs / Grande Vallee de la Marne). Same model as the 17 Grand Cru villages. Sub-regions are re-derived to include these after the flip.",
  village_count: villages.length,
  deferred: {
    "Tauxieres-Mutry": "not present in champagne-communes.json (aire geographique)",
    "Mareuil-sur-Ay, Bisseuil": "subsumed in the Ay Grand Cru commune-nouvelle footprint (51030) - would double-count",
    "Vertus": "merged into the Blancs-Coteaux commune nouvelle - needs a deleguee footprint",
  },
  villages,
};
await writeFile(
  "data/wine-map/champagne-premier-crus.json",
  JSON.stringify(artifact, null, 2) + "\n",
);
console.log(`wrote champagne-premier-crus.json: ${villages.length} villages`);
