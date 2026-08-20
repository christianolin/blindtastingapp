import "server-only";

// Structured wine-label read for the Scan feature, via the FastCork API
// (https://fastcork.com/docs — POST /v1/analyze, multipart image upload).
// Server-only: the API key never reaches the browser.
//
// FastCork returns a wine-centric payload rather than our catalog shape, so the
// mapping below is the load-bearing part. Its quirks, and how we handle them:
//   - `full_wine_name` bundles producer + cuvée ("El Enemigo Cabernet Franc"):
//     we strip the `winery` prefix to recover the cuvée name.
//   - `region` bundles region + country ("Mendoza, Argentina" / "Limoux,
//     France"): split on the last comma.
//   - there is NO appellation field. The region half is often exactly the
//     appellation (Limoux), so it seeds the appellation too and the existing
//     fail-closed resolver in resolveWinePrefill decides whether it matches a
//     real appellation row — a wrong guess simply doesn't resolve.
//   - there is no designation, and no explicit confidence.
//   - `average_retail_price_usd` is a RETAIL price (newer wines only), not a
//     market valuation — carried through as USD and stored with its currency.

export type ExtractedLabel = {
  producer: string | null;
  wineName: string | null;
  appellation: string | null;
  region: string | null;
  country: string | null;
  /** The label's quality/ageing/style term. FastCork doesn't report one. */
  designation: string | null;
  vintageKind: "YEAR" | "NV" | "TAWNY";
  /** False when no vintage could actually be read — the user must confirm. */
  vintageRead: boolean;
  vintageYear: number | null;
  colour: "WHITE" | "ROSE" | "RED" | "ORANGE" | null;
  style: "STILL" | "SPARKLING" | "SWEET" | "FORTIFIED" | null;
  grapes: { name: string; percentage: number | null }[];
  description: string | null;
  confidence: "high" | "medium" | "low";
  rawText: string;
  /** FastCork's typical retail price for one bottle, in USD. */
  retailPriceUsd: number | null;
  /** Serving temperature range in °C, when reported. */
  servingTempC: { min: number; max: number } | null;
  /** Recommended decanting time in minutes (0 = none), when reported. */
  decantMinutes: number | null;
  /** Stated alcohol by volume, when reported. */
  alcoholPercent: number | null;
};

