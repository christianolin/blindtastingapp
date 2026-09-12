// Audit the recovered Italian comune membership against the EU's own record of
// each denomination's delimited zone.
//
// The Italian equivalent of audit-spain-pliegos.mjs. That audit found seven
// wrong DOs in Spain, three of them a name lifted from descriptive text — a
// river, a pedanía, a unidad poblacional — matched against the municipality
// register. Italy had no equivalent check: until italy-doc-membership.json
// existed there was nothing to check.
//
// SOURCE. eAmbrosia, the EU register of geographical indications, which
// publishes a documented API at https://webgate.ec.europa.eu/eambrosia-api/.
// The first attempt used catalogoviti.politicheagricole.it; that endpoint
// serves only ~75 denominations, covering 8 of our 61 footprints, and probing
// its id band from 1000 to 5000 turned up nothing more. eAmbrosia returns all
// 522 registered Italian wine GIs in a single call.
//
// The chain:
//   1. POST  {REGISTER}/gi-applications/filter
//        -> every Italian wine GI, with appUniqueId and protectedName. Cached;
//           --refresh re-fetches. The payload shape was taken from the register
//           UI, which ignores the body unless it uses these fields.
//   2. GET   {REGISTER}/gi-applications/id/{appUniqueId}
//        -> singleDocTechFile[{ uri: "<attachmentId>" }]. The register's own
//           detail endpoint carries this where the documented v1 endpoint
//           returns singleDocument: null.
//   3. GET   {API}/attachments/{attachmentId}
//        -> the fascicolo tecnico as a PDF, via the documented download route.
//
// WHAT THE SOURCE IS, PRECISELY. The attachment is the single document / technical
// file, not the national disciplinare. Its own section 7 links to the full
// disciplinare on politicheagricole.it, but those ServeBLOB links are dead —
// the site was reorganised — and productSpecificationLink on the API record
// mostly points at a generic landing page. So the delimited zone as the EU
// records it is what is checkable here, and section 5 states it in one of three
// shapes. Each shape supports a different check, and the script classifies
// before it diffs rather than diffing everything the same way:
//
//   ENUMERATED  "comprende i terreni di parte dei territori dei seguenti
//               comuni: Biancavilla, S. Maria di Licodia, ..."  (Etna)
//               -> two-way name diff against our list.
//   WHOLE_PROV  "comprende l'intero territorio della provincia di Trapani,
//               esclusi i comuni di Pantelleria, Favignana ed Alcamo." (Marsala)
//               -> every comune of ours must sit in that province and must not
//                  be one of the named exclusions. No enumeration to diff.
//   COUNTED     "comprende 72 Comuni viticoli della provincia di Trento ..."
//               (Trentino) -> compare the stated count to ours, and check the
//               province the same way.
//
// The province check is the cheap, strong one, and it is precisely the failure
// mode the Spanish audit kept finding: every false inclusion there was a name
// scraped from prose that landed outside the denomination's own provinces.
//
// WHAT THIS DOES NOT DECIDE. Everything below is a candidate for a human to
// judge, not a patch. A zone article names neighbouring comuni when describing
// where a boundary runs, which is how "Ulea" — a river in the Bullas pliego —
// became a false member in Spain. The single document also abbreviates ("S.
// Venerina", "Piedimonte" for Piedimonte Etneo), so a name matched only by its
// short form is reported separately rather than silently accepted. And where a
// zone is delimited by ridgelines and contour heights, as the Alentejo Portaria
// is, no text diff reaches it at all.
//
// Requires pdftotext on PATH (poppler).
//
// Usage: node scripts/wine-map-sources/audit-italy-disciplinari.mjs [--only <substr>] [--refresh]
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const WORK = path.resolve(".tiles-build", "italy-audit");
const INDEX = path.join(WORK, "eambrosia-it-wine.json");
const MEMBERSHIP = "data/wine-map/italy-doc-membership.json";
const COMUNI = ".tiles-build/sicily/it-comuni.geojson";
const REGISTER =
  "https://ec.europa.eu/geographical-indications-register/eambrosia-public-api/api";
