import "server-only";

// Structured wine-label read for the Scan feature. Calls the Anthropic Messages
// API directly over fetch (no SDK dependency) with the uploaded label image URL
// and a FORCED TOOL CALL, so the reply is schema-valid JSON by construction —
// there is no "return only JSON" prompt to disobey and nothing to slice out of
// prose. Server-only: the API key never reaches the browser.

export type ExtractedLabel = {
  producer: string | null;
  wineName: string | null;
  appellation: string | null;
  region: string | null;
  country: string | null;
  /** The label's quality/ageing/style term (Gran Reserva, Kabinett…), canonical form. */
  designation: string | null;
  vintageKind: "YEAR" | "NV" | "TAWNY";
  vintageYear: number | null;
  colour: "WHITE" | "ROSE" | "RED" | "ORANGE" | null;
  style: "STILL" | "SPARKLING" | "SWEET" | "FORTIFIED" | null;
  grapes: { name: string; percentage: number | null }[];
  description: string | null;
  confidence: "high" | "medium" | "low";
  rawText: string;
};

// Owner-provided, vision-capable. Swap here if a newer model is preferred.
const MODEL = "claude-sonnet-5";

// The schema IS the prompt: each field's description carries its extraction
// rules, so the guidance sits exactly where the model fills the value in.
const LABEL_TOOL = {
  name: "record_wine_label",
  description:
    "Record the structured reading of a wine bottle label photographed for a cellar app. Fill every field from the label where printed, and from well-established knowledge of the wine, producer or appellation where not. Null means 'genuinely unknown', never 'lazy'.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      producer: {
        type: ["string", "null"],
        description: "Winery / producer name, or null.",
      },
      wineName: {
        type: ["string", "null"],
        description:
          "The cuvée / special bottling name — not the producer, not the appellation — or null.",
      },
      appellation: {
        type: ["string", "null"],
        description:
          'The wine\'s geographic denomination — AOC/AOP, DOC/DOCG, DO/DOCa, IGT/IGP, PDO/PGI, AVA, etc. A regional PGI counts: a label printing "PUGLIA — Indicazione Geografica Protetta" IS the appellation "Puglia IGT". Italian labels print the EU term (IGP/DOP) for what wine lists still call IGT/DOC/DOCG — return the traditional form ("Puglia IGT", not "Puglia IGP"). Repeat the name even when it equals the region. Null ONLY when the wine truly carries no geographic indication (Vin de France, Vino d\'Italia, Deutscher Wein).',
      },
      region: {
        type: ["string", "null"],
        description:
          "The wine region — infer it from the appellation or producer even when not printed (Amarone della Valpolicella → Veneto), or null.",
      },
      country: {
        type: ["string", "null"],
        description: "The country — infer it too (→ Italy), or null.",
      },
      designation: {
        type: ["string", "null"],
        description:
          'The label\'s legal quality, ageing or style term, in its canonical form: "Gran Reserva", "Reserva", "Crianza", "Riserva", "Gran Selezione", "Kabinett", "Spätlese", "Auslese", "Grosses Gewächs", "Grand Cru", "Premier Cru", "Brut", "Brut Nature", "Extra Dry", "Vintage", "LBV", "Colheita", "Fino", "Amontillado", "VORS"… Return the term itself, not a sentence. Null when the label carries none. Do NOT put grape names or fantasy names here.',
      },
      vintageKind: {
        type: "string",
        enum: ["YEAR", "NV", "TAWNY"],
        description:
          '"YEAR" if a vintage year is shown, "NV" for non-vintage, "TAWNY" for an "X years" tawny.',
      },
      vintageYear: {
        type: ["integer", "null"],
        description: "The 4-digit vintage year, or null.",
      },
      colour: {
        type: ["string", "null"],
        enum: ["WHITE", "ROSE", "RED", "ORANGE", null],
        description: "Null if unclear.",
      },
      style: {
        type: ["string", "null"],
        enum: ["STILL", "SPARKLING", "SWEET", "FORTIFIED", null],
        description:
          '"STILL" for normal reds/whites including Amarone; "SPARKLING" for Champagne, Prosecco, Cava…; "SWEET" for dessert / late-harvest (Sauternes, Tokaji); "FORTIFIED" for Port, Sherry, Madeira, VDN — Port is FORTIFIED, not SWEET. Null if unclear.',
      },
      grapes: {
        type: "array",
        description:
          'ALL major grapes in the blend, not just the primary. Canonical international variety names — never a local synonym, clone or translation, no parenthetical qualifiers ("Sangiovese" not "Brunello"/"Prugnolo Gentile"; "Grenache" not "Garnacha"/"Cannonau"; "Syrah" not "Shiraz"; "Pinot Noir" not "Pinot Nero"/"Spätburgunder"). Percentages from the label; else the proportions well-known for this wine or appellation; else null.',
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            percentage: { type: ["number", "null"] },
          },
          required: ["name", "percentage"],
        },
      },
      description: {
        type: ["string", "null"],
        description:
          "2-4 sentences of REFERENCE NOTES for a wine enthusiast's cellar — the register of an encyclopedia entry, not a shop shelf-talker. Include only verifiable facts you are confident of: terroir and soils, the appellation's production rules as they apply to this wine (ageing minimums, yields, permitted varieties), élevage (vessel, months), production scale, the estate's founding or ownership where notable, stated neutrally. FORBIDDEN: describing the bottle, label or packaging; praise and promotional adjectives (legendary, prestigious, stunning, exceptional, iconic, renowned) unless part of an official classification's name; food pairings; 'perfect for' anything; every form of sales tone. A wine about which little is known gets a SHORT description — two dry sentences beat four glowing ones. Facts you cannot stand behind are omitted, not hedged. Null when you cannot say anything factual beyond what other fields already carry.",
      },
      confidence: {
        type: "string",
        enum: ["high", "medium", "low"],
        description: "How clearly the label could be read.",
      },
      rawText: {
        type: "string",
        description:
          "All text readable on the label, verbatim. If the image is not a wine label, say so briefly here and null/empty every other field with confidence low.",
      },
    },
    required: [
      "producer",
      "wineName",
      "appellation",
      "region",
      "country",
      "designation",
      "vintageKind",
      "vintageYear",
      "colour",
      "style",
      "grapes",
      "description",
      "confidence",
      "rawText",
    ],
  },
} as const;

