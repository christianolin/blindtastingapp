import { afterEach, describe, expect, it, vi } from "vitest";
import {
  THEME_KEY,
  applyTheme,
  readChoice,
  readTheme,
  setThemeChoice,
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
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  };
  vi.stubGlobal("window", win);
  return store;
}

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

afterEach(() => vi.unstubAllGlobals());

describe("readTheme", () => {
  it("follows the OS when nothing is stored", () => {
    stubWindow({ osDark: true });
    expect(readChoice()).toBeNull();
    expect(readTheme()).toBe("dark");
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

  it("treats a value that is neither theme as no choice at all", () => {
    // A stale or corrupted key must degrade to following the OS. Trusting it
    // would render an undefined theme, which is a blank-looking page.
    stubWindow({ stored: { [THEME_KEY]: "sepia" }, osDark: true });
    expect(readChoice()).toBeNull();
    expect(readTheme()).toBe("dark");
  });

  it("survives storage that throws, as private mode does", () => {
    stubWindow({ throws: true, osDark: true });
    expect(readChoice()).toBeNull();
    expect(readTheme()).toBe("dark");
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

  it("clears the key and returns to the OS when passed null", () => {
    const store = stubWindow({ stored: { [THEME_KEY]: "light" }, osDark: true });
    const { classes } = stubDocument();
    setThemeChoice(null);
    expect(THEME_KEY in store).toBe(false);
    // Back to following the OS, which is dark here -- not back to the light it
    // was pinned to.
    expect(classes.has("dark")).toBe(true);
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
