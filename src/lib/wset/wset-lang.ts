"use client";

// The shared WSET sheet language, backed by localStorage so every sheet on the
// page (the editable note AND the read-only archetype view) agrees, and the
// choice survives reloads. There is no wrapping provider — sheets render on
// different pages/modals — so this is a tiny external store consumed through
// useSyncExternalStore. Any subscriber re-renders when the toggle flips.
//
// First run (nothing stored): English by default, UNLESS the browser is set to
// Danish (navigator.language "da…"), in which case Danish is auto-selected.
// Once the user picks a language explicitly it is persisted and detection no
// longer applies.
import { useSyncExternalStore } from "react";
import type { WsetLang } from "./i18n";

const KEY = "wset-lang";

/** English default; Danish only when the browser's language is Danish. */
function detect(): WsetLang {
  if (typeof navigator === "undefined") return "en";
  const langs = navigator.languages ?? [navigator.language];
  return langs.some((l) => l?.toLowerCase().startsWith("da")) ? "da" : "en";
}

/** The effective language: an explicit stored choice, else browser detection. */
function read(): WsetLang {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(KEY);
  if (stored === "en" || stored === "da") return stored;
  return detect();
}

const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  // Cross-tab: another tab changing the setting updates this one too.
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** Persist an explicit choice and notify every subscriber in this tab. */
export function setWsetLang(lang: WsetLang): void {
  window.localStorage.setItem(KEY, lang);
  for (const cb of listeners) cb();
}

// The server (and the very first client paint, before hydration) must agree, so
// getServerSnapshot returns the English default; useSyncExternalStore then
// re-renders with the real value on the client. The sheet is client-only, so
// this at most swaps English → Danish once on mount for a Danish browser.
export function useWsetLang(): {
  lang: WsetLang;
  setLang: (lang: WsetLang) => void;
} {
  const lang = useSyncExternalStore(subscribe, read, () => "en" as WsetLang);
  return { lang, setLang: setWsetLang };
}
