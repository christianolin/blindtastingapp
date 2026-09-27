import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { UNREVEALED_GLASS_EDIT } from "../catalog/rule1-guard";
import {
  NOTE_RULE1_MESSAGE,
  NOTE_SAVE_REFUSAL,
  isNoteRule1Refusal,
  noteSaveRefusal,
  saveRefusalMessage,
} from "./rule1-guard";

// The notes Rule 1 guard's refusal (sharing-defaults spec 2026-09-27 S12, §5.3).

const MIGRATION = "supabase/migrations/20260927140000_sharing_defaults.sql";

describe("isNoteRule1Refusal", () => {
  it("is true for the guard's own 42501 with exactly its message", () => {
    expect(isNoteRule1Refusal({ code: "42501", message: NOTE_RULE1_MESSAGE })).toBe(true);
  });

  it("is false for RLS's own 42501", () => {
    expect(
      isNoteRule1Refusal({ code: "42501", message: 'new row violates row-level security policy for table "wset_notes"' }),
    ).toBe(false);
  });

  it("is false for the same message under another code, and for the catalog guard's sentence", () => {
    expect(isNoteRule1Refusal({ code: "P0001", message: NOTE_RULE1_MESSAGE })).toBe(false);
    expect(isNoteRule1Refusal({ code: "42501", message: UNREVEALED_GLASS_EDIT })).toBe(false);
  });

  it("is false for no error", () => {
    expect(isNoteRule1Refusal(null)).toBe(false);
    expect(isNoteRule1Refusal(undefined)).toBe(false);
    expect(isNoteRule1Refusal({})).toBe(false);
  });
});

describe("the guard's message is pinned to the migration", () => {
  // Normalised so a CRLF checkout (Windows autocrlf) matches.
  const sql = readFileSync(MIGRATION, "utf8").replace(/\r\n/g, "\n");
  const quoted = "message = '" + NOTE_RULE1_MESSAGE.replaceAll("'", "''") + "'";

  it("raises exactly this message once", () => {
    expect(sql.split(quoted).length - 1).toBe(1);
  });

  it("raises it as 42501", () => {
    expect(sql.split("errcode = '42501',\n      " + quoted).length - 1).toBe(1);
  });
});

describe("save refusals", () => {
  it("carry their sentence to the sheet", () => {
    const error = noteSaveRefusal(NOTE_RULE1_MESSAGE);
    expect(error.name).toBe(NOTE_SAVE_REFUSAL);
    expect(saveRefusalMessage(error)).toBe(NOTE_RULE1_MESSAGE);
  });

  it("leave every other error to the bare Retry save", () => {
    expect(saveRefusalMessage(new Error("fetch failed"))).toBeNull();
    expect(saveRefusalMessage("NoteSaveRefusal")).toBeNull();
    expect(saveRefusalMessage(null)).toBeNull();
  });
});
