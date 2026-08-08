import "server-only";

// Web-grounded price lookup for cellar valuation. Claude gets the Anthropic
// web_search server tool and must ground the figure in real market evidence —
// in-stock listings or vintage-specific market data for exactly this wine —
// then record the outcome through a schema-shaped tool call. Pricing from
// general knowledge is forbidden: no evidence, no price. A null means "the
// market shows nothing for this bottle" and renders as a blank value.

export type PriceLookupInput = {
  producer: string | null;
  wineName: string | null;
  appellation: string | null;
  region: string | null;
  country: string | null;
  /** Human-readable vintage: "2010", "NV (non-vintage)", "20-year tawny". */
  vintage: string;
  // Many wines carry no cuvée name — colour and grapes are then the only
  // thing separating this bottle from the producer's other (often dearer)
  // lines, so they are part of the identity the evidence must match.
  colour: string | null;
  grapes: string[];
};

export type PriceLookup = {
  priceDkk: number | null;
  /** One or two lines naming the evidence (domains, original amounts), or null. */
  basis: string | null;
};

const MODEL = "claude-sonnet-5";

// Bounded searching keeps a lookup at a predictable cost and duration. Each
// search round adds ~15-20k input tokens of results, so this is the cost dial.
const MAX_WEB_SEARCHES = 2;

const RECORD_TOOL = {
  name: "record_price",
  description:
    "Record the outcome of the market price lookup. Call exactly once, after searching.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      price_dkk: {
        type: ["number", "null"],
        description:
          "Typical current market price in Danish kroner for one 750 ml bottle, or null when no qualifying evidence was found.",
      },
      basis: {
        type: ["string", "null"],
        description:
          "One or two lines naming the source domains and original currency/amounts, or null.",
      },
    },
    required: ["price_dkk", "basis"],
  },
} as const;

/** Format a catalog/scan vintage for the lookup prompt. */
export function vintageLabel(
  kind: "YEAR" | "NV" | "TAWNY",
  year: number | null,
  tawnyYears: number | null = null,
): string {
  if (kind === "NV") return "NV (non-vintage)";
  if (kind === "TAWNY")
    return tawnyYears ? `${tawnyYears}-year tawny` : "tawny (age-indicated)";
  return year != null ? String(year) : "vintage unknown";
}

function buildPrompt(input: PriceLookupInput): string {
  const wine = [input.producer, input.wineName, input.vintage]
    .filter(Boolean)
    .join(" ");
  const where = [input.appellation, input.region, input.country]
    .filter(Boolean)
    .join(", ");
  const identity = [input.colour, input.grapes.join("/") || null]
    .filter(Boolean)
    .join(" — ");
  return [
    "Find the current typical market price, in Danish kroner, for this exact wine:",
    "",
    where ? `${wine} — ${where}` : wine,
    identity ? `(${identity})` : "",
    "",
    "Rules:",
    "- Search the web for current market prices for this wine.",
    "- Qualifying evidence, best first: (1) in-stock retail or marketplace listings for this exact producer, cuvee and vintage (a non-vintage wine matches current NV stock); (2) a vintage-specific market price for this exact wine and vintage — e.g. Wine-Searcher's average for THIS vintage, iDealwine's cote, or recent auction results for THIS vintage.",
    "- Prices for other vintages, and averages blended across vintages, do NOT qualify.",
    "- The colour and grape(s) above are part of the wine's identity: evidence for a different cuvee, colour or grape from the same producer does NOT qualify (a producer's premium line does not price its standard line).",
    "- Use 750 ml bottle prices; ignore en primeur offers, magnums and obvious outliers. Prefer retail over auction when both exist.",
    "- Convert to DKK at current exchange rates.",
    "- Report a typical mid-range figure across the qualifying evidence, not the extreme.",
    "- If no qualifying evidence exists, the price is null. Do not estimate from general knowledge: no evidence, no price.",
    "",
    "Do not write an analysis of the results. After searching, call record_price immediately — basis is one or two lines naming the source domains and original currency/amounts.",
  ].join("\n");
}

// One retry on transient failures, mirroring extract.ts.
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
        signal: AbortSignal.timeout(120_000),
      });
      if ((res.status === 429 || res.status >= 500) && attempt === 1) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      return res;
    } catch (error) {
      if (attempt >= 2) throw error;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

type ContentBlock = { type: string; name?: string; input?: unknown };

export async function lookupWinePrice(
  input: PriceLookupInput,
): Promise<PriceLookup> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not configured.");

  let messages: Array<{ role: "user" | "assistant"; content: unknown }> = [
    { role: "user", content: buildPrompt(input) },
  ];
  let data: { stop_reason?: string; content?: ContentBlock[] } = {};
  // Server-tool turns can pause mid-search (stop_reason "pause_turn"); the
  // caller resends the accumulated conversation to let the turn continue.
  for (let hop = 0; hop < 4; hop += 1) {
    const res = await callAnthropic(
      JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
            max_uses: MAX_WEB_SEARCHES,
          },
          RECORD_TOOL,
        ],
        messages,
      }),
      key,
    );
    if (!res.ok) {
      throw new Error(`Price lookup failed (Anthropic ${res.status}).`);
    }
    data = (await res.json()) as typeof data;
    if (data.stop_reason !== "pause_turn") break;
    messages = [...messages, { role: "assistant", content: data.content }];
  }

  // Last record_price call wins; no call at all (token cap, refusal, …) means
  // unknown — never a guess.
  let raw: Record<string, unknown> | null = null;
  for (const block of data.content ?? []) {
    if (
      block.type === "tool_use" &&
      block.name === RECORD_TOOL.name &&
      typeof block.input === "object" &&
      block.input !== null
    ) {
      raw = block.input as Record<string, unknown>;
    }
  }
  if (!raw) return { priceDkk: null, basis: null };
  const priceRaw =
    typeof raw.price_dkk === "number" ? raw.price_dkk : Number(raw.price_dkk);
  const priceDkk =
    Number.isFinite(priceRaw) && priceRaw > 0 && priceRaw < 1_000_000
      ? Math.round(priceRaw)
      : null;
  const basis =
    typeof raw.basis === "string" && raw.basis.trim() ? raw.basis.trim() : null;
  return { priceDkk, basis };
}
