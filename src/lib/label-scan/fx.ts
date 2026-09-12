import "server-only";

// USD -> DKK for scan prices. FastCork reports a US retail figure, but the
// catalog stores estimated prices in DKK, so the figure is converted at the
// current rate before it is saved.
//
// The rate comes from Frankfurter (ECB reference rates, no API key) and is
// cached in module memory for a day — a scan must not wait on an FX call, and
// an intraday move is immaterial for a "typical retail price". If the feed is
// unavailable we fall back to a pinned rate rather than fail the scan: a
// slightly stale conversion beats losing the price (or, worse, storing a USD
// number labelled DKK).

const FALLBACK_USD_DKK = 6.44; // ECB, checked 2026-08-20; used only if the feed is down
const TTL_MS = 24 * 60 * 60 * 1000;

let cached: { rate: number; at: number } | null = null;

async function fetchRate(): Promise<number | null> {
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=DKK", {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { rates?: { DKK?: unknown } };
    const raw = data.rates?.DKK;
    const rate = typeof raw === "number" ? raw : Number(raw);
    // Sanity band: USD/DKK has sat between ~5 and ~9 for decades. A number
    // outside that is a broken feed, not a market move.
    return Number.isFinite(rate) && rate > 4 && rate < 12 ? rate : null;
  } catch {
    return null;
  }
}

/** Current USD→DKK rate (cached for a day; pinned fallback if the feed fails). */
export async function usdToDkkRate(): Promise<number> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.rate;
  const rate = await fetchRate();
  if (rate == null) return cached?.rate ?? FALLBACK_USD_DKK;
  cached = { rate, at: Date.now() };
  return rate;
}

/** Convert a USD amount to whole DKK, or null when there's nothing to convert. */
export async function usdToDkk(usd: number | null): Promise<number | null> {
  if (usd == null || !Number.isFinite(usd) || usd <= 0) return null;
  const rate = await usdToDkkRate();
  return Math.round(usd * rate);
}
