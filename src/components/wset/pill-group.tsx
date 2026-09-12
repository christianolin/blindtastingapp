"use client";

import { cn } from "@/lib/utils";

// Rounded pill selector. Single-select (default) holds one value or null and
// deselects on a second click; multi-select holds an array and toggles. The
// `multi` flag discriminates the prop shape so each caller gets precise types.
type Base<T extends string> = {
  options: readonly T[];
  labels: Record<string, string>;
};
type SingleProps<T extends string> = Base<T> & {
  multi?: false;
  value: T | null;
  onChange: (value: T | null) => void;
};
type MultiProps<T extends string> = Base<T> & {
  multi: true;
  value: readonly T[];
  onChange: (value: T[]) => void;
};

// Phone tap target: an invisible ::before strip, 44px tall and centred, lifts
// a compact control's hit area without making it look chunky. Pills and chips
// pair it with a 34px visual height and a 10px row gap, so two wrapped rows'
// strips meet without overlapping (44px rows). From sm up the dense worksheet
// sizes return and the strip goes (mouse precision; it would overlap there).
export const PHONE_HIT_44 =
  "relative before:absolute before:inset-x-0 before:top-1/2 before:h-11 before:-translate-y-1/2 sm:before:hidden";

export function PillGroup<T extends string>(props: SingleProps<T> | MultiProps<T>) {
  const { options, labels } = props;
  const isSelected = (opt: T) =>
    props.multi ? props.value.includes(opt) : props.value === opt;

  const toggle = (opt: T) => {
    if (props.multi) {
      const set = props.value;
      props.onChange(
        set.includes(opt) ? set.filter((v) => v !== opt) : [...set, opt],
      );
    } else {
      props.onChange(props.value === opt ? null : opt);
    }
  };

  return (
    <div className="flex flex-wrap gap-x-1.5 gap-y-2.5 sm:gap-1">
      {options.map((opt) => {
        const selected = isSelected(opt);
        return (
          <button
            key={opt}
            type="button"
            aria-pressed={selected}
            onClick={() => toggle(opt)}
            className={cn(
              PHONE_HIT_44,
              "inline-flex min-h-[34px] cursor-pointer items-center rounded-full border border-border-strong px-3.5 text-[12.5px] leading-[1.35]",
              "sm:min-h-0 sm:px-[9px] sm:py-0.5 sm:text-[11.5px]",
              selected
                ? "bg-primary font-semibold text-primary-foreground"
                : "bg-card font-medium text-foreground",
            )}
          >
            {labels[opt] ?? opt}
          </button>
        );
      })}
    </div>
  );
}
