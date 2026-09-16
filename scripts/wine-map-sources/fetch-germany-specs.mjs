// Cache the German wine PDO product specifications from eAmbrosia and extract
// the Gemeinde list each one delimits its Anbaugebiet with.
//
// WHY THIS SOURCE. German wine law does not enumerate the regions itself.
// BayWeinRAV § 1 is explicit -- "Das Gebiet von geschützten geografischen
// Herkunftsangaben ist über die Produktspezifikation abzugrenzen" -- and the
// other states delegate the same way. The Produktspezifikation is what the EU
// register holds, so eAmbrosia is not a convenience here, it is where the
// delimitation legally lives.
//
// That makes one source serve every German region, which the alternatives do
// not. Hessen's came from a Regierungspräsidium Darmstadt info sheet; it was
// correct but bespoke, and no other state publishes an equivalent. This
// register covers all 46 German wine GIs uniformly and needs nobody's
// permission.
//
// It also dissolves the Baden-Württemberg blocker. Those two Anbaugebiete were
// written off because the LGRB Weinbauatlas is "zum Teil kostenpflichtig" under
// its AGB -- but LGRB is only needed for LGRB's own Weinlagen layer. The
// Gemeinden come from here and the vineyard land from LGL's open ATKIS, so
// LGRB is not involved at all.
//
// WHAT THE TEXT SAYS, AND WHAT IT DOES NOT. Section 5, "ABGEGRENZTES GEBIET",
// lists Gemeinden grouped by Landkreis, and qualifies them: the zone is those
// Gemeinden' planted and temporarily unplanted vineyard areas "wenn ihre
// Eignung zur Erzeugung von Qualitätswein festgestellt wird" -- where
// suitability for quality wine has been established. So the Gemeinde is the
// containment parent, never the zone. build-germany-weinbau.mjs clips to the
// ATKIS vineyard class for exactly that reason, the same as Hessen.
//
// Usage: node scripts/wine-map-sources/fetch-germany-specs.mjs [--refresh]
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const WORK = path.resolve(".tiles-build", "sources", "germany-specs");
const REGISTER =
  "https://ec.europa.eu/geographical-indications-register/eambrosia-public-api/api";
const ATTACHMENTS = "https://webgate.ec.europa.eu/eambrosia-api/api/v1/attachments";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) blindtasting-wine-map/1.0";
const OUT = "data/wine-map/germany-weinbau-membership.json";

// The Anbaugebiete this repo does not already hold. Mosel, Rheinhessen, Pfalz,
// Nahe, Ahr and Mittelrhein come from the Rheinland-Pfalz Weinbergsrolle, which
// is a LEGAL boundary and strictly better than a land-use clip; Rheingau and
// Hessische Bergstraße are already built from the Hessen info sheet. Rebuilding
// any of them from this source would be a downgrade.
const WANTED = {
  Franken: { slug: "franken", states: ["BY"] },
  Baden: { slug: "baden", states: ["BW"] },
  Württemberg: { slug: "wuerttemberg", states: ["BW"] },
  // Brandenburg too: four Gemarkungen of Stadt Werder/Havel, ~90 km detached.
  "Saale-Unstrut": { slug: "saale-unstrut", states: ["ST", "TH", "BB"] },
  Sachsen: { slug: "sachsen", states: ["SN"] },
};

const refresh = process.argv.includes("--refresh");
const curl = (args) =>
  execFileSync("curl", ["-sL", "-A", UA, "-m", "180", ...args], { maxBuffer: 128 << 20 });

await mkdir(WORK, { recursive: true });

// ---- 1. the German wine GI index -------------------------------------------
const indexFile = path.join(WORK, "de-wine-gi.json");
let register;
if (!refresh && existsSync(indexFile)) {
  register = JSON.parse(await readFile(indexFile, "utf8"));
} else {
  const filters = {
    geographicalIndicatorTypeId: [], qualityProductTypeId: ["1"], countryAreaId: [],
    countryId: ["de"], applicationTypeId: [], statusId: ["4"],
    protectedName: null, fileName: null, producerGroupName: null, cnCode: null,
  };
  const body = {
    cnCode: [], cnCodes: [], registerId: 1, lang: "en",
    sortField: "protectedName", sortOrder: 1, first: 0, rows: 500,
    filters: Object.entries(filters).map(([fieldName, fieldValue]) => ({ fieldName, fieldValue })),
  };
  const bodyPath = path.join(WORK, "_filter.json");
  await writeFile(bodyPath, JSON.stringify(body));
  register = JSON.parse(curl(["-X", "POST", "-H", "Content-Type: application/json",
    "--data-binary", `@${bodyPath}`, `${REGISTER}/gi-applications/filter`]).toString("utf8")).results;
  await writeFile(indexFile, JSON.stringify(register, null, 1));
}
console.log(`eAmbrosia: ${register.length} registered German wine GIs`);

