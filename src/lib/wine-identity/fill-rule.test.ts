import { describe, expect, it } from "vitest";

import {
  catalogFillPlan,
  type CatalogFillContext,
  type CatalogFillRow,
  type CatalogFillSource,
} from "./fill-rule";

// The fill rule behind fillCatalogWine (spec 2026-09-19-rule1-usage-and-main-photo §5.1, D9, T1).

const ME = "11111111-1111-4111-8111-111111111111";
const SOMEONE_ELSE = "22222222-2222-4222-8222-222222222222";

const SCAN = "https://example.supabase.co/storage/v1/object/public/wine-images/catalog/staging/u/scan-1.jpg";

function row(overrides: Partial<CatalogFillRow> = {}): CatalogFillRow {
  return {
    createdBy: ME,
    blindPending: false,
    imageUrl: null,
    description: null,
    alcoholPercent: null,
    ...overrides,
  };
}

const SOURCE: CatalogFillSource = { imageUrl: SCAN, description: "A dry white from the Loire.", alcohol: 12.5 };

const CATALOG: CatalogFillContext = { kind: "catalog" };
const FLIGHT_HIDDEN: CatalogFillContext = { kind: "flight", glassRevealed: false };
const FLIGHT_OPEN: CatalogFillContext = { kind: "flight", glassRevealed: true };

describe("catalogFillPlan: the catalog, cellar and note paths", () => {
  it("fills a blank photo and description and a null alcohol on the caller's own wine", () => {
    expect(catalogFillPlan(row(), SOURCE, ME, CATALOG)).toEqual({
      patch: { image_url: SCAN, description: "A dry white from the Loire.", alcohol_percent: 12.5 },
      onlyWhileHidden: false,
    });
  });

  it("never overwrites a filled value", () => {
    const filled = row({ imageUrl: "https://x/old.jpg", description: "Already written.", alcoholPercent: "13.0" });
    expect(catalogFillPlan(filled, SOURCE, ME, CATALOG)).toEqual({ patch: {}, onlyWhileHidden: false });
  });

  it("treats a whitespace-only photo or description as blank", () => {
    const blankish = row({ imageUrl: "  ", description: "\n\t " });
    expect(catalogFillPlan(blankish, SOURCE, ME, CATALOG)?.patch).toEqual({
      image_url: SCAN,
      description: "A dry white from the Loire.",
      alcohol_percent: 12.5,
    });
  });

  it("writes nothing the source does not carry", () => {
    expect(catalogFillPlan(row(), { imageUrl: null, description: null, alcohol: null }, ME, CATALOG)).toEqual({
      patch: {},
      onlyWhileHidden: false,
    });
  });

  it("fills alcohol 0 (only null counts as missing)", () => {
    expect(catalogFillPlan(row(), { imageUrl: null, description: null, alcohol: 0 }, ME, CATALOG)?.patch).toEqual({
      alcohol_percent: 0,
    });
  });

  it("fills a hidden wine of the caller's the same way", () => {
    expect(catalogFillPlan(row({ blindPending: true }), SOURCE, ME, CATALOG)).toEqual({
      patch: { image_url: SCAN, description: "A dry white from the Loire.", alcohol_percent: 12.5 },
      onlyWhileHidden: false,
    });
  });
});

describe("catalogFillPlan: someone else's wine", () => {
  it.each([
    ["catalog", CATALOG],
    ["flight, hidden glass", FLIGHT_HIDDEN],
    ["flight, OPEN board", FLIGHT_OPEN],
  ] as const)("is never filled (%s)", (_label, context) => {
    expect(catalogFillPlan(row({ createdBy: SOMEONE_ELSE }), SOURCE, ME, context)).toBeNull();
    expect(catalogFillPlan(row({ createdBy: SOMEONE_ELSE, blindPending: true }), SOURCE, ME, context)).toBeNull();
    expect(catalogFillPlan(row({ createdBy: null }), SOURCE, ME, context)).toBeNull();
  });
});

describe("catalogFillPlan: a flight (add, finish, Edit, Swap)", () => {
  it("writes nothing at all, not even the blend, to a public wine while the glass is hidden", () => {
    expect(catalogFillPlan(row({ blindPending: false }), SOURCE, ME, FLIGHT_HIDDEN)).toBeNull();
  });

  it("fills a hidden wine's description and alcohol, never its photo, and only while it stays hidden", () => {
    expect(catalogFillPlan(row({ blindPending: true }), SOURCE, ME, FLIGHT_HIDDEN)).toEqual({
      patch: { description: "A dry white from the Loire.", alcohol_percent: 12.5 },
      onlyWhileHidden: true,
    });
  });

  it("fills a public wine on an OPEN board (the glass itself is public), never its photo", () => {
    expect(catalogFillPlan(row({ blindPending: false }), SOURCE, ME, FLIGHT_OPEN)).toEqual({
      patch: { description: "A dry white from the Loire.", alcohol_percent: 12.5 },
      onlyWhileHidden: false,
    });
  });

  it("never overwrites a hidden wine's filled values", () => {
    const filled = row({ blindPending: true, description: "Kept.", alcoholPercent: 13 });
    expect(catalogFillPlan(filled, SOURCE, ME, FLIGHT_HIDDEN)).toEqual({ patch: {}, onlyWhileHidden: true });
  });
});

describe("catalogFillPlan: invariants over every row and context", () => {
  const rows: CatalogFillRow[] = [];
  for (const createdBy of [ME, SOMEONE_ELSE, null]) {
    for (const blindPending of [false, true]) {
      for (const imageUrl of [null, "", "  ", "https://x/old.jpg"]) {
        for (const description of [null, "", "Kept."]) {
          for (const alcoholPercent of [null, 0, "12.0"] as const) {
            rows.push({ createdBy, blindPending, imageUrl, description, alcoholPercent });
          }
        }
      }
    }
  }
  const sources: CatalogFillSource[] = [
    SOURCE,
    { imageUrl: SCAN, description: null, alcohol: null },
    { imageUrl: null, description: "Text.", alcohol: 14 },
  ];
  const contexts: CatalogFillContext[] = [CATALOG, FLIGHT_HIDDEN, FLIGHT_OPEN];

  it("no flight plan ever carries image_url", () => {
    for (const r of rows) {
      for (const s of sources) {
        for (const c of contexts.filter((context) => context.kind === "flight")) {
          const plan = catalogFillPlan(r, s, ME, c);
          if (plan) expect(plan.patch).not.toHaveProperty("image_url");
        }
      }
    }
  });

  it("no flight plan with a hidden glass ever touches a public wine", () => {
    for (const r of rows.filter((candidate) => !candidate.blindPending)) {
      for (const s of sources) expect(catalogFillPlan(r, s, ME, FLIGHT_HIDDEN)).toBeNull();
    }
  });

  it("a catalog plan never sets onlyWhileHidden", () => {
    for (const r of rows) {
      for (const s of sources) {
        const plan = catalogFillPlan(r, s, ME, CATALOG);
        if (plan) expect(plan.onlyWhileHidden).toBe(false);
      }
    }
  });

  it("only the caller's own wine ever gets a plan", () => {
    for (const r of rows.filter((candidate) => candidate.createdBy !== ME)) {
      for (const s of sources) {
        for (const c of contexts) expect(catalogFillPlan(r, s, ME, c)).toBeNull();
      }
    }
  });
});
