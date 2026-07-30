// Country name -> ISO 3166-1 alpha-2 code (uppercase), for rendering real SVG
// flags via <CountryFlag>. Emoji flags don't render on Windows (they fall back
// to the two regional-indicator letters, e.g. "FR"), so we map names to codes
// and draw SVGs instead. Unknown names return null (no flag), never a broken glyph.
const CODES: Record<string, string> = {
  france: "FR",
  italy: "IT",
  spain: "ES",
  "united states": "US",
  "united states of america": "US",
  usa: "US",
  germany: "DE",
  portugal: "PT",
  austria: "AT",
  australia: "AU",
  "new zealand": "NZ",
  argentina: "AR",
  chile: "CL",
  "south africa": "ZA",
  greece: "GR",
  hungary: "HU",
  "united kingdom": "GB",
  england: "GB",
  switzerland: "CH",
  canada: "CA",
  lebanon: "LB",
  israel: "IL",
  croatia: "HR",
  slovenia: "SI",
  romania: "RO",
  georgia: "GE",
  bulgaria: "BG",
  "czech republic": "CZ",
  moldova: "MD",
  brazil: "BR",
  uruguay: "UY",
  mexico: "MX",
  china: "CN",
  japan: "JP",
  turkey: "TR",
  lithuania: "LT",
};

export function countryCode(name: string | null | undefined): string | null {
  if (!name) return null;
  return CODES[name.trim().toLowerCase()] ?? null;
}
