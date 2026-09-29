// scripts/usa-reference/us-country-guard.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { isUsCountry } from "./us-country-guard.mjs";

test("LWIN's USA and the database's United States are both refused; others pass", () => {
  for (const c of ["USA", "United States", " usa ", "united states"]) assert.equal(isUsCountry(c), true, c);
  for (const c of ["France", "Australia", "NA", "", null, undefined]) assert.equal(isUsCountry(c), false, String(c));
});
