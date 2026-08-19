import assert from "node:assert/strict";
import test from "node:test";
import {
  nameKeys,
  buildMunicipioIndex,
  resolveOne,
  resolveMembership,
} from "./spain-lib.mjs";

const poly = { type: "MultiPolygon", coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 0]]]] };
const mun = (mun_code, mun_name, prov_code, prov_name, aliases = []) => ({
  mun_code,
  mun_name,
  aliases: aliases.length ? aliases : [mun_name],
  prov_code,
  prov_name,
  acom_code: "00",
  acom_name: "X",
  geometry: poly,
});

// A fixture with the real hazards: accents, the INE comma-article form, a
// bilingual slash name, a co-official alias pair, and a duplicate town name
// across two provinces.
const CACHE = {
  municipios: [
    mun("43064", "Gratallops", "43", "Tarragona"),
    mun("43904", "Torroja del Priorat", "43", "Tarragona"),
    mun("26089", "Logroño", "26", "La Rioja"),
    mun("15030", "Coruña, A", "15", "A Coruña"),
    mun("20069", "Donostia/San Sebastián", "20", "Gipuzkoa"),
    mun("03014", "Alacant", "03", "Alacant", ["Alacant", "Alicante"]),
    // Same town name "Villanueva" in two provinces -> province-scoped.
    mun("06001", "Villanueva", "06", "Badajoz"),
    mun("13001", "Villanueva", "13", "Ciudad Real"),
  ],
};
const INDEX = buildMunicipioIndex(CACHE);

test("nameKeys folds accents and case", () => {
  assert.ok(nameKeys("Logroño").includes("logrono"));
  assert.ok(nameKeys("GRATALLOPS").includes("gratallops"));
});

test("nameKeys de-inverts the INE comma-article form", () => {
  assert.ok(nameKeys("Coruña, A").includes("a coruna"));
  assert.ok(nameKeys("Rioja, La").includes("la rioja"));
});

test("nameKeys splits bilingual slash names into whole + each side", () => {
  const keys = nameKeys("Donostia/San Sebastián");
  assert.ok(keys.includes("donostia/san sebastian"));
  assert.ok(keys.includes("donostia"));
  assert.ok(keys.includes("san sebastian"));
});

test("resolveOne matches an inverted-article query to its natural form", () => {
  // A pliego writing "A Coruña" resolves to the "Coruña, A" record.
  assert.equal(resolveOne({ name: "A Coruña" }, INDEX).mun_code, "15030");
});

test("resolveOne matches a co-official alias (Alicante -> Alacant record)", () => {
  assert.equal(resolveOne({ name: "Alicante" }, INDEX).mun_code, "03014");
});

test("resolveOne code-first validates a consistent name", () => {
  assert.equal(
    resolveOne({ code: "43064", name: "Gratallops" }, INDEX).mun_code,
    "43064",
  );
});

test("resolveOne code-first throws on a name/code mismatch", () => {
  assert.throws(
    () => resolveOne({ code: "43064", name: "Torroja del Priorat" }, INDEX),
    /transcription mismatch/,
  );
});

test("resolveOne throws on an unknown code (fail-closed)", () => {
  assert.throws(() => resolveOne({ code: "99999", name: "Nowhere" }, INDEX), /not in georef cache/);
});

test("resolveOne throws on a name with no match (fail-closed)", () => {
  assert.throws(() => resolveOne({ name: "Chateauneuf" }, INDEX), /need exactly 1/);
});

test("resolveOne throws on an ambiguous name without a province scope", () => {
  assert.throws(() => resolveOne({ name: "Villanueva" }, INDEX), /resolved to 2 matches/);
});

test("resolveOne disambiguates a duplicate town name by province", () => {
  assert.equal(resolveOne({ name: "Villanueva" }, INDEX, ["13"]).mun_code, "13001");
  assert.equal(resolveOne({ name: "Villanueva" }, INDEX, ["Badajoz"]).mun_code, "06001");
});

test("resolveOne enforces the declared province on a code", () => {
  assert.throws(
    () => resolveOne({ code: "26089", name: "Logroño" }, INDEX, ["43"]),
    /outside declared/,
  );
});

test("resolveMembership resolves a mixed code/name entry and dedupes by code", () => {
  const records = resolveMembership(
    {
      canonical_key: "spain.cataluna.priorat",
      provinces: ["43"],
      municipios: [{ code: "43064", name: "Gratallops" }, { name: "Torroja del Priorat" }],
      expected_count: 2,
    },
    INDEX,
  );
  assert.deepEqual(records.map((r) => r.mun_code).sort(), ["43064", "43904"]);
});

test("resolveMembership throws on an expected-count mismatch (fail-closed)", () => {
  assert.throws(
    () =>
      resolveMembership(
        {
          canonical_key: "spain.cataluna.priorat",
          provinces: ["43"],
          municipios: [{ code: "43064" }],
          expected_count: 11,
        },
        INDEX,
      ),
    /resolved 1 municipios but expected_count is 11/,
  );
});

test("resolveMembership throws when the same municipio is listed twice", () => {
  assert.throws(
    () =>
      resolveMembership(
        {
          canonical_key: "spain.cataluna.priorat",
          provinces: ["43"],
          municipios: [{ code: "43064" }, { name: "Gratallops" }],
        },
        INDEX,
      ),
    /listed twice/,
  );
});