const API = "https://webgate.ec.europa.eu/eambrosia-api/api/v1";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) blindtasting-wine-map/1.0";

// Sub-denominations that the register files under their parent name only.
// The Valle d'Aosta DOC carries its geographical sub-denominations (Donnas,
// Blanc de Morgex et de La Salle, Arnad-Montjovet, ...) inside one record.
const PARENT = {
  "valle-d-aosta/donnas": "Valle d'Aosta",
  "valle-d-aosta/blanc-de-morgex-et-de-la-salle": "Valle d'Aosta",
};

const argv = process.argv.slice(2);
const only = argv.includes("--only") ? argv[argv.indexOf("--only") + 1] : null;
const refresh = argv.includes("--refresh");

const strip = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const norm = (s) => strip(s).replace(/[^a-z0-9]/g, "");
// Keep punctuation and newlines when normalising a block: they delimit an
// enumeration, and stripping them lets substrings match (the Spanish audit
// matched "Tabara" inside "Faramontanos de Tabara" before this was fixed).
const normBlock = (s) =>
  strip(s).replace(/[^a-z0-9,;:.()\n ]/g, " ").replace(/[ \t]+/g, " ");
// A name as a regex fragment: whitespace-tolerant across line wraps, and
// tolerant of the way the document abbreviates saints — "S. Venerina" for
// Santa Venerina, "Aci S. Antonio" for Aci Sant'Antonio.
// It is also loose about the connectives inside a compound name, which the
// documents drop or swap freely: "Montefiore Aso" for Montefiore dell'Aso,
// "Castrocaro Terme-Terra del Sole" for Castrocaro Terme e Terra del Sole.
// And about two further habits of Italian toponymy that the documents and the
// ISTAT register disagree on constantly:
//   - the older orthography writes i as j — "San Giorgio Jonico" for San
//     Giorgio Ionico, "Bajardo" for Baiardo;
//   - a qualifier fuses to its head word — "Montecompatri" for Monte Compatri,
//     "Castelgandolfo" for Castel Gandolfo. Only the handful of head words this
//     actually happens to are made fusible, rather than letting any two tokens
//     run together, which would let one name match inside a longer one.
const SAINT = "(?:s{1,2}\\.?|san|sant'?|santa|santo|santi)";
const LINK = /^(?:dell'|della|delle|degli|dei|del|di|d'|al|alla|allo|agli|alle|in|sul|sulla|sui|nel|nella|e)$/;
const FUSES = /^(?:castel|monte|san|corte|borgo|rocca|torre|pieve|casal|porto|poggio|serra|villa)$/;
const ij = (s) => s.replace(/[ij]/g, "[ij]");
const frag = (s) => {
  const parts = strip(s).replace(/[^a-z0-9' ]/g, " ")
    // Split the elided article off so it can be made optional on its own:
    // "dell'Aso" -> "dell'" + "Aso". Sant' is left joined; it is part of the name.
    .replace(/\b(d|dell|dall|all|nell|sull)'/g, "$1' ")
    .trim().split(/\s+/).filter(Boolean)
    .map((w) => {
      const m = w.match(/^(?:sant'|santa|santo|santi|san)(.*)$/);
      const rest = ij(m ? m[1] : w).replace(/'/g, "\\s*'?\\s*");
      if (m) return { pat: `${SAINT}\\s*${rest}`, optional: false, fuses: true };
      return { pat: rest, optional: LINK.test(w), fuses: FUSES.test(w) };
    });
  let out = "";
  parts.forEach((p, i) => {
    const sep = i === 0 ? "" : parts[i - 1].fuses ? "\\s*" : "\\s+";
    out += p.optional ? `(?:${sep}${p.pat})?` : `${sep}${p.pat}`;
  });
  return out;
};
const DELIM = "(?:^|[,;:.()]|\\be\\b|\\bed\\b|\\n)";
// A list item ends at punctuation, a conjunction, or the preposition that
// starts a trailing qualifier — "... e Viddalba in Provincia di Sassari".
// Deliberately excludes del/della/nel/in and the rest of the prepositions that
// CONTINUE an Italian toponym — "Appignano del Tronto", "Montagna in
// Valtellina" — since treating those as terminators makes every such name
// match its own head. "in" is the one exception, kept because a zone routinely
// closes an item with it ("Viddalba in Provincia di Sassari"); the
// longer-name guard below is what stops it matching a head.
const END = "(?:$|[,;:.()\\n]|\\b(?:e|ed|in|nonche|con|per|tutt\\w|sino|fino|ricadent\\w*)\\b)";
const item = (name) => new RegExp(`${DELIM}\\s*${frag(name)}\\s*${END}`);

const curl = (args) =>
  execFileSync("curl", ["-sL", "-A", UA, ...args], { stdio: "pipe", maxBuffer: 64 << 20 });

await mkdir(WORK, { recursive: true });

// ---- 1. the register index -------------------------------------------------
let register;
if (!refresh && existsSync(INDEX)) {
  register = JSON.parse(await readFile(INDEX, "utf8"));
} else {
  const filters = {
    geographicalIndicatorTypeId: [], qualityProductTypeId: ["1"], countryAreaId: [],
    countryId: ["it"], applicationTypeId: [], statusId: ["4"],
    protectedName: null, fileName: null, producerGroupName: null, cnCode: null,
  };
  const body = {
    cnCode: [], cnCodes: [], registerId: 1, lang: "en",
    sortField: "protectedName", sortOrder: 1, first: 0, rows: 2000,
    filters: Object.entries(filters).map(([fieldName, fieldValue]) => ({ fieldName, fieldValue })),
  };
  const bodyPath = path.join(WORK, "_filter-body.json");
  await writeFile(bodyPath, JSON.stringify(body));
  register = JSON.parse(
    curl(["-X", "POST", "-H", "Content-Type: application/json",
      "--data-binary", `@${bodyPath}`, `${REGISTER}/gi-applications/filter`]).toString("utf8"),
  ).results;
  await writeFile(INDEX, JSON.stringify(register, null, 1));
  console.log(`register: ${register.length} Italian wine GIs cached`);
}
// protectedName carries slash-separated synonyms — "Carso / Carso - Kras",
// "Cesanese del Piglio / Piglio" — and our slugs use either side.
const byName = new Map();
const byTokens = new Map();
for (const r of register) {
  for (const syn of String(r.protectedName).split("/")) {
    const k = norm(syn);
    if (k && !byName.has(k)) byName.set(k, r);
  }
}

// ---- 2. our membership, and the ISTAT gazetteer ----------------------------
const membership = JSON.parse(await readFile(MEMBERSHIP, "utf8"));
const comuni = JSON.parse(await readFile(COMUNI, "utf8"));
const comuniByRegion = new Map();
const provinceOf = new Map();
const allProvinces = new Set();
for (const f of comuni.features) {
  const p = f.properties;
  if (!comuniByRegion.has(p.reg_name)) comuniByRegion.set(p.reg_name, []);
  comuniByRegion.get(p.reg_name).push(p.name);
  provinceOf.set(norm(p.name) + "|" + p.reg_name, p.prov_name);
  allProvinces.add(p.prov_name);
}

// Word-set key, so a slug matches a register name that orders the words the
// other way: "montepulciano-d-abruzzo-colline-teramane" is registered as
// "Colline Teramane Montepulciano d'Abruzzo".
const tokenKey = (s) => strip(s).replace(/[^a-z0-9 ]/g, " ").split(/\s+/)
  .filter((w) => w.length > 1).sort().join(" ");
for (const r of register) {
  for (const syn of String(r.protectedName).split("/")) {
    const k = tokenKey(syn);
    if (k && !byTokens.has(k)) byTokens.set(k, r);
  }
}

// "montefalco-sagrantino" -> denomination names to try, most specific first.
// Truncation is the last resort: a sub-denomination is often filed under its
// base name (Montefalco Sagrantino lives inside the MONTEFALCO record), but a
// truncated match means the document describes a LARGER zone than our
// footprint, so the caller marks it and skips the enumeration diff.
const lookupNames = (key) => {
  const spaced = key.split("/")[1].replace(/-/g, " ");
  const w = spaced.split(" ");
  const truncated = PARENT[key] ? [PARENT[key]] : [];
  for (let i = w.length - 1; i >= 1; i--) truncated.push(w.slice(0, i).join(" "));
  return { exact: [spaced], truncated };
};

// ---- 3. the single document for one denomination ---------------------------
function singleDocument(rec) {
  const txt = path.join(WORK, `doc_${rec.appUniqueId}.txt`);
  if (existsSync(txt)) return readFile(txt, "utf8");
  const detail = JSON.parse(
    curl([`${REGISTER}/gi-applications/id/${rec.appUniqueId}?lang=en`]).toString("utf8"));
  const att = (detail.singleDocTechFile ?? [])[0]?.uri;
  if (!att) return null;
  const pdf = path.join(WORK, `doc_${rec.appUniqueId}.pdf`);
  curl([`${API}/attachments/${att}`, "-o", pdf]);
  execFileSync("pdftotext", ["-layout", "-enc", "UTF-8", pdf, txt], { stdio: "pipe" });
  return readFile(txt, "utf8");
}

// Section 5 of the technical file, stopping at section 6 so the grape list and
// the link-with-area prose do not leak in.
const zoneSection = (text) => {
  const i = text.search(/zona\s+delimitata/i);
  const from = i >= 0 ? text.slice(i) : text;
  const j = from.search(/\n\s*6\.\s*VITIGNI/i);
  return normBlock(j > 0 ? from.slice(0, j) : from.slice(0, 9000));
};

// Which shape the zone statement takes. Order matters: a statement can both
// give a count and name a province, and the count is the more specific claim.
const classify = (block) => {
  const counted = block.match(/(\d{1,3})\s+comuni/);
  if (counted) return { shape: "COUNTED", stated: Number(counted[1]) };
  if (/intero territorio (?:amministrativo )?d(?:ella|elle|el|i)\s+(?:provinc|regione)/.test(block))
    return { shape: "WHOLE_PROV" };
  // "comprende del tutto o in parte i comuni della sponda retica partendo dal
  // comune di Buglio sino al comune di Tirano" (Valtellina Superiore). A zone
  // written as a traverse between two endpoints has no list to diff, and
  // pretending otherwise reports every member as missing.
  if (/partendo dal comune|sino al comune|fino al comune/.test(block))
    return { shape: "NARRATIVE" };
  return { shape: "ENUMERATED" };
};

// Provinces the zone statement itself names. Containment in them is the cheap,
// strong check: every false inclusion the Spanish audit found was a name
// scraped from prose that landed outside the denomination's own provinces.
//
// It is only applied when the named provinces are ones this gazetteer knows.
// Italian provincial geography has been reorganised repeatedly — Olbia-Tempio
// was abolished in 2016 and the ISTAT extract now files Gallura comuni under
// "Gallura Nord-Est Sardegna" — so a document naming "Provincia di
// Olbia-Tempio" would otherwise report all 22 of its own comuni as out of area.
const zoneProvinces = (block) => {
  const named = new Set();
  let unresolved = false;
  // Match only the lead-in and read the name out of the text that follows, so
  // one mention cannot swallow the next. A capture group here is greedy across
  // spaces and hyphens, and "... della provincia di Bologna e Savignano sul
  // Panaro della provincia di Modena" then yields Bologna alone.
  for (const m of block.matchAll(/provinc\w*\s+(?:di|del|della|delle|dei)?\s*/g)) {
    const cand = block.slice(m.index + m[0].length, m.index + m[0].length + 40).trim();
    const hit = [...allProvinces].filter((p) => new RegExp(`^${frag(p)}\\b`).test(cand));
    if (hit.length) hit.forEach((p) => named.add(p));
    else unresolved = true;
  }
  // Even one province this gazetteer cannot place makes the whole containment
  // test unsafe: the zone may well be defined partly by that province, and
  // every member of it would read as out of area. Decline rather than guess.
  return unresolved ? null : named;
};

// Names following a lead phrase, up to the end of the sentence:
//   "... esclusi i comuni di Pantelleria, Favignana ed Alcamo."
//   "... e in parte i territori dei comuni di Melissa e Crucoli."
//   "... e parte di Ascoli Piceno, Colli del Tronto, Campofilone, ..." (Offida)
const listAfter = (block, lead) => {
  const out = new Set();
  for (const m of block.matchAll(new RegExp(`${lead}[^.]{0,800}`, "g"))) {
    const seg = m[0].replace(/^[\s\S]*?(?:comun[ei](?:\s+di)?|parte\s+di)/, "");
    for (const n of seg.split(/,|\be\b|\bed\b/)) {
      const t = n.trim().replace(/[.;:()]/g, "").trim();
      if (t.length >= 4 && t.split(/\s+/).length <= 5) out.add(t);
    }
  }
  return [...out];
};
const PARTIAL_LEAD = "(?:in parte i(?:l)? territor[io]|\\bparte\\s+di\\b)";

// ---- 4. diff ---------------------------------------------------------------
const findings = [];
const targets = Object.entries(membership.footprints).filter(([k]) => !only || k.includes(only));
console.log(`auditing ${targets.length} footprint(s)\n`);

for (const [key, fp] of targets) {
  const { exact, truncated } = lookupNames(key);
  let rec = null, widerZone = false;
  for (const cand of exact) {
    rec = byName.get(norm(cand)) ?? byTokens.get(tokenKey(cand)) ?? null;
    if (rec) break;
  }
  if (!rec) {
    for (const cand of truncated) {
      rec = byName.get(norm(cand)) ?? byTokens.get(tokenKey(cand)) ?? null;
      if (rec) { widerZone = true; break; }
    }
  }
  if (!rec) {
    findings.push({ key, status: "NOT_IN_REGISTER" });
    console.log(`${key}\n  !! no GI matched in the register\n`);
    continue;
  }

  let text = null;
  try { text = await singleDocument(rec); } catch { text = null; }
  if (!text) {
    findings.push({ key, status: "NO_SINGLE_DOCUMENT", appUniqueId: rec.appUniqueId, name: rec.protectedName });
    console.log(`${key}  (${rec.protectedName})\n  !! no single document attached to the register record\n`);
    continue;
  }

  const block = zoneSection(text);
  const { shape, stated } = classify(block);
  const provs = zoneProvinces(block);
  const ourNames = new Set(fp.comuni.map((c) => norm(c.name)));

  // The province check, valid under every shape: a member outside the provinces
  // the zone statement names is wrong however the zone is expressed. Skipped
  // when the zone names provinces this gazetteer's vintage does not know.
  const outOfProvince = provs && provs.size
    ? fp.comuni.map((c) => c.name)
      .filter((n) => { const p = provinceOf.get(norm(n) + "|" + fp.region); return p && !provs.has(p); })
    : [];
  const excluded = listAfter(block, "esclus\\w+\\s+i\\s+comuni").filter((n) => ourNames.has(norm(n)));
  const partials = listAfter(block, PARTIAL_LEAD);
  const isPartial = (n) => partials.some((p) => new RegExp(`^${frag(n)}\\b`).test(p));

  // Enumeration diff, only where there is an enumeration to diff against, and
  // only where the record describes this footprint's own zone. A record matched
  // by truncating the slug covers a wider denomination — the Valle d'Aosta DOC
  // record lists all 33 of its comuni, which says nothing about the Donnas
  // sub-denomination's 4.
  let missing = [], unnamed = [], shortForm = [];
  if (shape === "ENUMERATED" && !widerZone) {
    // A shorter comune name can sit inside a longer one that is the real
    // member, as a head ("Appignano" in "Appignano del Tronto") or as a tail
    // ("Serino" in "Santa Lucia di Serino"). Before testing a candidate, blank
    // out every longer comune name of the region that contains it, so only an
    // occurrence standing on its own can match. This is the Spanish "Cea from
    // Santa María del Monte de Cea" case, and it reaches it from either side.
    const regionPool = [...new Set(comuniByRegion.get(fp.region) ?? [])];
    const mask = (name) => regionPool.reduce((acc, other) =>
      other !== name && norm(other).includes(norm(name))
        ? acc.replace(new RegExp(frag(other), "g"), (s) => " ".repeat(s.length))
        : acc, block);
    for (const name of regionPool) {
      const nn = norm(name);
      if (nn.length < 5 || ourNames.has(nn) || allProvinces.has(name) || isPartial(name)) continue;
      if (item(name).test(mask(name))) missing.push(name);
    }
    for (const n of fp.comuni.map((c) => c.name)) {
      // Bilingual comuni are hyphenated in the ISTAT extract and given in one
      // language by the document: "Duino Aurisina-Devin Nabrezina", "San
      // Floriano del Collio-Steverjan".
      if (n.split("-").some((half) => new RegExp(frag(half)).test(block))) continue;
      // The document also truncates: "Piedimonte" for Piedimonte Etneo,
      // "Castiglione" for Castiglione di Sicilia, "Zafferana" for Zafferana
      // Etnea. Accepting a prefix outright would hide a false inclusion, so a
      // name matched only this way is reported apart from a clean match.
      const w = n.split(/\s+/);
      const short = w.slice(0, -1)
        .map((_, i) => w.slice(0, w.length - 1 - i).join(" "))
        .some((h) => h.length >= 5 && item(h).test(block));
      (short ? shortForm : unnamed).push(n);
    }
  }

  const countMismatch = shape === "COUNTED" && stated !== fp.comuni.length ? stated : null;
  const flagged = outOfProvince.length || excluded.length || missing.length
    || unnamed.length || countMismatch !== null;
  const status = widerZone && shape === "ENUMERATED" ? "PARENT_RECORD_ONLY"
    : flagged ? "REVIEW" : "ok";

  findings.push({
    key, status, shape, appUniqueId: rec.appUniqueId, name: rec.protectedName,
    ours: fp.comuni.length, stated: stated ?? null,
    provinces: provs ? [...provs] : null, outOfProvince, excluded, missing, unnamed, shortForm, partials,
  });
  console.log(`${key}  (${rec.protectedName}, ${shape}, ${fp.comuni.length} comuni)`);
  if (outOfProvince.length) console.log(`  !! ours, but outside the zone's provinces:  ${outOfProvince.join(", ")}`);
  if (excluded.length) console.log(`  !! ours, but the zone explicitly excludes:   ${excluded.join(", ")}`);
  if (countMismatch !== null) console.log(`  !! zone states ${countMismatch} comuni, we have ${fp.comuni.length}`);
  if (missing.length) console.log(`  ?? enumerated in the zone, not in our list:  ${missing.join(", ")}`);
  if (unnamed.length) console.log(`  ?? in our list, not in the enumeration:      ${unnamed.join(", ")}`);
  if (partials.length) console.log(`  ~~ zone admits only "in parte":              ${partials.join(", ")}`);
  if (shortForm.length) console.log(`  .. matched only by short form:               ${shortForm.join(", ")}`);
  if (status === "PARENT_RECORD_ONLY")
    console.log(`  -- only the parent record is registered; its zone is wider, so no diff is possible here`);
  else if (status === "ok") console.log("  zone statement and our list agree");
  console.log("");
}

await writeFile(path.join(WORK, "findings.json"), JSON.stringify(findings, null, 2));
const n = (s) => findings.filter((f) => f.status === s).length;
console.log(`\n${findings.length} audited: ${n("ok")} agree, ${n("REVIEW")} need review, `
  + `${n("PARENT_RECORD_ONLY")} not separately registered, `
  + `${n("NOT_IN_REGISTER") + n("NO_SINGLE_DOCUMENT")} unresolved.`);
