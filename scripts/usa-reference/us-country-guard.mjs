// US-1 (spec §6.4): scripts/add-appellation-designations.mjs once appended a
// false " AVA" to 21 US county and state rows. It must never touch a US row
// again. LWIN writes the country "USA"; the database writes "United States".
export function isUsCountry(country) {
  const c = String(country ?? "").trim().toLowerCase();
  return c === "usa" || c === "united states";
}
