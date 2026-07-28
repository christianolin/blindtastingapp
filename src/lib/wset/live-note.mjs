// Composes the live tasting note from note state: one prose block per
// non-empty section (Appearance / Nose / Palate / Conclusions). Pure and
// dependency-free apart from the sibling quality-curve; the caller supplies
// the enum LABELS map and a term-id -> label Map so this module needs no
// knowledge of the vocabulary source (allowJs types it on the app side).
import { qualityBand } from "./quality-curve.mjs";

// Sentence-case the first character of an already-lowercase label list.
function sentence(head) {
  return head.charAt(0).toUpperCase() + head.slice(1);
}

// Join scale terms with ", ", append an aroma list after " — ", and any
// observation-style trailing list after "; ", then end with a period.
function line({ scales, aromas, trailer }) {
  let out = scales.join(", ");
  if (aromas && aromas.length) out += ` — ${aromas.join(", ")}`;
  if (trailer && trailer.length) out += `; ${trailer.join(", ")}`;
  return `${sentence(out)}.`;
}

function labelList(values, labels) {
  return values.filter((v) => v != null).map((v) => labels[v]);
}

function termList(ids, termLabels) {
  return ids.map((id) => termLabels.get(id)).filter(Boolean);
}

export function composeLiveNote(state, termLabels, labels) {
  const out = {};

  const appScales = labelList(
    [state.clarity, state.appearanceIntensity, state.colourHue],
    labels,
  );
  // "medium(+) intensity" reads better than a bare "medium(+)".
  const appParts = [];
  if (state.clarity != null) appParts.push(labels[state.clarity]);
  if (state.appearanceIntensity != null) {
    appParts.push(`${labels[state.appearanceIntensity]} intensity`);
  }
  if (state.colourHue != null) appParts.push(labels[state.colourHue]);
  if (appParts.length || state.observations.length) {
    out.appearance = line({
      scales: appParts,
      trailer: labelList(state.observations, labels),
    });
  }

  const noseParts = [];
  if (state.condition != null) noseParts.push(labels[state.condition]);
  if (state.noseIntensity != null) {
    noseParts.push(`${labels[state.noseIntensity]} intensity`);
  }
  if (state.development != null) noseParts.push(labels[state.development]);
  const noseAromas = termList(state.noseTermIds, termLabels);
  const faults = labelList(state.faults, labels);
  if (noseParts.length || noseAromas.length || faults.length) {
    out.nose = line({
      scales: noseParts.length ? noseParts : ["Aromas"],
      aromas: noseAromas,
      trailer: faults,
    });
  }

  const palParts = [];
  for (const key of [
    "sweetness", "acidity", "tannin", "alcohol", "body",
    "flavourIntensity", "finish", "mousse",
  ]) {
    if (state[key] != null) {
      const suffix =
        key === "acidity" ? " acidity"
        : key === "tannin" ? " tannin"
        : key === "flavourIntensity" ? " flavour"
        : key === "finish" ? " finish"
        : "";
      palParts.push(`${labels[state[key]]}${suffix}`);
    }
  }
  const palAromas = termList(state.palateTermIds, termLabels);
  if (palParts.length || palAromas.length) {
    out.palate = line({ scales: palParts, aromas: palAromas });
  }

  const conParts = [];
  if (state.qualityScore != null) {
    conParts.push(
      `${state.qualityScore} points (${qualityBand(state.qualityScore).toLowerCase()})`,
    );
  }
  if (state.priceCategory != null) conParts.push(labels[state.priceCategory]);
  if (state.readiness != null) conParts.push(labels[state.readiness]);
  if (conParts.length) out.conclusions = line({ scales: conParts });

  if (state.tasterNotes && state.tasterNotes.trim()) {
    out.taster = state.tasterNotes.trim();
  }

  return out;
}
