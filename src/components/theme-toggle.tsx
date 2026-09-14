"use client";

// The Appearance control: Light, Dark or Match system.
//
// Three explicit choices, light the default (owner, 2026-09-14: "Light unless
// chosen"). A visitor who has never clicked stores nothing and renders light,
// so Light shows as selected for them -- it IS what they have.
//
// What each button stores, which one is pressed and the line beneath all come
// from themeControl in theme.ts, where theme.test.ts clicks every option. This
// file only draws them and hands each click straight to its option's onSelect.
// Match system has to store "system" (an empty key now means light), and a
// handler written here instead -- it used to clear the key -- is exactly what
// no test could see, so theme.test.ts also pins that wiring at the source.
//
// Stacked rather than a segmented row: "Match system" does not fit a third of
// this card's width.
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { themeControl, useTheme, type ThemeOption } from "@/lib/theme";

const ICONS: Record<ThemeOption, typeof Sun> = { light: Sun, dark: Moon, system: Monitor };

export function ThemeToggle() {
  const { theme, choice } = useTheme();
  const { options, note } = themeControl(choice, theme);

  return (
    <div className="flex flex-col gap-2">
      <div role="group" aria-label="Colour theme" className="flex flex-col gap-2">
        {options.map(({ value, label, pressed, onSelect }) => {
          const Icon = ICONS[value];
          return (
            <Button
              key={value}
              type="button"
              variant={pressed ? "secondary" : "outline"}
              aria-pressed={pressed}
              className="w-full justify-start gap-2"
              onClick={onSelect}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </Button>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">{note}</p>
    </div>
  );
}