const PROMPT =
  "Read this wine bottle label and record it with the record_wine_label tool. " +
  "You are compiling reference data for a wine enthusiast's cellar, not writing marketing.";

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

// Normalise the model's JSON into a safe, typed shape — the schema constrains
// the API's output, but this code must not trust the transport either.
function coerce(o: Record<string, unknown>): ExtractedLabel {
  const year =
    typeof o.vintageYear === "number" ? o.vintageYear : Number(o.vintageYear);
  const vintageYear =
    Number.isInteger(year) && year > 1900 && year < 2100 ? year : null;
  const vk = o.vintageKind;
  // Unknown kind: a parsed year means YEAR; otherwise NV. The old behaviour
  // defaulted to YEAR unconditionally — a guess presented as a reading.
  const vintageKind =
    vk === "YEAR" || vk === "NV" || vk === "TAWNY"
      ? vk
      : vintageYear != null
        ? "YEAR"
        : "NV";
  const col = o.colour;
  const colour =
    col === "WHITE" || col === "ROSE" || col === "RED" || col === "ORANGE" ? col : null;
  const sty = o.style;
  const style =
    sty === "STILL" || sty === "SPARKLING" || sty === "SWEET" || sty === "FORTIFIED"
      ? sty
      : null;
  const conf = o.confidence;
  const confidence =
    conf === "high" || conf === "medium" || conf === "low" ? conf : "low";
  return {
    producer: str(o.producer),
    wineName: str(o.wineName),
    appellation: str(o.appellation),
    region: str(o.region),
    country: str(o.country),
    designation: str(o.designation),
    vintageKind,
    vintageYear,
    colour,
    style,
    grapes: Array.isArray(o.grapes)
      ? o.grapes
          .map((g) => {
            if (typeof g === "string") return { name: g.trim(), percentage: null };
            const gg = (g ?? {}) as Record<string, unknown>;
            const nm = str(gg.name);
            if (!nm) return null;
            const pctRaw =
              typeof gg.percentage === "number"
                ? gg.percentage
                : Number(gg.percentage);
            const percentage =
              Number.isFinite(pctRaw) && pctRaw > 0 && pctRaw <= 100
                ? pctRaw
                : null;
            return { name: nm, percentage };
          })
          .filter((g): g is { name: string; percentage: number | null } => !!g)
      : [],
    description: str(o.description),
    confidence,
    rawText: typeof o.rawText === "string" ? o.rawText : "",
  };
}

// One retry on transient failures (429 / 5xx / network). A scan is a user
// standing with a bottle in hand — a single hiccup should not cost the photo.
async function callAnthropic(body: string, key: string): Promise<Response> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body,
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
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not configured.");
  const res = await callAnthropic(
    JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      tools: [LABEL_TOOL],
      // Forced: the model MUST answer through the tool, so the output is
      // schema-shaped JSON — no fences, no preamble, no slicing.
      tool_choice: { type: "tool", name: LABEL_TOOL.name },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "url", url: imageUrl } },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    }),
    key,
  );
  if (!res.ok) {
    throw new Error(`Label read failed (Anthropic ${res.status}).`);
  }
  const data = (await res.json()) as {
    content?: Array<{ type: string; name?: string; input?: unknown }>;
  };
  const tool = data.content?.find(
    (c) => c.type === "tool_use" && c.name === LABEL_TOOL.name,
  );
  if (!tool || typeof tool.input !== "object" || tool.input === null) {
    throw new Error("Label read failed (no structured output).");
  }
  return coerce(tool.input as Record<string, unknown>);
}
