import { describe, expect, it } from "vitest";
import { GROUP_COLUMNS, INVALID_VINTAGE, groupForField, groupPayload, vintageOptions } from "./guess-write";
import type { GuessRow } from "./ladder-types";

const empty: GuessRow = {
  country_id: null, region_id: null, appellation_id: null, primary_grape_id: null, secondary_grape_id: null,
  producer_id: null, type_designation_id: null, vintage_kind: null, vintage_year: null, vintage_tawny_years: null,
};
const now = new Date("2026-09-13T12:00:00Z");

describe("field groups (B7)", () => {
  it("maps every ladder field", () => {
    expect([groupForField("country"), groupForField("region"), groupForField("appellation")]).toEqual(["origin", "origin", "origin"]);
    expect([groupForField("primary_grape"), groupForField("secondary_grape")]).toEqual(["grapes", "grapes"]);
    expect(groupForField("producer")).toBe("producer");
    expect(groupForField("type_designation")).toBe("designation");
    expect(groupForField("vintage")).toBe("vintage");
  });
  it("names exactly the columns each group writes", () => {
    expect(GROUP_COLUMNS).toEqual({
      origin: ["country_id", "region_id", "appellation_id"],
      grapes: ["primary_grape_id", "secondary_grape_id"],
      producer: ["producer_id"],
      designation: ["type_designation_id"],
      vintage: ["vintage_kind", "vintage_year", "vintage_tawny_years"],
    });
  });
});

describe("groupPayload", () => {
  it("origin carries the country a region pick set", () => {
    expect(groupPayload("origin", { ...empty, country_id: "it", region_id: "piemonte" }, now))
      .toEqual({ values: { country_id: "it", region_id: "piemonte", appellation_id: null } });
  });
  it("vintage: a year from 1900 to next UTC year", () => {
    expect(groupPayload("vintage", { ...empty, vintage_kind: "YEAR", vintage_year: 1900 }, now))
      .toEqual({ values: { vintage_kind: "YEAR", vintage_year: 1900, vintage_tawny_years: null } });
    expect(groupPayload("vintage", { ...empty, vintage_kind: "YEAR", vintage_year: 2027 }, now)).toHaveProperty("values");
    expect(groupPayload("vintage", { ...empty, vintage_kind: "YEAR", vintage_year: 1899 }, now)).toEqual({ error: INVALID_VINTAGE });
    expect(groupPayload("vintage", { ...empty, vintage_kind: "YEAR", vintage_year: 2028 }, now)).toEqual({ error: INVALID_VINTAGE });
    expect(groupPayload("vintage", { ...empty, vintage_kind: "YEAR", vintage_year: null }, now)).toEqual({ error: INVALID_VINTAGE });
  });
  it("vintage: tawny 1–100; NV and a skip clear the numbers", () => {
    expect(groupPayload("vintage", { ...empty, vintage_kind: "TAWNY", vintage_tawny_years: 25, vintage_year: 2001 }, now))
      .toEqual({ values: { vintage_kind: "TAWNY", vintage_year: null, vintage_tawny_years: 25 } });
    expect(groupPayload("vintage", { ...empty, vintage_kind: "TAWNY", vintage_tawny_years: 0 }, now)).toEqual({ error: INVALID_VINTAGE });
    expect(groupPayload("vintage", { ...empty, vintage_kind: "TAWNY", vintage_tawny_years: 101 }, now)).toEqual({ error: INVALID_VINTAGE });
    expect(groupPayload("vintage", { ...empty, vintage_kind: "NV", vintage_year: 2010 }, now))
      .toEqual({ values: { vintage_kind: "NV", vintage_year: null, vintage_tawny_years: null } });
    expect(groupPayload("vintage", empty, now))
      .toEqual({ values: { vintage_kind: null, vintage_year: null, vintage_tawny_years: null } });
  });
});

describe("vintageOptions", () => {
  it("next UTC year down to 1900, and the tawny steps", () => {
    const { years, tawny } = vintageOptions(now);
    expect(years[0]).toBe(2027);
    expect(years[years.length - 1]).toBe(1900);
    expect(years).toHaveLength(128);
    expect(tawny).toEqual([10, 20, 30, 40]);
  });
  it("follows the UTC year across midnight", () => {
    expect(vintageOptions(new Date("2026-12-31T23:30:00-05:00")).years[0]).toBe(2028);
  });
});

describe("the server never trusts the client's shape", () => {
  it("every group's payload writes exactly its GROUP_COLUMNS", () => {
    for (const group of Object.keys(GROUP_COLUMNS) as (keyof typeof GROUP_COLUMNS)[]) {
      const result = groupPayload(group, empty, now);
      if (!("values" in result)) throw new Error(`${group} refused an empty row`);
      expect(Object.keys(result.values).sort()).toEqual([...GROUP_COLUMNS[group]].sort());
    }
  });
  it("carries nothing outside the group; a blank or non-string id becomes null", () => {
    const crafted = { ...empty, country_id: "", region_id: 42, producer_id: "vietti", locked_at: "2026-09-13T12:00:00Z" } as unknown as GuessRow;
    expect(groupPayload("origin", crafted, now)).toEqual({ values: { country_id: null, region_id: null, appellation_id: null } });
  });
  it("a malformed vintage is refused", () => {
    expect(groupPayload("vintage", { ...empty, vintage_kind: "YEAR", vintage_year: 2001.5 }, now)).toEqual({ error: INVALID_VINTAGE });
    expect(groupPayload("vintage", { ...empty, vintage_kind: "YEAR", vintage_year: "2001" } as unknown as GuessRow, now)).toEqual({ error: INVALID_VINTAGE });
    expect(groupPayload("vintage", { ...empty, vintage_kind: "TAWNY", vintage_tawny_years: 12.5 }, now)).toEqual({ error: INVALID_VINTAGE });
    expect(groupPayload("vintage", { ...empty, vintage_kind: "MAGNUM" } as unknown as GuessRow, now)).toEqual({ error: INVALID_VINTAGE });
  });
});
