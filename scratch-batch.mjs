// SCRATCH — build Rioja DOCa (tri-province space-table). Deleted after.
import { readFile, writeFile } from "node:fs/promises";
import { loadMunicipioCache } from "./scripts/wine-map-sources/fetch-spain-municipios.mjs";
import { buildMunicipioIndex, resolveMembership } from "./scripts/wine-map-sources/spain-lib.mjs";
const UA = "blindtasting-wine-map/1.0 (cdo@copenhagendata.com)";
const STOP = new Set(["de", "del", "la", "las", "los", "el", "y", "d", "o", "a"]);
const sig = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9/ -]/g, " ").split(/[\s/-]+/).filter((t) => t && !STOP.has(t)).join(" ");
async function duck(q) { const r = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, { headers: { "User-Agent": UA, Accept: "text/html" } }); const h = await r.text(); const out = []; for (const m of h.matchAll(/[?&]uddg=([^&]+)/g)) out.push(decodeURIComponent(m[1])); return out; }
async function findPliego(name) { for (const q of [`${name} pliego condiciones vino mapa.gob.es`, `${name} pliego de condiciones DOCa mapa.gob.es`]) { const urls = await duck(q); const pdf = urls.find((u) => /mapa\.gob\.es/.test(u) && /\.pdf$/i.test(u) && !/ppccxccaa/i.test(u)); if (pdf) return pdf; } return null; }
async function pdf(url) { const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs"); const b = new Uint8Array(await (await fetch(url, { headers: { "User-Agent": UA } })).arrayBuffer()); const doc = await pdfjs.getDocument({ data: b, useSystemFonts: true }).promise; let t = ""; for (let p = 1; p <= doc.numPages; p += 1) { const c = await (await doc.getPage(p)).getTextContent(); t += c.items.map((i) => i.str).join(" ") + "\n"; } return t.replace(/[A-Z]{2,4}-[A-Z]{2,3}-[A-Z0-9]+\s*P[áa]gina\s*\d+\s*de\s*\d+/gi, " ").replace(/P[áa]gina\s*\d+\s*de\s*\d+/gi, " ").replace(/\s+/g, " "); }
const index = buildMunicipioIndex(await loadMunicipioCache());
const P = ["26", "01", "31"];
const km = new Map();
for (const r of index.byCode.values()) { if (!P.includes(r.prov_code)) continue; for (const nm of [r.mun_name, ...(r.aliases ?? [])]) { const k = sig(nm); const a = km.get(k) ?? []; if (!a.some((z) => z.mun_code === r.mun_code)) a.push(r); km.set(k, a); } }
function findAll(t) {
  const toks = t.replace(/[“”"'()[\];:,.•]/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const M = []; let i = 0;
  while (i < toks.length) { let h = null; for (let len = Math.min(6, toks.length - i); len >= 1; len--) { const rc = km.get(sig(toks.slice(i, i + len).join(" "))); if (rc && rc.length === 1) { h = { rec: rc[0], len }; break; } } if (h) { const p2 = `${sig(toks[i - 2] ?? "")} ${sig(toks[i - 1] ?? "")}`; if (!/provincia/.test(p2)) M.push({ rec: h.rec, pos: i }); i += h.len; } else i++; }
  const seen = new Set(); const out = []; let cur = [];
  const flush = () => { if (cur.length >= 4) for (const m of cur) if (!seen.has(m.rec.mun_code)) { seen.add(m.rec.mun_code); out.push(m.rec); } cur = []; };
  for (let j = 0; j < M.length; j++) { if (cur.length && M[j].pos - M[j - 1].pos > 25) flush(); cur.push(M[j]); }
  flush(); return out;
}
const url = await findPliego("DOCa Rioja");
const drop = new Set(["01059", "31201"]); // Vitoria-Gasteiz, Pamplona capitals (not Rioja members); Logroño 26089 is a member, kept.
const got = findAll(await pdf(url)).filter((r) => !drop.has(r.mun_code));
const byProv = {}; for (const r of got) byProv[r.prov_code] = (byProv[r.prov_code] ?? 0) + 1;
console.log(`Rioja [${url.split("/").at(-1)}]: ${got.length} municipios, by prov ${JSON.stringify(byProv)}`);
const membership = JSON.parse(await readFile("data/wine-map/spain-do-membership.json", "utf8"));
const entry = {
  canonical_key: "spain.la-rioja.rioja", comunidad_key: "la-rioja", comunidad: "La Rioja", display_name: "Rioja",
  appellation_system: "DOCa", appellation_level: "regional", provinces: ["26", "01", "31"], expected_count: got.length,
  municipios: got.map((r) => ({ code: r.mun_code, name: r.mun_name })),
  provenance: { source: "Pliego de condiciones DOCa «Rioja», MAPA", url, retrieved: "2026-08-18", note: "Trans-comunidad DOCa keyed under La Rioja; includes Rioja Alavesa (Álava/País Vasco) and Rioja municipios of Navarra. Whole-municipality union (density-located from the space-separated multi-column list). Logroño is a member; the Vitoria/Pamplona capitals are excluded." },
  status: "ready",
};
resolveMembership(entry, index);
membership.denominations = membership.denominations.filter((d) => d.canonical_key !== entry.canonical_key);
membership.denominations.push(entry);
await writeFile("data/wine-map/spain-do-membership.json", `${JSON.stringify(membership, null, 2)}\n`);
console.log("Rioja written");
