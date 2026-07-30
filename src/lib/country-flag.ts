// Country name -> flag emoji for the wine-producing countries in the catalog.
// Unknown names return "" (no flag), never a broken glyph.
const FLAGS: Record<string, string> = {
  france: "🇫🇷",
  italy: "🇮🇹",
  spain: "🇪🇸",
  "united states": "🇺🇸",
  "united states of america": "🇺🇸",
  usa: "🇺🇸",
  germany: "🇩🇪",
  portugal: "🇵🇹",
  austria: "🇦🇹",
  australia: "🇦🇺",
  "new zealand": "🇳🇿",
  argentina: "🇦🇷",
  chile: "🇨🇱",
  "south africa": "🇿🇦",
  greece: "🇬🇷",
  hungary: "🇭🇺",
  "united kingdom": "🇬🇧",
  england: "🇬🇧",
  switzerland: "🇨🇭",
  canada: "🇨🇦",
  lebanon: "🇱🇧",
  israel: "🇮🇱",
  croatia: "🇭🇷",
  slovenia: "🇸🇮",
  romania: "🇷🇴",
  georgia: "🇬🇪",
  bulgaria: "🇧🇬",
  "czech republic": "🇨🇿",
  moldova: "🇲🇩",
  brazil: "🇧🇷",
  uruguay: "🇺🇾",
  mexico: "🇲🇽",
  china: "🇨🇳",
  japan: "🇯🇵",
  turkey: "🇹🇷",
  lithuania: "🇱🇹",
};

export function countryFlag(name: string | null | undefined): string {
  if (!name) return "";
  return FLAGS[name.trim().toLowerCase()] ?? "";
}
