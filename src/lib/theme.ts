"use client";

// The app's light/dark theme, backed by localStorage so the choice survives
// reloads and agrees across tabs. Sibling of wset-lang.ts and built the same
// way: a tiny external store read through useSyncExternalStore, no provider,
// because the control lives on one page and the theme applies to every page.
//
// TWO pieces of state, and conflating them is the mistake to avoid:
//
//   stored     "light" | "dark" | null    null means "follow the OS"
//   effective  "light" | "dark"           what actually renders
//
// A first-time visitor stores nothing and follows prefers-color-scheme -- and
// keeps following it, because subscribe() listens to the media query too. A
// user whose OS switches at sunset switches with it. Clicking the toggle pins
// the choice and the media query stops mattering; "Match system" clears it.
import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";
/** null = no explicit choice, follow the OS. */
export type ThemeChoice = Theme | null;

export const THEME_KEY = "blindr-theme";
const QUERY = "(prefers-color-scheme: dark)";

/** What the OS asks for. Light when it has no opinion or cannot be asked. */
export function systemTheme(): Theme {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia(QUERY).matches ? "dark" : "light";
}

/**
 * The stored choice, or null. Anything that is not exactly "light" or "dark"
 * counts as absent: a corrupted or stale value degrades to following the OS
 * rather than throwing on every render. Private-mode localStorage access can
 * throw outright, which is the same outcome.
 */
export function readChoice(): ThemeChoice {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    return stored === "light" || stored === "dark" ? stored : null;
  } catch {
    return null;
  }
}

/** The theme that should actually render: an explicit choice, else the OS. */
export function readTheme(): Theme {
  return readChoice() ?? "light";
}

const listeners = new Set<() => void>();
const notify = () => { for (const cb of listeners) cb(); };

/** Exported so tests can prove the OS and cross-tab paths actually fire. */
export function subscribeToTheme(cb: () => void): () => void {
  listeners.add(cb);
  // Another tab changing the setting updates this one.
  const onStorage = (e: StorageEvent) => { if (e.key === THEME_KEY) cb(); };
  window.addEventListener("storage", onStorage);
  // And the OS switching updates every tab that has not pinned a choice. Without
  // this the "follow the OS" default would only be honoured at page load.
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

/** Pin a theme, or pass null to go back to following the OS. */
export function setThemeChoice(choice: ThemeChoice): void {
  try {
    if (choice) window.localStorage.setItem(THEME_KEY, choice);
    else window.localStorage.removeItem(THEME_KEY);
  } catch {
    // Private mode or blocked storage: the theme still applies for this page,
    // it just will not survive a reload. Better than failing the click.
  }
  applyTheme(choice ?? "light");
  notify();
}

/**
 * The server, and the first client paint before hydration, both return "light".
 * The server cannot know the OS preference. The inline script in layout.tsx is
 * what stops that default from ever being SEEN -- it sets the class before the
 * first paint, so this snapshot only affects what React thinks, for one tick.
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
