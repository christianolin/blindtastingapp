import "server-only";

// Structured wine-label read for the Scan feature. Calls the Anthropic Messages
// API directly over fetch (no SDK dependency) with the uploaded label image URL
// and a strict-JSON prompt, then normalises the result into ExtractedLabel.
// Server-only: the API key never reaches the browser.

export type ExtractedLabel = {
  producer: string | null;
  wineName: string | null;
  appellation: string | null;
  region: string | null;
  country: string | null;
  vintageKind: "YEAR" | "NV" | "TAWNY";
  vintageYear: number | null;
  colour: "WHITE" | "ROSE" | "RED" | "ORANGE" | null;
  grapes: string[];
  description: string | null;
  confidence: "high" | "medium" | "low";
  rawText: string;
};

// Owner-provided, vision-capable. Swap here if a newer model is preferred.
const MODEL = "claude-sonnet-4-6";

const PROMPT = `You are a wine expert reading a wine bottle label from a photo.
Return ONLY a single JSON object — no prose, no markdown code fences — with exactly these keys:
"producer": winery / producer name, or null
"wineName": the cuvee / special bottling name (not the producer, not the appellation), or null
"appellation": appellation / AOC / DOC / DOCG / etc., or null
"region": wine region, or null
"country": country, or null
"vintageKind": "YEAR" if a vintage year is shown, "NV" for non-vintage, "TAWNY" for an "X years" tawny
"vintageYear": the 4-digit vintage year as a number, or null
"colour": one of "WHITE","ROSE","RED","ORANGE", or null if unclear
"grapes": array of grape variety names printed on the label or well-known for this wine (may be empty)
"description": a 2-4 sentence description for a wine catalog, combining the label text with well-known facts about this wine / producer / appellation. This is an editable draft; general knowledge is fine, but do not fabricate specific claims you are unsure of.
"confidence": "high", "medium", or "low" — how clearly you could read the label
"rawText": all text you can read on the label, verbatim
If the image is not a wine label, set every field to null/empty, "confidence" to "low", and briefly say so in "rawText".`;

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

// Normalise the model's JSON into a safe, typed shape — never trust the raw
// output. Unknown enum values fall back to sane defaults.
function coerce(o: Record<string, unknown>): ExtractedLabel {
  const vk = o.vintageKind;
  const vintageKind = vk === "NV" || vk === "TAWNY" ? vk : "YEAR";
  const col = o.colour;
  const colour =
    col === "WHITE" || col === "ROSE" || col === "RED" || col === "ORANGE" ? col : null;
  const conf = o.confidence;
  const confidence =
    conf === "high" || conf === "medium" || conf === "low" ? conf : "low";
  const year =
    typeof o.vintageYear === "number" ? o.vintageYear : Number(o.vintageYear);
  return {
    producer: str(o.producer),
    wineName: str(o.wineName),
    appellation: str(o.appellation),
    region: str(o.region),
    country: str(o.country),
    vintageKind,
    vintageYear: Number.isInteger(year) && year > 1900 && year < 2100 ? year : null,
    colour,
    grapes: Array.isArray(o.grapes)
      ? o.grapes.map((g) => str(g)).filter((g): g is string => !!g)
      : [],
    description: str(o.description),
    confidence,
    rawText: typeof o.rawText === "string" ? o.rawText : "",
  };
}

// Tolerate a stray ```json fence or leading prose by slicing the first {...}.
function parseJson(text: string): Record<string, unknown> {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const slice = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  return JSON.parse(slice) as Record<string, unknown>;
}

export async function extractLabel(imageUrl: string): Promise<ExtractedLabel> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not configured.");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
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
  });
  if (!res.ok) {
    throw new Error(`Label read failed (Anthropic ${res.status}).`);
  }
  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = data.content?.find((c) => c.type === "text")?.text ?? "";
  return coerce(parseJson(text));
}