// ---- 2. the delimitation section of each wanted spec -----------------------
// "Landkreis Kitzingen: Abtswind, Albertshofen, ..." and the bare
// "Kreisfreie Stadt: Bamberg" that carries no list header of its own.
const GROUP = /^\s*(Landkreis|Kreisfreie Städte?|Stadtkreis|Kreis|Regionalverband|Landeshauptstadt)\b([^:]*):\s*(.*)$/;
const SECTION_START = /^\s*5\.\s*ABGEGRENZTES\s+GEBIET/i;
// Franken's next heading is "6. WEINTRAUBEN", not the "6. WICHTIGSTE
// KELTERTRAUBEN" the others use. Matching only the latter meant the section
// never terminated and the parser swallowed 240 lines of grape names, page
// footers and prose as if they were Gemeinden.
const SECTION_END = /^\s*6\.\s*(WICHTIGSTE|KELTERTRAUBEN|WEINTRAUBEN|KELTERTRAUBENSORTE)/i;
// The PDF repeats a running footer mid-list; it is not part of the enumeration.
const FOOTER = /^TECHNISCHE UNTERLAGE|Aktenzeichen:|^Seite \d/i;
// Regierungsbezirk headings group the Kreise beneath them and name no Gemeinde
// of their own.
const BEZIRK = /^Regierungsbezirk\b/i;

// The specifications do not share a format. Four shapes turned up across the
// five regions, and only the first two yield a usable place list:
//
//   KREIS_GROUPED  Franken. "Landkreis Kitzingen: Abtswind, Albertshofen, ..."
//                  grouped under Regierungsbezirk headings.
//   FLAT_LIST      Baden, Württemberg. "die Rebflächen folgender Gemeinden und
//                  Gemarkungen:" then one long comma-separated run. It mixes
//                  Gemeinden with GEMARKUNGEN -- sub-municipal cadastral
//                  districts -- so a share of the names will not resolve
//                  against a Gemeinde register and must be carried as-is.
//   KREIS_ONLY     Saale-Unstrut. Names LANDKREISE, not Gemeinden, and says the
//                  Gemarkungen are "detailliert in der Produktspezifikation
//                  aufgeführt" -- i.e. not here. Clipping vineyard land to the
//                  named Kreise is still exact, because the text is literally
//                  "Rebflächen in den Landkreisen ...".
//   NARRATIVE      Sachsen. Metes and bounds, road by road: "Von Merschwitz
//                  elbaufwärts bis Niederlommatzsch. Von da die Straße über
//                  Niedermuschütz nach Zehren ..." with no place list at all.
//                  Nothing to resolve; this one cannot be built from the
//                  specification and is reported rather than guessed at.
// Baden closes this lead with a colon and Württemberg with a full stop. Same
// sentence, same register, same year -- requiring the colon silently dropped
// Württemberg entirely and reported it as UNPARSED.
const FLAT_LEAD = /Rebflächen\s+folgender\s+Gemeinden\s+und\s+Gemarkungen\s*[.:]/i;
const KREIS_ONLY_LEAD = /Rebflächen\s+in\s+den\s+Landkreisen/i;
const NARRATIVE_HINT = /elbaufwärts|die\s+Straße\s+über|stadteinwärts|Hangkante/i;

// The FLAT_LIST path joins the section's lines into one body before splitting on
// commas, so the line-based FOOTER filter above never sees them. Two things
// therefore have to be handled on the joined text.
//
// PAGE HEADER. "TECHNISCHE UNTERLAGE 16 /21 Aktenzeichen: PDO-DE-A1264" is
// printed mid-list and carries no comma, so the split glued it to whatever name
// followed: Baden lost "Waldenhausen" and Württemberg lost "Sternenfels" inside
// a header string. Replacing it with a comma both removes it and frees the name.
const PAGE_HEADER =
  /TECHNISCHE\s+UNTERLAGE\s*\d+\s*\/\s*\d+\s*Aktenzeichen:\s*\S+/gi;

