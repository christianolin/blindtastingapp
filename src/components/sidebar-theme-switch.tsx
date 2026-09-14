"use client";

// The quick theme flip, in the sidebar above the profile row.
//
// Deliberately NOT the control from /profile/edit. That one is the settings
// surface: three states, including "Match system", laid out on a card. This is
// a switch you hit on the way past, so it flips between light and dark and
// nothing else. Someone who wants to go back to following the OS does it where
// the rest of the settings live.
//
// Styled from the sidebar's own vocabulary rather than the Button component.
// The rail is `bg-primary text-primary-foreground` -- indigo in dark, bordeaux
// in light -- so a card-styled button would sit on it as a foreign object. The
// nav items above it use primary-foreground tints for exactly this reason and
// this matches them.
//
// role="switch" with aria-checked, not a pair of buttons: there are two states
// and one control, which is what a switch is. The label says what it turns on
// ("Dark mode"), so aria-checked reads as on/off against that, and the title
// mentions when the theme is currently coming from the OS rather than a choice
// -- otherwise the switch silently looks like a pinned setting.
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";

export function SidebarThemeSwitch({ variant }: { variant: "full" | "rail" }) {
  const { theme, choice, setChoice } = useTheme();
  const isDark = theme === "dark";
  const following = choice === null;
  const title = following
    ? `Dark mode (currently following your system, which is ${theme})`
    : "Dark mode";

  // Deliberately does NOT take the drawer's onNavigate. That closes the mobile
  // menu after a link, which is right for a link and wrong here: flipping a
  // switch is not navigating, and having the menu vanish under you is a
  // surprise. The drawer stays open and simply repaints.
  const flip = () => setChoice(isDark ? "light" : "dark");

  if (variant === "rail") {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={isDark}
        aria-label="Dark mode"
        title={title}
        onClick={flip}
        className="flex size-11 items-center justify-center rounded-lg text-primary-foreground/70 transition-colors hover:bg-primary-foreground/10 hover:text-primary-foreground"
      >
        {isDark ? <Moon className="size-[18px]" /> : <Sun className="size-[18px]" />}
      </button>
    );
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      title={title}
      onClick={flip}
      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm font-medium text-primary-foreground/70 transition-colors hover:bg-primary-foreground/10 hover:text-primary-foreground"
    >
      {isDark ? (
        <Moon className="size-[18px] shrink-0" />
      ) : (
        <Sun className="size-[18px] shrink-0" />
      )}
      <span className="min-w-0 flex-1 truncate text-left">Dark mode</span>
      {/* The track. Built from primary-foreground tints so it reads on both the
          bordeaux and the indigo rail; a bg-input/bg-primary track would be
          near-invisible on one of them.
          /45 off, not /25: a switch is a UI component, so its own shape needs
          3:1 against the surface behind it (WCAG 1.4.11). /25 measured 2.08 on
          the indigo rail and 1.96 on the bordeaux one; /45 gives 3.67 and 3.42.
          /80 on is 8.19. */}
      <span
        aria-hidden
        className={cn(
          "relative h-[18px] w-8 shrink-0 rounded-full transition-colors",
          isDark ? "bg-primary-foreground/80" : "bg-primary-foreground/45",
        )}
      >
        <span
          className={cn(
            "absolute top-[3px] size-3 rounded-full transition-[left] duration-150",
            isDark ? "left-[17px] bg-primary" : "left-[3px] bg-primary-foreground",
          )}
        />
      </span>
    </button>
  );
}
