"use client";

// The Appearance control: Light, Dark or Match system.
//
// Three explicit choices, light the default (owner, 2026-09-14: "Light unless
// chosen"). A visitor who has never clicked stores nothing and renders light,
// so Light shows as selected for them -- it IS what they have.
//
// Match system stores "system". It cannot clear the key the way it used to: an
// empty key now means light, so clearing it would ignore the OS it names.
//
// aria-pressed tracks the CHOICE, not the rendering theme, so Match system is
// never shown alongside whichever of Light or Dark the OS happens to give; the
// line beneath says which one that is right now.
//
// Stacked rather than a segmented row: "Match system" does not fit a third of
// this card's width.
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme, type ThemeChoice } from "@/lib/theme";

type Option = NonNullable<ThemeChoice>;

const OPTIONS: { value: Option; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "Match system", Icon: Monitor },
];

export function ThemeToggle() {
  const { theme, choice, setChoice } = useTheme();
  const selected: Option = choice ?? "light";

  return (
    <div className="flex flex-col gap-2">
      <div role="group" aria-label="Colour theme" className="flex flex-col gap-2">
        {OPTIONS.map(({ value, label, Icon }) => (
          <Button
            key={value}
            type="button"
            variant={selected === value ? "secondary" : "outline"}
            aria-pressed={selected === value}
            className="w-full justify-start gap-2"
            onClick={() => setChoice(value)}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        {selected === "system"
          ? `Following your device setting, which is ${theme} right now.`
          : "Applies in this browser."}
      </p>
    </div>
  );
}
