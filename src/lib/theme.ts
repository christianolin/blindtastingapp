"use client";

// The app's light/dark theme, backed by localStorage so the choice survives
// reloads and agrees across tabs. Sibling of wset-lang.ts and built the same
// way: a tiny external store read through useSyncExternalStore, no provider,
// because the control lives on one page and the theme applies to every page.
//
// LIGHT UNLESS CHOSEN (owner, 2026-09-14). Blindr opens light even when the OS
// is dark. Following the OS by default turned the whole app dark for anyone
// with a dark OS ("the colors are weird now ... No tasting is live"), so dark is
// opt-in: it applies only when a user picks Dark in Profile & settings, and
// following the OS is itself an explicit choice, "Match system".
//
// TWO pieces of state, and conflating them is the mistake to avoid:
//
//   stored     "light" | "dark" | "system" | null
//   effective  "light" | "dark"                     what actually renders
//
//   null      nothing stored, or a value that is none of the three: light
//   "light"   light
//   "dark"    dark
//   "system"  prefers-color-scheme, and it KEEPS following it: subscribe()
//             listens to the media query, so a user whose OS switches at
//             sunset switches with it.
//
// "system" is stored, not the absence of a value. An empty key means light now,
// so a "Match system" that cleared the key would do the opposite of its label.
//
// The inline script in layout.tsx repeats this rule before the first paint;
// theme.test.ts runs that script against this file for every stored value.
import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";
/** What is stored. null = nothing (or nothing valid) stored, which renders light. */
export type ThemeChoice = Theme | "system" | null;

export const THEME_KEY = "blindr-theme";
const QUERY = "(prefers-color-scheme: dark)";

/** What the OS asks for. Light when it has no opinion or cannot be asked. */
function systemTheme(): Theme {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia(QUERY).matches ? "dark" : "light";
}

/**
 * The stored choice, or null. Anything that is not exactly "light", "dark" or
 * "system" counts as absent: a corrupted or stale value degrades to the light
 * default rather than throwing on every render. Private-mode localStorage
 * access can throw outright, which is the same outcome.
 */
export function readChoice(): ThemeChoice {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    return stored === "light" || stored === "dark" || stored === "system" ? stored : null;
  } catch {
    return null;
  }
}

/** The theme a choice renders: dark only when chosen, the OS only when asked. */
export function themeForChoice(choice: ThemeChoice): Theme {
  if (choice === "dark") return "dark";
  if (choice === "system") return systemTheme();
  return "light";
}

/** The theme that should actually render. */
export function readTheme(): Theme {
  return themeForChoice(readChoice());
}

const listeners = new Set<() => void>();
const notify = () => { for (const cb of listeners) cb(); };

/** Exported so tests can prove the OS and cross-tab paths actually fire. */
export function subscribeToTheme(cb: () => void): () => void {
  listeners.add(cb);
  // Another tab changing the setting updates this one.
  const onStorage = (e: StorageEvent) => { if (e.key === THEME_KEY) cb(); };
  window.addEventListener("storage", onStorage);
  // And the OS switching updates every tab on "system". Without this, Match
  // system would only be honoured at page load. For any other choice the
  // snapshot does not change, so nothing re-renders.
  const mq = window.matchMedia?.(QUERY);
  mq?.addEventListener("change", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
    mq?.removeEventListener("change", cb);
  };
}

/**
 * Put the theme on <html>. The class is what the .dark block in globals.css
 * keys off; colorScheme is what native scrollbars, form controls and the
 * autofill background key off, and the class alone does not give you that.
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

/** Store a choice and apply it. null clears the key, which renders light. */
export function setThemeChoice(choice: ThemeChoice): void {
  try {
    if (choice) window.localStorage.setItem(THEME_KEY, choice);
    else window.localStorage.removeItem(THEME_KEY);
  } catch {
    // Private mode or blocked storage: the theme still applies for this page,
    // it just will not survive a reload. Better than failing the click.
  }
  applyTheme(themeForChoice(choice));
  notify();
}

/**
 * The server, and the first client paint before hydration, both return "light"
 * and no choice. The server cannot know the stored choice or the OS preference.
 * The inline script in layout.tsx is what stops that default from ever being
 * SEEN by someone on Dark -- it sets the class before the first paint, so this
 * snapshot only affects what React thinks, for one tick.
 */
export function useTheme(): {
  theme: Theme;
  choice: ThemeChoice;
  setChoice: (choice: ThemeChoice) => void;
} {
  const theme = useSyncExternalStore(subscribeToTheme, readTheme, () => "light" as Theme);
  const choice = useSyncExternalStore(subscribeToTheme, readChoice, () => null);
  return { theme, choice, setChoice: setThemeChoice };
}
