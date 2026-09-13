"use client";

// The Appearance control: pick Light or Dark, or go back to following the OS.
//
// Two buttons rather than one switch, because the state being shown is not
// binary. A visitor who has never clicked is on neither option explicitly --
// they are mirroring their system -- and a switch has nowhere to say that. The
// segmented pair shows which theme is CURRENTLY rendering, and the line beneath
// says whether that came from a choice or from the OS.
//
// "Match system" only appears once a choice is pinned. Without it one click
// strands the user off their OS setting for good, which is a worse default than
// the one click saved them.
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme, type Theme } from "@/lib/theme";

const OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
];

export function ThemeToggle() {
  const { theme, choice, setChoice } = useTheme();

  return (
    <div className="flex flex-col gap-2">
      <div
        role="group"
        aria-label="Colour theme"
        className="flex gap-2"
      >
        {OPTIONS.map(({ value, label, Icon }) => (
          <Button
            key={value}
            type="button"
            variant={theme === value ? "secondary" : "outline"}
            // aria-pressed tracks what is RENDERING, not what is stored, so a
            // screen reader following the OS still hears which theme is on.
            aria-pressed={theme === value}
            className="flex-1 justify-center gap-2"
            onClick={() => setChoice(value)}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Button>
        ))}
      </div>

      {choice ? (
        <Button
          type="button"
          variant="link"
          className="h-auto self-start p-0 text-xs"
          onClick={() => setChoice(null)}
        >
          <Monitor className="size-3.5" aria-hidden />
          Match system
        </Button>
      ) : (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Monitor className="size-3.5" aria-hidden />
          Matching your system setting
        </p>
      )}
    </div>
  );
}
