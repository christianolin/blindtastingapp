import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import {
  THEME_KEY,
  applyTheme,
  readChoice,
  readTheme,
  setThemeChoice,
  subscribeToTheme,
  themeForChoice,
} from "./theme";

// vitest runs in the node environment by design (see vitest.config.mts), so
// there is no window. The store touches exactly two browser APIs -- localStorage
// and matchMedia -- which is small enough to stub honestly rather than pull in
// jsdom and contradict that config.
type Stored = Record<string, string>;
type WindowOpts = { stored?: Stored; osDark?: boolean; throws?: boolean; noMatchMedia?: boolean };

// `opts.osDark` is read on every matchMedia call, not copied, so a test can
// flip the OS part-way through.
function stubWindow(opts: WindowOpts = {}) {
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
    matchMedia: opts.noMatchMedia
      ? undefined
      : (q: string) => ({
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

describe("readTheme: light unless chosen (owner, 2026-09-14)", () => {
  it("renders light when nothing is stored, even on a dark OS", () => {
    // The production report: a dark OS turned the whole app dark by itself.
    stubWindow({ osDark: true });
    expect(readChoice()).toBeNull();
    expect(readTheme()).toBe("light");
  });

  it("renders light when nothing is stored on a light OS", () => {
    stubWindow({ osDark: false });
    expect(readTheme()).toBe("light");
  });

  it.each([[false], [true]])("pins a stored dark whatever the OS says (OS dark: %s)", (osDark) => {
    stubWindow({ stored: { [THEME_KEY]: "dark" }, osDark });
    expect(readChoice()).toBe("dark");
    expect(readTheme()).toBe("dark");
  });

  it.each([[false], [true]])("pins a stored light whatever the OS says (OS dark: %s)", (osDark) => {
    stubWindow({ stored: { [THEME_KEY]: "light" }, osDark });
    expect(readChoice()).toBe("light");
    expect(readTheme()).toBe("light");
  });

  it("follows the OS into dark on Match system", () => {
    stubWindow({ stored: { [THEME_KEY]: "system" }, osDark: true });
    expect(readChoice()).toBe("system");
    expect(readTheme()).toBe("dark");
  });

  it("follows the OS into light on Match system", () => {
    stubWindow({ stored: { [THEME_KEY]: "system" }, osDark: false });
    expect(readChoice()).toBe("system");
    expect(readTheme()).toBe("light");
  });

  it("treats a value that is none of the three as no choice, which is light", () => {
    // A stale or corrupted key must degrade to the default. Trusting it would
    // render an undefined theme; following the OS would be the old default.
    for (const junk of ["sepia", "", "Dark", "null"]) {
      stubWindow({ stored: { [THEME_KEY]: junk }, osDark: true });
      expect(readChoice(), junk).toBeNull();
      expect(readTheme(), junk).toBe("light");
    }
  });

  it("survives storage that throws, as private mode does, and stays light", () => {
    stubWindow({ throws: true, osDark: true });
    expect(readChoice()).toBeNull();
    expect(readTheme()).toBe("light");
  });

  it("renders Match system light when the OS cannot be asked", () => {
    stubWindow({ stored: { [THEME_KEY]: "system" }, noMatchMedia: true });
    expect(readTheme()).toBe("light");
  });

  it("has no opinion when there is no window to ask", () => {
    vi.stubGlobal("window", undefined);
    expect(readChoice()).toBeNull();
    expect(readTheme()).toBe("light");
  });

  it("maps each choice to the theme it renders", () => {
    stubWindow({ osDark: true });
    expect(themeForChoice(null)).toBe("light");
    expect(themeForChoice("light")).toBe("light");
    expect(themeForChoice("dark")).toBe("dark");
    expect(themeForChoice("system")).toBe("dark");
  });
});

describe("setThemeChoice", () => {
  it("persists dark and applies it on a light OS", () => {
    const store = stubWindow({ osDark: false });
    const { classes, root } = stubDocument();
    setThemeChoice("dark");
    expect(store[THEME_KEY]).toBe("dark");
    expect(classes.has("dark")).toBe(true);
    expect(root.style.colorScheme).toBe("dark");
  });

  it("persists light and applies it on a dark OS", () => {
    const store = stubWindow({ stored: { [THEME_KEY]: "dark" }, osDark: true });
    const { classes, root } = stubDocument();
    setThemeChoice("light");
    expect(store[THEME_KEY]).toBe("light");
    expect(classes.has("dark")).toBe(false);
    expect(root.style.colorScheme).toBe("light");
  });

  it('stores Match system as "system", because an empty key now means light', () => {
    const store = stubWindow({ stored: { [THEME_KEY]: "light" }, osDark: true });
    const { classes, root } = stubDocument();
    setThemeChoice("system");
    expect(store[THEME_KEY]).toBe("system");
    expect(classes.has("dark")).toBe(true);
    expect(root.style.colorScheme).toBe("dark");
  });

  it("clears the key when passed null, and that renders light even on a dark OS", () => {
    const store = stubWindow({ stored: { [THEME_KEY]: "dark" }, osDark: true });
    const { classes, root } = stubDocument();
    setThemeChoice(null);
    expect(THEME_KEY in store).toBe(false);
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
  // These are the reason ThemeSync subscribes rather than applying once. Both
  // shipped broken: the store noticed the change and reported it, and the page
  // stayed in the old theme because nothing put the new one on <html>.
  it("fires when the OS flips, and Match system follows it in both directions", () => {
    const opts: WindowOpts = { stored: { [THEME_KEY]: "system" }, osDark: false };
    stubWindow(opts);
    let fired = 0;
    subscribeToTheme(() => { fired += 1; });
    expect(readTheme()).toBe("light");

    opts.osDark = true;
    fireOsChange();
    expect(fired).toBe(1);
    expect(readTheme()).toBe("dark");

    opts.osDark = false;
    fireOsChange();
    expect(fired).toBe(2);
    expect(readTheme()).toBe("light");
  });

  it("leaves every other choice where it is when the OS flips", () => {
    for (const stored of [undefined, "light", "dark"]) {
      const opts: WindowOpts = { stored: stored ? { [THEME_KEY]: stored } : {}, osDark: false };
      stubWindow(opts);
      const before = readTheme();
      opts.osDark = true;
      fireOsChange();
      expect(readTheme(), String(stored)).toBe(before);
    }
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
  // It cannot import THEME_KEY or the rule -- it has to run before any module
  // loads -- so both are written out twice. These tests are all that ties the
  // copies together: a drift on either side would paint the wrong theme first
  // on every load, with no error anywhere.
  const layout = readFileSync("src/app/layout.tsx", "utf8");
  const script = /const THEME_SCRIPT = `([\s\S]*?)`;/.exec(layout)?.[1] ?? "";

  /** Runs the script the way the browser does before first paint, and reports what it left on <html>. */
  function runScript(opts: { stored?: string; osDark?: boolean; throws?: boolean; noMatchMedia?: boolean }) {
    const classes = new Set<string>();
    const documentElement = {
      classList: {
        toggle: (name: string, on: boolean) => {
          if (on) classes.add(name);
          else classes.delete(name);
        },
      },
      style: { colorScheme: "" },
    };
    runInNewContext(script, {
      localStorage: {
        getItem: (k: string) => {
          if (opts.throws) throw new Error("blocked");
          return k === THEME_KEY && opts.stored !== undefined ? opts.stored : null;
        },
      },
      matchMedia: opts.noMatchMedia
        ? undefined
        : (q: string) => ({ matches: q === "(prefers-color-scheme: dark)" && Boolean(opts.osDark) }),
      document: { documentElement },
    });
    return { dark: classes.has("dark"), colorScheme: documentElement.style.colorScheme };
  }

  it("is found, and reads the same localStorage key the store writes", () => {
    expect(script).not.toBe("");
    expect(script).toContain(`"${THEME_KEY}"`);
  });

  it("renders exactly what theme.ts renders, for every stored value on either OS", () => {
    for (const stored of [undefined, "light", "dark", "system", "sepia", ""]) {
      for (const osDark of [false, true]) {
        stubWindow({ stored: stored === undefined ? {} : { [THEME_KEY]: stored }, osDark });
        const expected = readTheme();
        const painted = runScript({ stored, osDark });
        const label = `stored ${JSON.stringify(stored)}, OS dark ${osDark}`;
        expect(painted.dark, label).toBe(expected === "dark");
        expect(painted.colorScheme, label).toBe(expected);
      }
    }
  });

  it("leaves the page light, as theme.ts does, when storage throws", () => {
    stubWindow({ throws: true, osDark: true });
    expect(readTheme()).toBe("light");
    expect(runScript({ throws: true, osDark: true }).dark).toBe(false);
  });

  it("leaves Match system light, as theme.ts does, when the OS cannot be asked", () => {
    stubWindow({ stored: { [THEME_KEY]: "system" }, noMatchMedia: true });
    expect(readTheme()).toBe("light");
    expect(runScript({ stored: "system", noMatchMedia: true }).dark).toBe(false);
  });

  it("tints the browser chrome with the light colour only", () => {
    // A pair keyed on prefers-color-scheme tinted the address bar near-black on
    // any dark OS while the page, light by default now, stayed parchment.
    const viewport = /export const viewport: Viewport = \{([\s\S]*?)\n\};/.exec(layout)?.[1] ?? "";
    const code = viewport.replace(/\/\/.*$/gm, "");
    expect(code).toContain('themeColor: "#5C1A2B"');
    expect(code).not.toContain("prefers-color-scheme");
  });
});
