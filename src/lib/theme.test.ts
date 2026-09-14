import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  THEME_KEY,
  applyTheme,
  readChoice,
  readTheme,
  setThemeChoice,
  subscribeToTheme,
} from "./theme";

// vitest runs in the node environment by design (see vitest.config.mts), so
// there is no window. The store touches exactly two browser APIs -- localStorage
// and matchMedia -- which is small enough to stub honestly rather than pull in
// jsdom and contradict that config.
type Stored = Record<string, string>;

function stubWindow(opts: { stored?: Stored; osDark?: boolean; throws?: boolean } = {}) {
  const store: Stored = { ...(opts.stored ?? {}) };
  const win = {
    localStorage: {
      getItem: (k: string) => {
        if (opts.throws) throw new Error("blocked");
        return k in store ? store[k] : null;
      },
      setItem: (k: string, v: string) => {
        if (opts.throws) throw new Error("blocked");
        store[k] = v;
      },
      removeItem: (k: string) => {
        if (opts.throws) throw new Error("blocked");
        delete store[k];
      },
    },
    matchMedia: (q: string) => ({
      matches: q.includes("dark") && Boolean(opts.osDark),
      addEventListener: (_t: string, cb: () => void) => void mediaListeners.push(cb),
      removeEventListener: () => {},
    }),
    addEventListener: (t: string, cb: (e: unknown) => void) => {
      if (t === "storage") storageListeners.push(cb);
    },
    removeEventListener: () => {},
  };
  vi.stubGlobal("window", win);
  return store;
}

// The listeners subscribe() hands to the browser, so a test can fire the two
// events that change the theme without a page load: another tab writing the
// key, and the OS flipping.
let mediaListeners: Array<() => void> = [];
let storageListeners: Array<(e: unknown) => void> = [];
const fireOsChange = () => mediaListeners.forEach((cb) => cb());
const fireStorage = (key: string) => storageListeners.forEach((cb) => cb({ key }));

function stubDocument() {
  const classes = new Set<string>();
  const root = {
    classList: {
      toggle: (name: string, on: boolean) => {
        if (on) classes.add(name);
        else classes.delete(name);
      },
    },
    style: { colorScheme: "" },
  };
  vi.stubGlobal("document", { documentElement: root });
  return { classes, root };
}

afterEach(() => {
  vi.unstubAllGlobals();
  mediaListeners = [];
  storageListeners = [];
});

describe("readTheme", () => {
  it("renders light when nothing is stored, even on a dark OS", () => {
    // Light by default (owner hotfix, 2026-09-14): dark is only ever an
    // explicit choice, so a dark OS on its own does not turn the app dark.
    stubWindow({ osDark: true });
    expect(readChoice()).toBeNull();
    expect(readTheme()).toBe("light");
  });

  it("follows the OS into light too", () => {
    stubWindow({ osDark: false });
    expect(readTheme()).toBe("light");
  });

  it("lets an explicit choice beat the OS", () => {
    // The whole point of pinning: the OS says light, the user said dark.
    stubWindow({ stored: { [THEME_KEY]: "dark" }, osDark: false });
    expect(readChoice()).toBe("dark");
    expect(readTheme()).toBe("dark");
  });

  it("treats a stored value that is neither theme as no choice, and renders light", () => {
    // A stale or corrupted key must degrade to the light default, whatever the
    // OS says. Trusting it would render an undefined theme, which is a
    // blank-looking page.
    stubWindow({ stored: { [THEME_KEY]: "sepia" }, osDark: true });
    expect(readChoice()).toBeNull();
    expect(readTheme()).toBe("light");
  });

  it("renders light when storage throws, as private mode does, even on a dark OS", () => {
    stubWindow({ throws: true, osDark: true });
    expect(readChoice()).toBeNull();
    expect(readTheme()).toBe("light");
  });

  it("has no opinion when there is no window to ask", () => {
    vi.stubGlobal("window", undefined);
    expect(readTheme()).toBe("light");
  });
});

describe("setThemeChoice", () => {
  it("persists a choice and applies it", () => {
    const store = stubWindow({ osDark: false });
    const { classes, root } = stubDocument();
    setThemeChoice("dark");
    expect(store[THEME_KEY]).toBe("dark");
    expect(classes.has("dark")).toBe(true);
    expect(root.style.colorScheme).toBe("dark");
  });

  it("clears the key and renders light when passed null, even on a dark OS", () => {
    const store = stubWindow({ stored: { [THEME_KEY]: "dark" }, osDark: true });
    const { classes, root } = stubDocument();
    // The page is showing the dark it was pinned to when the choice is cleared.
    classes.add("dark");
    setThemeChoice(null);
    expect(THEME_KEY in store).toBe(false);
    // Back to the light default -- not to the dark it was pinned to, and not to
    // the OS, which is dark here.
    expect(classes.has("dark")).toBe(false);
    expect(root.style.colorScheme).toBe("light");
  });

  it("still applies the theme when storage is blocked", () => {
    stubWindow({ throws: true, osDark: false });
    const { classes } = stubDocument();
    setThemeChoice("dark");
    // The click has to work even if it cannot be remembered.
    expect(classes.has("dark")).toBe(true);
  });
});

describe("applyTheme", () => {
  it("sets colorScheme as well as the class", () => {
    // The class alone leaves native scrollbars, form controls and the autofill
    // background on the light theme.
    stubWindow();
    const { classes, root } = stubDocument();
    applyTheme("dark");
    expect(classes.has("dark")).toBe(true);
    expect(root.style.colorScheme).toBe("dark");
    applyTheme("light");
    expect(classes.has("dark")).toBe(false);
    expect(root.style.colorScheme).toBe("light");
  });
});

describe("subscribeToTheme", () => {
  // These two are the reason ThemeSync subscribes rather than applying once.
  // Both shipped broken: the store noticed the change and reported it, and the
  // page stayed in the old theme because nothing put the new one on <html>.
  it("fires when the OS flips for someone following it", () => {
    stubWindow({ osDark: false });
    let fired = 0;
    subscribeToTheme(() => { fired += 1; });
    fireOsChange();
    expect(fired).toBe(1);
  });

  it("fires when another tab writes the key", () => {
    stubWindow();
    let fired = 0;
    subscribeToTheme(() => { fired += 1; });
    fireStorage(THEME_KEY);
    expect(fired).toBe(1);
  });

  it("ignores another tab writing an unrelated key", () => {
    stubWindow();
    let fired = 0;
    subscribeToTheme(() => { fired += 1; });
    fireStorage("something-else");
    expect(fired).toBe(0);
  });
});

describe("the anti-flash script in the root layout", () => {
  // It cannot import THEME_KEY -- it has to run before any module loads -- so
  // the key is written out twice. Nothing but this ties them together, and a
  // rename on one side would silently stop every returning user's theme from
  // surviving a reload, with no error anywhere.
  const layout = readFileSync("src/app/layout.tsx", "utf8");

  it("reads the same localStorage key the store writes", () => {
    expect(layout).toContain(`"${THEME_KEY}"`);
  });

  it("sets both the class and colorScheme, as applyTheme does", () => {
    expect(layout).toMatch(/classList\.toggle\("dark"/);
    expect(layout).toMatch(/style\.colorScheme/);
  });

  it("falls back to the OS preference when nothing is stored", () => {
    expect(layout).toContain("prefers-color-scheme: dark");
  });
});
