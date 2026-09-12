// Fold the eAmbrosia audit's outcome into data/wine-map/italy-doc-membership.json,
// so each footprint carries the EU record it was checked against and the verdict.
//
// The Spanish membership file keeps its provenance per denomination; this gives
// the Italian one the same property. Without it the audit's result lives only in
// a terminal, and the "ISTAT comuni per disciplinare" claim is unauditable again
// the moment the run scrolls away.
//
// Verdicts are a human judgment on top of the machine diff. The machine says
// "these names differ"; the RESOLVED table below says why, one entry per
// footprint the audit flagged, each traceable to the zone text quoted in its
// note. Anything the audit flags that is NOT in the table is written through as
// "open" — so a new discrepancy cannot be silently absorbed.
//
// Usage: node scripts/wine-map-sources/record-italy-audit.mjs
//   (run audit-italy-disciplinari.mjs first; this reads its findings.json)
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const FINDINGS = path.resolve(".tiles-build", "italy-audit", "findings.json");
const MEMBERSHIP = "data/wine-map/italy-doc-membership.json";

// key -> { verdict, note }
//   source_artifact  the EU document is wrong or stale; our list stands
//   confirmed        the difference is explained and our list stands
//   open             a real discrepancy, not yet resolved against a statute
const RESOLVED = {
  "campania/taurasi": ["source_artifact",
    "The zone list spells the comune \"Montemileto\"; the ISTAT name is Montemiletto. A typo in the single document, not a different place."],
  "umbria/colli-martani": ["source_artifact",
    "The zone list spells the comune \"Collazione\"; the ISTAT name is Collazzone. A typo in the single document."],
  "lombardia/Riviera del Garda Classico": ["open",
    "The attached single document delimits \"Riviera del Garda Bresciano\"/\"Garda Bresciano\" over 29 comuni — the pre-2017 name and zone. Our 19 are all inside that list (the document writes Padenghe del Garda for Padenghe sul Garda) and look like the narrower Classico core, but the post-2017 delimitation has not been read."],
  "emilia-romagna/colli-bolognesi-pignoletto": ["confirmed",
    "Valsamoggia is the 2014 merger of Bazzano, Castello di Serravalle, Crespellano, Monteveglio and Savigno; the zone names Crespellano, Bazzano, Castello di Serravalle and Monteveglio. Savignano sul Panaro is named too, expressly \"della provincia di Modena\"."],
  "emilia-romagna/gutturnio": ["confirmed",
    "Alta Val Tidone is the 2018 merger of Caminata, Nibbiano and Pecorara; the zone names Nibbiano."],
  "lombardia/Oltrepò Pavese": ["confirmed",
    "Colli Verdi is the 2019 merger of Canevino, Ruino and Valverde; the zone names Canevino and Ruino."],
  "trentino/Trentino": ["confirmed",
    "The zone states 72 comuni viticoli of the province of Trento. Trentino's 2015-16 merger wave cut the province from 217 comuni to 166, so 66 modern comuni covering 72 historic ones is the expected shape, not a shortfall."],
  "campania/vesuvio": ["confirmed",
    "Massa di Somma was split from San Sebastiano al Vesuvio in 1988, after the zone text was written; the zone names San Sebastiano al Vesuvio."],
  "sicily/Etna": ["confirmed",
    "Ragalna was split from Paterno in 1985, after the zone text was written; the zone names Paterno."],
  "lombardia/Moscato di Scanzo": ["source_artifact",
    "\"Martinengo\" in the zone text is Via F. Martinengo, a street in the boundary description of Scanzorosciate, which happens to share its name with a Bergamo comune. The same failure mode as \"Ulea\" — a river — in the Bullas pliego. Our single-comune list is right."],
  "sardegna/vermentino-di-gallura": ["open",
    "The zone reads \"... in Provincia di Olbia-Tempio, e Viddalba in Provincia di Sassari\". Viddalba is absent from our 22. This reads as a plain omission: the list should be 23."],
  "puglia/copertino": ["open",
    "The zone gives Copertino, Carmiano, Arnesano and Monteroni whole, plus Galatina and Lequile in part. San Pietro in Lama is ours and is not named. Needs the current national disciplinare, which is later than this document."],
  "abruzzo/montepulciano-d-abruzzo-colline-teramane": ["open",
    "The zone lists 31 comuni of the province of Teramo; Montefino is ours and is not among them. Needs the current national disciplinare."],
  "valle-d-aosta/donnas": ["confirmed",
    "Filed inside the Valle d'Aosta / Vallee d'Aoste record, whose zone covers the whole DOC. A sub-denomination's own delimitation is not in the single document, so this footprint cannot be checked from it."],
  "valle-d-aosta/blanc-de-morgex-et-de-la-salle": ["confirmed",
    "Filed inside the Valle d'Aosta / Vallee d'Aoste record, whose zone covers the whole DOC. A sub-denomination's own delimitation is not in the single document, so this footprint cannot be checked from it."],
};

const findings = JSON.parse(await readFile(FINDINGS, "utf8"));
const membership = JSON.parse(await readFile(MEMBERSHIP, "utf8"));

membership._readme.audited = {
  source: "eAmbrosia, the EU register of geographical indications (https://webgate.ec.europa.eu/eambrosia-api/)",
  method:
    "For each footprint, the registered GI's single document / technical file was downloaded and its section 5 'ZONA DELIMITATA' compared with our comune list. See scripts/wine-map-sources/audit-italy-disciplinari.mjs for what each zone shape can and cannot prove.",
  limit:
    "The single document is the EU's summary, not the national disciplinare, and the links it gives to politicheagricole.it are dead. A footprint marked 'open' needs the current disciplinare read by hand.",
  run_on: new Date().toISOString().slice(0, 10),
};

let ok = 0, artifact = 0, confirmed = 0, open = 0, unlisted = [];
for (const f of findings) {
  const fp = membership.footprints[f.key];
  if (!fp) continue;
  const clean = f.status === "ok";
  const [verdict, note] = RESOLVED[f.key] ?? [clean ? "matches" : "open", null];
  if (!clean && !RESOLVED[f.key]) unlisted.push(f.key);
  fp.audit = {
    register: "eAmbrosia",
    gi_name: f.name ?? null,
    gi_id: f.appUniqueId ?? null,
    zone_shape: f.shape ?? null,
    verdict,
    ...(note ? { note } : {}),
    ...(clean ? {} : {
      differences: {
        ...(f.missing?.length ? { in_zone_not_ours: f.missing } : {}),
        ...(f.unnamed?.length ? { ours_not_in_zone: f.unnamed } : {}),
        ...(f.outOfProvince?.length ? { outside_zone_provinces: f.outOfProvince } : {}),
        ...(f.excluded?.length ? { zone_excludes: f.excluded } : {}),
        ...(f.stated != null && f.stated !== fp.comuni.length ? { zone_states_count: f.stated } : {}),
      },
    }),
  };
  if (verdict === "matches") ok++;
  else if (verdict === "source_artifact") artifact++;
  else if (verdict === "confirmed") confirmed++;
  else open++;
}

await writeFile(MEMBERSHIP, `${JSON.stringify(membership, null, 2)}\n`);
console.log(`${MEMBERSHIP}: ${ok} match the zone text, ${confirmed} differ for a documented reason, `
  + `${artifact} differ because the EU document is wrong, ${open} open.`);
if (unlisted.length) {
  console.log(`\n${unlisted.length} flagged but not in the RESOLVED table — written through as "open":`);
  unlisted.forEach((k) => console.log(`  ${k}`));
}
