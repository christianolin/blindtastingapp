import {
  AR, AT, AU, BG, BR, CA, CH, CL, CN, CZ, DE, ES, FR, GB, GE, GR, HR, HU,
  IL, IT, JP, LB, LT, MD, MX, NZ, PT, RO, SI, TR, US, UY, ZA,
} from "country-flag-icons/react/3x2";
import { cn } from "@/lib/utils";
import { countryCode } from "@/lib/country-flag";

// Only the codes country-flag.ts maps are imported by name, so the bundle
// carries these ~33 SVGs instead of the full country-flag-icons set (dynamic
// namespace indexing would defeat tree-shaking). Keep in sync with CODES.
const FLAGS: Record<string, typeof FR> = {
  AR, AT, AU, BG, BR, CA, CH, CL, CN, CZ, DE, ES, FR, GB, GE, GR, HR, HU,
  IL, IT, JP, LB, LT, MD, MX, NZ, PT, RO, SI, TR, US, UY, ZA,
};

// Real SVG country flag, keyed off the country name. Renders identically on
// every OS (unlike emoji flags, which Windows shows as two letters). Returns
// nothing for an unknown/empty country so callers can render it unconditionally.
export function CountryFlag({
  name,
  className,
}: {
  name: string | null | undefined;
  className?: string;
}) {
  const code = countryCode(name);
  if (!code) return null;
  const Flag = FLAGS[code];
  if (!Flag) return null;
  return (
    <Flag
      aria-hidden
      className={cn(
        "inline-block h-3.5 w-[1.35rem] shrink-0 rounded-[2px] object-cover align-[-0.15em]",
        className,
      )}
    />
  );
}