// LIST END. The enumeration closes with "<letzter Ort>. Die genaue Abgrenzung
// dieser Rebflächen ergibt sich aus ..." and the prose after it is full of
// commas. Splitting through it produced sentence fragments as place names and,
// because the last name shares its full stop with that closing sentence, ate
// Baden's "Zunzingen" and Württemberg's "Zuffenhausen" with it.
const LIST_END = /Die\s+genaue\s+Abgrenzung/i;

// OTHER BUNDESLAND. Württemberg's §4.2 extends the Anbaugebiet into Bavaria:
// "Die Gemarkungen Hoyren und Aeschach der Großen Kreisstadt Lindau, die
// Gemeinden Nonnenhorn und Wasserburg." Baden has no equivalent. Left unparsed
// this is not merely missing -- it is four places on the Bavarian Bodensee
// shore absent from a region the register says includes them, and the state
// list would read "BW" for a region that is not only in BW.
const OTHER_STATE =
  /Im\s+Bundesland\s+(Bayern|Rheinland-Pfalz|Hessen|Sachsen|Thüringen|Brandenburg|Sachsen-Anhalt|Saarland)\s*:/i;
const ANNEX_GEMARKUNGEN =
  /Die\s+Gemarkungen\s+([^.]+?)\s+der\s+(?:Großen\s+)?(?:Kreisstadt|Stadt|Gemeinde)\s+([-\wÄÖÜäöüß]+)/i;
const ANNEX_GEMEINDEN = /die\s+Gemeinden\s+([^.]+?)\./i;

function sectionLines(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => SECTION_START.test(l));
  if (start < 0) return null;
  let end = lines.findIndex((l, i) => i > start && SECTION_END.test(l));
  if (end < 0) end = Math.min(lines.length, start + 240);
  return lines.slice(start + 1, end)
    // The PDFs carry SOFT HYPHENS, which pdftotext renders as ¬ (U+00AC).
    // Left in, "Bur¬gen¬land-kreis" is not a place name and resolves to
    // nothing. They are typographic, never part of the name.
    .map((l) => l.replace(/¬/g, ""))
    .map((l) => l.replace(/\s+/g, " ").trim());
}

// A word broken across a line break rejoins: "...Landkreisen Burgenland-" +
// "kreis, Harz..." is one Kreis and two others, not three fragments.
//
// The negative lookahead is not optional. German suspends a shared stem with a
// trailing hyphen -- "Ober- und Unterbalbach" is two Gemarkungen -- and
// joining that pair yields "Oberund", destroying both.
function dehyphenate(body) {
  return body
    .replace(/(\p{L})-\s+(?!und\b|oder\b|bzw\b|sowie\b|bis\b)(\p{Ll})/gu, "$1$2")
    // "der Stadt Werder/" + "Havel" is one name broken at the slash.
    .replace(/\/\s+(?=\p{Lu})/gu, "/");
}