type FastCorkResult = {
  full_wine_name?: string | null;
  vintage?: string | number | null;
  serving_temperature_celcius_range?: {
    min_temp?: number | null;
    max_temp?: number | null;
  } | null;
  food_pairing?: string | null;
  aroma?: string | null;
  tasting_notes?: string | null;
  grape_variety?: string | null;
  average_retail_price_usd?: number | null;
  decanting_time_minutes?: number | null;
  winery?: string | null;
  winery_description?: string | null;
  wine_type?: string | null;
  alc_percentage?: number | null;
  region?: string | null;
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

// "El Enemigo Cabernet Franc" + winery "El Enemigo" -> "Cabernet Franc".
// Accent/case-insensitive so a differently-accented prefix still strips.
function stripProducerPrefix(full: string, producer: string | null): string | null {
  if (!producer) return full || null;
  const fold = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const f = fold(full);
  const p = fold(producer);
  if (f === p) return null; // the whole name IS the producer: no cuvée
  if (f.startsWith(p)) {
    const rest = full.slice(producer.length).replace(/^[\s,\-–—]+/, "").trim();
    return rest || null;
  }
  return full || null;
}

// "Mendoza, Argentina" -> { region: "Mendoza", country: "Argentina" }.
// A single value with no comma is treated as the region (country unknown).
function splitRegion(value: string | null): {
  region: string | null;
  country: string | null;
} {
  if (!value) return { region: null, country: null };
  const parts = value.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { region: null, country: null };
  if (parts.length === 1) return { region: parts[0], country: null };
  return {
    country: parts[parts.length - 1],
    region: parts.slice(0, -1).join(", "),
  };
}

// FastCork's `wine_type` is a loose string ("red", "white", "sparkling",
// "rosé", "dessert", "port"…) covering BOTH our colour and style axes, so it
// feeds each independently — a "sparkling rosé" sets ROSE + SPARKLING.
function mapType(raw: string | null): {
  colour: ExtractedLabel["colour"];
  style: ExtractedLabel["style"];
} {
  const t = (raw ?? "").toLowerCase();
  const colour: ExtractedLabel["colour"] = /ros|pink/.test(t)
    ? "ROSE"
    : /orange|amber|skin.?contact/.test(t)
      ? "ORANGE"
      : /white|blanc|bianco|blanco/.test(t)
        ? "WHITE"
        : /red|rouge|rosso|tinto/.test(t)
          ? "RED"
          : null;
  const style: ExtractedLabel["style"] = /spark|champagne|cava|prosecco|cremant|sekt|frizz/.test(t)
    ? "SPARKLING"
    : /port|sherry|madeira|marsala|fortif|vin doux/.test(t)
      ? "FORTIFIED"
      : /dessert|sweet|late.?harvest|ice ?wine|eiswein|sauternes|tokaj|passito/.test(t)
        ? "SWEET"
        : colour
          ? "STILL"
          : null;
  return { colour, style };
}

// "Cabernet Franc" / "Cabernet Sauvignon, Merlot" / "60% Syrah, 40% Grenache".
// Percentages are parsed when present; FastCork usually reports none.
function parseGrapes(raw: string | null): ExtractedLabel["grapes"] {
  if (!raw) return [];
  return raw
    .split(/[,;/]| and | & /i)
    .map((piece) => {
      const s = piece.trim();
      if (!s) return null;
      const m = /^(\d{1,3})\s*%\s*(.+)$/.exec(s) ?? /^(.+?)\s*\(?(\d{1,3})\s*%\)?$/.exec(s);
      let name = s;
      let percentage: number | null = null;
      if (m) {
        const a = m[1];
        const b = m[2];
        const pctFirst = /^\d/.test(a);
        name = (pctFirst ? b : a).trim();
        const p = Number(pctFirst ? a : b);
        percentage = Number.isFinite(p) && p > 0 && p <= 100 ? p : null;
      }
      name = name.replace(/^\d+\s*%\s*/, "").replace(/[.]+$/, "").trim();
      return name ? { name, percentage } : null;
    })
    .filter((g): g is { name: string; percentage: number | null } => !!g);
}

// The catalog blurb, composed from FastCork's prose. We keep the factual,
// wine-describing parts (the winery background, then aroma/palate) and leave
// out food pairing and serving mechanics, which the catalog shows separately or
// not at all. Empty when FastCork said nothing substantive.
function buildDescription(r: FastCorkResult): string | null {
  const parts = [str(r.winery_description), str(r.aroma), str(r.tasting_notes)]
    .filter(Boolean)
    .join(" ");
  return parts.trim() ? parts.trim() : null;
}

// FastCork reports no confidence score. Derive one from how much identity it
// actually recovered, so the caller's auto-accept gate stays meaningful: a read
// missing the producer or the wine's type is not something to save unattended.
function deriveConfidence(
  r: FastCorkResult,
  colour: ExtractedLabel["colour"],
  vintageRead: boolean,
): ExtractedLabel["confidence"] {
  const hasProducer = !!str(r.winery);
  const hasRegion = !!str(r.region);
  const hasGrape = !!str(r.grape_variety);
  if (hasProducer && colour && hasRegion && vintageRead) return "high";
  if (hasProducer && (colour || hasGrape)) return "medium";
  return "low";
}

function coerce(r: FastCorkResult): ExtractedLabel {
  const producer = str(r.winery);
  const full = str(r.full_wine_name);
  const wineName = full ? stripProducerPrefix(full, producer) : null;
  const { region, country } = splitRegion(str(r.region));

  const vintageRaw = str(typeof r.vintage === "number" ? String(r.vintage) : r.vintage);
  const yearMatch = vintageRaw ? /\b(19|20)\d{2}\b/.exec(vintageRaw) : null;
  const vintageYear = yearMatch ? Number(yearMatch[0]) : null;
  const isNv = !!vintageRaw && /\bnv\b|non.?vintage|s\.?a\.?/i.test(vintageRaw);
  const tawnyMatch = vintageRaw ? /\b(\d{1,3})\s*(?:year|yr|anos|años)/i.exec(vintageRaw) : null;
  const vintageKind: ExtractedLabel["vintageKind"] = tawnyMatch
    ? "TAWNY"
    : vintageYear != null
      ? "YEAR"
      : isNv
        ? "NV"
        : "YEAR";
  // "The label says NV" and "no year was found" are different facts: an unread
  // year must prompt the user rather than silently become Non-Vintage.
  const vintageRead = vintageYear != null || isNv || !!tawnyMatch;

  const { colour, style } = mapType(str(r.wine_type));
  const priceUsd = num(r.average_retail_price_usd);
  const tMin = num(r.serving_temperature_celcius_range?.min_temp);
  const tMax = num(r.serving_temperature_celcius_range?.max_temp);
  const decant = num(r.decanting_time_minutes);
  const abv = num(r.alc_percentage);

  return {
    producer,
    wineName,
    // FastCork has no appellation field; its region half is frequently the
    // appellation itself (Limoux). Seeding it here lets the existing
    // fail-closed appellation resolver confirm or ignore it.
    appellation: region,
    region,
    country,
    designation: null,
    vintageKind,
    vintageRead,
    vintageYear,
    colour,
    style,
    grapes: parseGrapes(str(r.grape_variety)),
    description: buildDescription(r),
    confidence: deriveConfidence(r, colour, vintageRead),
    // FastCork returns no verbatim OCR; the wine's own name is the closest
    // thing to "what the label said", and the field is only shown for review.
    rawText: full ?? "",
    retailPriceUsd: priceUsd != null && priceUsd > 0 ? priceUsd : null,
    servingTempC:
      tMin != null && tMax != null ? { min: tMin, max: tMax } : null,
    decantMinutes: decant != null && decant >= 0 ? decant : null,
    alcoholPercent: abv != null && abv > 0 && abv < 100 ? abv : null,
  };
}

// One retry on transient failures (429 / 5xx / network). A scan is a user
// standing with a bottle in hand — a single hiccup should not cost the photo.
async function postAnalyze(body: FormData, key: string): Promise<Response> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const res = await fetch("https://fastcork.com/v1/analyze", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body,
        signal: AbortSignal.timeout(60_000),
      });
      if ((res.status === 429 || res.status >= 500) && attempt === 1) {
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }
      return res;
    } catch (error) {
      if (attempt >= 2) throw error;
      await new Promise((r) => setTimeout(r, 800));
    }
  }
}

