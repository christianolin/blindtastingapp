"use client";

import { WSET } from "./tokens";

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
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {options.map((opt) => {
        const selected = isSelected(opt);
        return (
          <button
            key={opt}
            type="button"
            aria-pressed={selected}
            onClick={() => toggle(opt)}
            style={{
              borderRadius: 999,
              padding: "7px 15px",
              fontSize: 12.5,
              cursor: "pointer",
              transition: "transform 120ms, box-shadow 120ms",
              background: selected ? WSET.burgundy : WSET.pillBg,
              border: `1px solid ${WSET.pillBorder}`,
              color: selected ? WSET.creamText : WSET.pillText,
              fontWeight: selected ? 600 : 500,
            }}
          >
            {labels[opt] ?? opt}
          </button>
        );
      })}
    </div>
  );
}
