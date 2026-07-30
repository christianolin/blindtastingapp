import type { FC, SVGProps } from "react";
import * as Flags from "country-flag-icons/react/3x2";
import { cn } from "@/lib/utils";
import { countryCode } from "@/lib/country-flag";

type FlagComponent = FC<SVGProps<SVGSVGElement> & { title?: string }>;

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
  const Flag = (Flags as unknown as Record<string, FlagComponent | undefined>)[code];
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