function parseSection(text) {
  const lines = sectionLines(text);
  if (!lines) return { shape: "NO_SECTION" };
  const body = dehyphenate(lines.join(" "));

  if (NARRATIVE_HINT.test(body) && !FLAT_LEAD.test(body)) {
    return { shape: "NARRATIVE", places: [] };
  }

  if (KREIS_ONLY_LEAD.test(body)) {
    // Saale-Unstrut is delimited at three different levels in one sentence, and
    // flattening them loses what each one means:
    //
    //   Landkreise        five in Sachsen-Anhalt, five in Thüringen
    //   kreisfreie Städte Jena and Erfurt
    //   Ortsteile         Schöndorf and Tiefurt, within Weimar
    //   Gemarkungen       Werder/Havel, Phöben, Plessow and Neu Töplitz, in
    //                     Brandenburg, ~90 km from the rest of the region
    //
    // The last two are sub-municipal, so their own boundaries are cadastral
    // rather than administrative. They are captured separately and NOT mixed
    // into the Kreis list, because clipping to a Kreis and clipping to an
    // Ortsteil are different claims.
    const kreise = [];
    for (const m of body.matchAll(/Landkreisen\s+([^.]+?)(?:\s+des\s+Landes|\s+in\s+[A-ZÄÖÜ]|,\s*in\s|\.|$)/g)) {
      kreise.push(...splitNames(m[1], "Landkreis", true).map((g) => g.name));
    }
    const staedte = [...body.matchAll(/kreisfreien\s+Städten\s+([^.]+?)(?:\.|$)/g)]
      .flatMap((m) => splitNames(m[1], "Stadt", true).map((g) => g.name));
    const ortsteile = [...body.matchAll(/in\s+([A-ZÄÖÜ][\wäöüß-]*)\s+in\s+den\s+Ortsteilen\s+([^.]+?)(?:\s+sowie|\.|$)/g)]
      .flatMap((m) => splitNames(m[2], m[1], true).map((g) => ({ name: g.name, within: m[1] })));
    const gemarkungen = [...body.matchAll(/Gemarkungen\s+([^.]+?)\s+der\s+Stadt\s+([^,.]+?)\s+im\s+Landkreis/g)]
      .flatMap((m) => splitNames(m[1], m[2], true).map((g) => ({ name: g.name, within: m[2].trim() })));
    return {
      shape: "KREIS_ONLY",
      places: [...new Set([...kreise, ...staedte])],
      ortsteile, gemarkungen,
      level: "kreis",
    };
  }

  if (FLAT_LEAD.test(body)) {
    const after = body.slice(body.search(FLAT_LEAD)).replace(FLAT_LEAD, "");
    // Header out first -- it frees the name it was glued to -- then cut at the
    // sentence that closes the enumeration. Both before any comma split.
    const cleaned = after.replace(PAGE_HEADER, ", ");
    const endAt = cleaned.search(LIST_END);
    const listPart = endAt < 0 ? cleaned : cleaned.slice(0, endAt);
    const places = splitNames(listPart, null).map((g) => g.name);

    // An annex, where the specification has one, sits in the prose AFTER the
    // list and names places in another Bundesland.
    const rest = endAt < 0 ? "" : cleaned.slice(endAt);
    const annexState = rest.match(OTHER_STATE)?.[1] ?? null;
    const annex = [];
    if (annexState) {
      const tail = rest.slice(rest.search(OTHER_STATE));
      const gk = tail.match(ANNEX_GEMARKUNGEN);
      if (gk) {
        for (const n of splitNames(gk[1], null, true).map((g) => g.name)) {
          annex.push({ name: n, within: gk[2], level: "gemarkung", state: annexState });
        }
      }
      const gm = tail.match(ANNEX_GEMEINDEN);
      if (gm) {
        for (const n of splitNames(gm[1], null, true).map((g) => g.name)) {
          annex.push({ name: n, within: null, level: "gemeinde", state: annexState });
        }
      }
    }
    return {
      shape: "FLAT_LIST",
      places,
      level: "gemeinde_or_gemarkung",
      ...(annex.length ? { annex, annexState } : {}),
    };
  }

  // Kreis-grouped.
  const out = [];
  let kreis = null;
  for (const line of lines) {
    if (!line || FOOTER.test(line)) continue;
    if (BEZIRK.test(line)) { kreis = null; continue; }
    const m = line.match(GROUP);
    if (m) {
      kreis = `${m[1]}${m[2]}`.trim();
      if (m[3]) out.push(...splitNames(m[3], kreis));
      continue;
    }
    // A continuation of the Kreis last seen. The final line of a list ends in a
    // full stop ("... Winterhausen."), and everything after it is prose, so the
    // stop both admits that line and closes the list.
    if (kreis && /^[A-ZÄÖÜ]/.test(line)) {
      out.push(...splitNames(line, kreis));
      if (/\.$/.test(line)) kreis = null;
    }
  }
  // Keep the Kreis each Gemeinde was listed under. Bavaria has two
  // Adelshofens and two Holzkirchens, and the specification already
  // disambiguates them by grouping -- discarding that forces a guess later.
  return out.length
    ? {
        shape: "KREIS_GROUPED",
        places: out.map((g) => g.name),
        in_kreis: Object.fromEntries(out.map((g) => [g.name, g.kreis])),
        kreise: [...new Set(out.map((g) => g.kreis))],
        level: "gemeinde",
      }
    : { shape: "UNPARSED", places: [] };
}