export async function extractLabel(imageUrl: string): Promise<ExtractedLabel> {
  const key = process.env.FASTCORK_API_KEY;
  if (!key) throw new Error("FASTCORK_API_KEY is not configured.");

  // /v1/analyze takes the image itself (multipart), not a URL, so the uploaded
  // label is fetched back from storage and forwarded.
  const img = await fetch(imageUrl);
  if (!img.ok) throw new Error(`Couldn't read the uploaded photo (${img.status}).`);
  const bytes = await img.arrayBuffer();
  const type = img.headers.get("content-type") ?? "image/jpeg";

  const form = new FormData();
  form.append("file", new Blob([bytes], { type }), "label.jpg");
  form.append("lang", "en");

  const res = await postAnalyze(form, key);
  if (!res.ok) {
    // 402 is FastCork's "out of credits" — worth saying plainly, since it's an
    // account problem the owner can fix, not a bad photo.
    if (res.status === 402) {
      throw new Error("Label read failed — the FastCork account is out of credits.");
    }
    throw new Error(`Label read failed (FastCork ${res.status}).`);
  }
  const data = (await res.json()) as {
    success?: boolean;
    results?: FastCorkResult[];
  };
  const first = data.results?.[0];
  if (!first) throw new Error("Label read failed (no wine found in the photo).");
  return coerce(first);
}
