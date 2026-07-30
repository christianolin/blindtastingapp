// Best-effort parser for a CellarTracker CSV export into the import_cellar_lots
// row shape. Unknown/missing columns fall back to null; the RPC fills required
// gaps (region<-country, appellation<-region, grape<-Unknown) and reports per-row
// failures, so a rough mapping still imports cleanly.

export type ImportRow = {
  producer: string;
  wine_name: string | null;
  country: string;
  region: string | null;
  appellation: string | null;
  grape: string | null;
  colour: string;
  style: string;
  vintage_kind: "YEAR" | "NV";
  vintage_year: number | null;
  quantity: number;
  bottle_size_ml: number;
  price_per_bottle: number | null;
  currency: string | null;
  drink_from: number | null;
  drink_to: number | null;
  storage_location: string | null;
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") field += ch;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function num(s: string | undefined): number | null {
  if (!s) return null;
  const n = Number(s.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function colour(s: string | undefined): string {
  const v = (s ?? "").toLowerCase();
  if (v.includes("white")) return "WHITE";
  if (v.includes("ros") || v.includes("pink")) return "ROSE";
  if (v.includes("orange") || v.includes("amber")) return "ORANGE";
  return "RED";
}

function style(category: string | undefined, type: string | undefined): string {
  const v = `${category ?? ""} ${type ?? ""}`.toLowerCase();
  if (v.includes("sparkl")) return "SPARKLING";
  if (v.includes("fortif")) return "FORTIFIED";
  if (v.includes("dessert") || v.includes("sweet")) return "SWEET";
  return "STILL";
}

function size(s: string | undefined): number {
  if (!s) return 750;
  const v = s.toLowerCase();
  if (v.includes("magnum")) return 1500;
  const ml = v.match(/([\d.]+)\s*ml/);
  if (ml) return Math.round(Number(ml[1]));
  const l = v.match(/([\d.]+)\s*l/);
  if (l) return Math.round(Number(l[1]) * 1000);
  const n = num(s);
  return n && n > 0 ? n : 750;
}

export function parseCellarTrackerCsv(text: string): ImportRow[] {
  const grid = parseCsv(text.trim());
  if (grid.length < 2) return [];
  const header = grid[0].map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const col = {
    vintage: idx("vintage"),
    designation: idx("designation"),
    vineyard: idx("vineyard"),
    producer: idx("producer"),
    country: idx("country"),
    region: idx("region"),
    subregion: idx("subregion"),
    appellation: idx("appellation"),
    varietal: idx("varietal"),
    masterVarietal: idx("mastervarietal"),
    color: idx("color"),
    category: idx("category"),
    type: idx("type"),
    quantity: idx("quantity"),
    size: idx("size"),
    price: idx("price"),
    currency: idx("currency"),
    begin: idx("beginconsume"),
    end: idx("endconsume"),
    location: idx("location"),
  };
  const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
  const out: ImportRow[] = [];
  for (let i = 1; i < grid.length; i++) {
    const r = grid[i];
    if (r.every((c) => c.trim() === "")) continue;
    const producer = get(r, col.producer);
    const country = get(r, col.country);
    if (!producer && !country) continue;
    const vy = num(get(r, col.vintage));
    const isNv = !vy || vy <= 1 || vy === 1001;
    out.push({
      producer,
      wine_name: get(r, col.designation) || get(r, col.vineyard) || null,
      country,
      region: get(r, col.region) || null,
      appellation: get(r, col.appellation) || get(r, col.subregion) || null,
      grape: get(r, col.varietal) || get(r, col.masterVarietal) || null,
      colour: colour(get(r, col.color)),
      style: style(get(r, col.category), get(r, col.type)),
      vintage_kind: isNv ? "NV" : "YEAR",
      vintage_year: isNv ? null : vy,
      quantity: Math.max(1, num(get(r, col.quantity)) ?? 1),
      bottle_size_ml: size(get(r, col.size)),
      price_per_bottle: num(get(r, col.price)),
      currency: get(r, col.currency) || null,
      drink_from: num(get(r, col.begin)),
      drink_to: num(get(r, col.end)),
      storage_location: get(r, col.location) || null,
    });
  }
  return out;
}