// `splitUnd` is off by default: in the flat Baden / Württemberg runs a name may
// legitimately carry "und" ("Ober- und Unterbalbach"), so only the prose-shaped
// Saale-Unstrut sentence, where "Jena und Erfurt" is two kreisfreie Stadte,
// asks for it.
// "Schlatt (Gemarkungs- Nr.5561)" and "Schlatt (Gemarkungs-Nr.5523)" are two
// distinct Gemarkungen of the same name, told apart by cadastral number. The
// spacing varies with wherever the PDF broke the line; the number does not.
function normaliseGemarkungsNr(name) {
  return name.replace(/\(\s*Gemarkungs-\s*Nr\.?\s*(\d+)\s*\)/i, "(Gemarkungs-Nr. $1)");
}

function splitNames(s, kreis, splitUnd = false) {
  return s.split(splitUnd ? /,|\bund\b/ : ",")
    .map((n) => n.trim().replace(/\.$/, ""))
    .filter((n) => n && n.length > 1 && !/^(und|sowie)$/i.test(n))
    .map((name) => ({ name: normaliseGemarkungsNr(name), kreis }));
}

const anbaugebiete = {};
for (const [protectedName, cfg] of Object.entries(WANTED)) {
  const rec = register.find((r) => r.protectedName === protectedName);
  if (!rec) { console.log(`  !! ${protectedName}: not in the register`); continue; }
  const txt = path.join(WORK, `${cfg.slug}.txt`);
  if (refresh || !existsSync(txt)) {
    const detail = JSON.parse(
      curl([`${REGISTER}/gi-applications/id/${rec.appUniqueId}?lang=en`]).toString("utf8"));
    const att = (detail.singleDocTechFile ?? [])[0]?.uri;
    if (!att) { console.log(`  !! ${protectedName}: no specification attached`); continue; }
    const pdf = path.join(WORK, `${cfg.slug}.pdf`);
    curl([`${ATTACHMENTS}/${att}`, "-o", pdf]);
    execFileSync("pdftotext", ["-layout", "-enc", "UTF-8", pdf, txt], { stdio: "pipe" });
  }
  const parsed = parseSection(await readFile(txt, "utf8"));
  anbaugebiete[cfg.slug] = {
    name: protectedName,
    gi_id: rec.appUniqueId,
    states: cfg.states,
    shape: parsed.shape,
    level: parsed.level ?? null,
    places: parsed.places ?? [],
    ...(parsed.annex ? { annex: parsed.annex, annexState: parsed.annexState } : {}),
    ...(parsed.kreise ? { kreise: parsed.kreise } : {}),
    ...(parsed.in_kreis ? { in_kreis: parsed.in_kreis } : {}),
    ...(parsed.ortsteile?.length ? { ortsteile: parsed.ortsteile } : {}),
    ...(parsed.gemarkungen?.length ? { gemarkungen: parsed.gemarkungen } : {}),
    ...(parsed.shape === "NARRATIVE"
      ? { buildable: false, why: "The specification delimits the zone as metes and bounds -- roads, river banks, a named Einzellage edge -- and names no Gemeinden. There is nothing to resolve against an administrative register, and inferring a place list from the prose is the exact failure the Spanish and Italian audits existed to remove." }
      : { buildable: true }),
  };
  const n = (parsed.places ?? []).length;
  console.log(`  ${protectedName.padEnd(16)} ${parsed.shape.padEnd(14)} ${String(n).padStart(4)} ${parsed.level ?? "-"}`);
}

await writeFile(OUT, `${JSON.stringify({
  _readme: {
    purpose: "The German wine Anbaugebiete this map does not already hold, as their product specifications delimit them.",
    authority: "European Commission — eAmbrosia, the Union register of geographical indications",
    why: "German wine law delegates delimitation to the Produktspezifikation (e.g. BayWeinRAV § 1), and the register is where that document lives. One source covers every German region; no state publishes an equivalent of the Hessen info sheet.",
    important: "The specification names GEMEINDEN, not boundaries: the zone is their vineyard areas 'wenn ihre Eignung zur Erzeugung von Qualitätswein festgestellt wird'. A Gemeinde is the containment parent, never the zone. build-germany-weinbau.mjs clips these to the ATKIS vineyard class.",
    not_included: "Mosel, Rheinhessen, Pfalz, Nahe, Ahr and Mittelrhein come from the Rheinland-Pfalz Weinbergsrolle (a legal boundary, better than a land-use clip); Rheingau and Hessische Bergstraße from the Weinbauamt Eltville info sheet.",
    retrieved: new Date().toISOString().slice(0, 10),
  },
  anbaugebiete,
}, null, 2)}\n`);
console.log(`\nwrote ${OUT}`);
