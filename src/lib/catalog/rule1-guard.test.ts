import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { attachNotice } from "../catalog-photos/strip";
import { isUnrevealedGlassRefusal, UNREVEALED_GLASS_EDIT, UNREVEALED_GLASS_PHOTO } from "./rule1-guard";

// The rule-1 guards' refusal (spec 2026-09-19-rule1-usage-and-main-photo §5.4, D11, T2).

const MIGRATION = "supabase/migrations/20260919213300_rule1_usage_and_main_photo.sql";

describe("isUnrevealedGlassRefusal", () => {
  it("is true for the guards' own 42501 with exactly their message", () => {
    expect(isUnrevealedGlassRefusal({ code: "42501", message: UNREVEALED_GLASS_EDIT })).toBe(true);
  });

  it("is false for RLS's own 42501", () => {
    expect(
      isUnrevealedGlassRefusal({
        code: "42501",
        message: 'new row violates row-level security policy for table "catalog_wine_grapes"',
      }),
    ).toBe(false);
  });

  it("is false for the same message under another code", () => {
    expect(isUnrevealedGlassRefusal({ code: "P0001", message: UNREVEALED_GLASS_EDIT })).toBe(false);
  });

  it("is false for no error", () => {
    expect(isUnrevealedGlassRefusal(null)).toBe(false);
    expect(isUnrevealedGlassRefusal(undefined)).toBe(false);
    expect(isUnrevealedGlassRefusal({})).toBe(false);
  });
});

describe("the guards' message is pinned to the migration", () => {
  // Normalised so a CRLF checkout (Windows autocrlf) matches.
  const sql = readFileSync(MIGRATION, "utf8").replace(/\r\n/g, "\n");
  const quoted = "message = '" + UNREVEALED_GLASS_EDIT.replaceAll("'", "''") + "'";

  it("raises exactly this message twice, once per guard", () => {
    expect(sql.split(quoted).length - 1).toBe(2);
  });

  it("raises it as 42501", () => {
    expect(sql.split("errcode = '42501',\n      " + quoted).length - 1).toBe(2);
  });
});

describe("UNREVEALED_GLASS_PHOTO", () => {
  it("is the wine page's own line for an unrevealed glass", () => {
    expect(UNREVEALED_GLASS_PHOTO).toBe(attachNotice("unrevealed-glass"));
  });
});
