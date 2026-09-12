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
//   corrected        our list was wrong and has been fixed against the national
//                    disciplinare; the note says what changed and why
//   open             a real discrepancy, not yet resolved against a statute
const RESOLVED = {
  "campania/taurasi": ["source_artifact",
    "The zone list spells the comune \"Montemileto\"; the ISTAT name is Montemiletto. A typo in the single document, not a different place."],
  "umbria/colli-martani": ["source_artifact",
    "The zone list spells the comune \"Collazione\"; the ISTAT name is Collazzone. A typo in the single document."],
  "lombardia/Riviera del Garda Classico": ["corrected",
    "Was 19 comuni, an exact match for the VALTENESI sub-zone rather than the DOC. Article 3 of the national disciplinare gives the DOC \"l'intero territorio dei seguenti comuni, in provincia di Brescia\" and lists 30, and the current EU single document (OJ C 2024/1496) lists the same 30 while delimiting Valtenesi separately over the 19 we had. Rebuilt to the DOC's 30. The remaining flags are the older document's spellings: Capo Valle for Capovalle, Padenghe del Garda for Padenghe sul Garda, Provaglio Valsabbia for Provaglio Val Sabbia."],
  "sardegna/vermentino-di-gallura": ["corrected",
    "Was 22. Article 3 closes \"... in Provincia di Olbia-Tempio, e Viddalba in Provincia di Sassari\"; Viddalba was simply missing. Now 23."],
  "abruzzo/montepulciano-d-abruzzo-colline-teramane": ["corrected",
    "Was 32. Article 3 of the national disciplinare lists 31 comuni of the province of Teramo and Montefino is not among them, as does the EU single document republished at OJ C 198, 6.6.2023. Montefino is entirely enclosed by members, so the old artifact's dropped interior ring had been filling it back in; the rebuilt footprint keeps the 19.2 km2 hole. Now 31."],
  "puglia/copertino": ["corrected",
    "Was 7. Article 3 gives Copertino, Carmiano, Arnesano and Monteroni whole plus Galatina and Lequile in part. San Pietro in Lama appears in the article only inside the boundary walk, as part of a ROAD — \"la strada Monteroni-S. Pietro in Lama-Lequile\" — which is the same failure as \"Ulea\", a river, in the Bullas pliego. It is entirely enclosed by members, so the filled interior ring had hidden the error on the map: removing it from the list alone would have changed nothing. Now 6, with the 8.1 km2 hole open, plus a second 0.4 km2 ring over a protrusion of Leverano."],
  "sicily/Etna": ["corrected",
    "Was 21. Article 3 of the national disciplinare names 20 comuni and Paterno is not one of them: Ragalna was split off from Paterno in 1985 and took the Etna-facing territory, and the current text lists Ragalna in its place. Our list carried both, the old membership and the new. The EU single document still shows the pre-1985 list, which is why the audit now reports the reverse difference — the register's summary is the stale side here. Now 20."],
  "campania/vesuvio": ["confirmed",
    "Massa di Somma was split from San Sebastiano al Vesuvio in 1988, after the zone text was written; the zone names San Sebastiano al Vesuvio. The footprint was rebuilt for a different reason: the union leaves a 0.2 km2 hole, 1.8% of Pomigliano d'Arco, which is not a member and which Sant'Anastasia and its neighbours wrap around. The old artifact dropped that interior ring and so showed the land inside the zone."],
  "puglia/castel-del-monte": ["confirmed",
    "Article 3 takes Minervino Murge whole, nine comuni in part, and of Binetto only \"completamente l'isola amministrativa D'Ameli\" — its detached exclave, not its main territory. The rest of Binetto is therefore correctly absent from the list, and 16.1% of it -- 2.8 km2 enclosed by Bitonto, Palo del Colle and Toritto -- was being filled in by the old artifact's dropped interior ring. Rebuilt with that hole open; the D'Ameli exclave itself is not separately represented."],
  "emilia-romagna/colli-bolognesi-pignoletto": ["confirmed",
    "Valsamoggia is the 2014 merger of Bazzano, Castello di Serravalle, Crespellano, Monteveglio and Savigno; the zone names Crespellano, Bazzano, Castello di Serravalle and Monteveglio. Savignano sul Panaro is named too, expressly \"della provincia di Modena\"."],
  "emilia-romagna/gutturnio": ["confirmed",
    "Alta Val Tidone is the 2018 merger of Caminata, Nibbiano and Pecorara; the zone names Nibbiano."],
  "lombardia/Oltrepò Pavese": ["confirmed",
    "Colli Verdi is the 2019 merger of Canevino, Ruino and Valverde; the zone names Canevino and Ruino."],
  "trentino/Trentino": ["confirmed",
    "The zone states 72 comuni viticoli of the province of Trento. Trentino's 2015-16 merger wave cut the province from 217 comuni to 166, so 66 modern comuni covering 72 historic ones is the expected shape, not a shortfall."],
  "lombardia/Moscato di Scanzo": ["source_artifact",
    "\"Martinengo\" in the zone text is Via F. Martinengo, a street in the boundary description of Scanzorosciate, which happens to share its name with a Bergamo comune. The same failure mode as \"Ulea\" — a river — in the Bullas pliego, and as \"S. Pietro in Lama\" in the Copertino disciplinare. Our single-comune list is right."],
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
    "The single document is the EU's summary, not the national disciplinare: it compresses partial inclusions and can lag the national text by decades (the Etna document still shows the pre-1985 comune list). Where the two disagree the national disciplinare governs. fetch-italy-disciplinari.mjs pulls the current ones from MASAF for reading by hand.",
  run_on: new Date().toISOString().slice(0, 10),
};

let ok = 0, artifact = 0, confirmed = 0, corrected = 0, open = 0, unlisted = [];
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
  else if (verdict === "corrected") corrected++;
  else open++;
}

await writeFile(MEMBERSHIP, `${JSON.stringify(membership, null, 2)}\n`);
console.log(`${MEMBERSHIP}: ${ok} match the zone text, ${confirmed} differ for a documented reason, `
  + `${artifact} differ because the EU document is wrong, ${corrected} were wrong and are corrected, ${open} open.`);
if (unlisted.length) {
  console.log(`\n${unlisted.length} flagged but not in the RESOLVED table — written through as "open":`);
  unlisted.forEach((k) => console.log(`  ${k}`));
}
