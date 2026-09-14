import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Contrast guards on the palette itself, because nothing else in the build has
// an opinion about it. tsc, lint and the component tests were all green while
// the wordmark rendered #5C1A2B on #1B1310 -- about 1.5:1, invisible -- and
// while every inline link in dark sat at 2.89:1. A colour is only wrong
// relative to what it is drawn on, and only this knows those pairs.
//
// WCAG 2.1 AA: 4.5:1 for normal text, 3:1 for large text and UI boundaries.

// Comments are stripped BEFORE parsing. The declaration regex is naive by
// design -- it only has to read this one file -- but prose like "one step above
// --card: inputs, panels..." inside a comment reads as a declaration to it, and
// silently redefines the token with the rest of the paragraph. That happened,
// and every ratio in the file went undefined at once.
const CSS = readFileSync("src/app/globals.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function block(selector: string): Record<string, string> {
  // `\n\s*\}` rather than `\n\}`: .dark is nested inside @media screen, so its
  // closing brace is indented. The looser form stops at the block's OWN brace
  // rather than running on to the media query's, which it did only harmlessly
  // because nothing sits between the two.
  const m = new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`).exec(CSS);
  if (!m) throw new Error(`no ${selector} block in globals.css`);
  return Object.fromEntries(
    [...m[1].matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((d) => [d[1], d[2].trim()]),
  );
}

const light = block(":root");
const darkOnly = block("\\.dark");
// The .dark block OVERRIDES :root, it does not replace it: a token dark leaves
// alone still resolves to its light value at runtime. Merging the two is what
// the browser actually computes, and so what these ratios must be measured on.
// --on-accent is the case in point — declared once, deliberately the same ink
// in both themes, and absent from .dark entirely.
const dark = { ...light, ...darkOnly };

/** Relative luminance, WCAG 2.x. Hex only -- the rgba() tokens are borders. */
function luminance(hex: string): number {
  const h = hex.trim().replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`not a hex colour: ${hex}`);
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(full.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** A translucent ink composited over its ground, the way the browser paints a
 *  `bg-success/12` chip: straight alpha in sRGB. Hex in, hex out. */
function over(ink: string, alpha: number, ground: string): string {
  const rgb = (hex: string) =>
    [0, 2, 4].map((i) => parseInt(hex.trim().replace("#", "").slice(i, i + 2), 16));
  const [a, b] = [rgb(ink), rgb(ground)];
  return (
    "#" +
    a.map((v, i) => Math.round(v * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, "0")).join("")
  );
}

/** Rounded the way a report would show it, so failures read in familiar units. */
const ratio = (t: Record<string, string>, ink: string, ground: string) =>
  Number(contrast(t[ink], t[ground]).toFixed(2));

/** One element in a chain from <html> down, for selectorMatches. */
type El = { tag: string; classes?: string[]; attrs?: string[]; root?: boolean };

// The compound-selector parts selectorMatches understands. Anything else throws,
// so a selector it cannot read fails the test rather than passing it.
const SELECTOR_TOKENS: [RegExp, (m: RegExpExecArray, el: El) => boolean][] = [
  [/^:root/, (_m, el) => Boolean(el.root)],
  [/^:not\(([^()]+)\)/, (m, el) => !compoundMatches(m[1], el)],
  [/^\.([\w-]+)/, (m, el) => (el.classes ?? []).includes(m[1])],
  [/^\[([\w-]+)\]/, (m, el) => (el.attrs ?? []).includes(m[1])],
  [/^\*/, () => true],
  [/^[a-z]+/, (m, el) => el.tag === m[0]],
];

function compoundMatches(compound: string, el: El): boolean {
  let rest = compound;
  let ok = true;
  while (rest.length > 0) {
    let consumed = 0;
    for (const [re, test] of SELECTOR_TOKENS) {
      const m = re.exec(rest);
      if (m) {
        ok = test(m, el) && ok;
        consumed = m[0].length;
        break;
      }
    }
    if (consumed === 0) throw new Error(`selector not understood: ${compound}`);
    rest = rest.slice(consumed);
  }
  return ok;
}

/** Splits outside () and [] -- a selector list at ",", a complex selector at whitespace. */
function splitTop(s: string, isSep: (ch: string) => boolean): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(" || ch === "[") depth += 1;
    if (ch === ")" || ch === "]") depth -= 1;
    if (depth === 0 && isSep(ch)) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((part) => part.trim()).filter(Boolean);
}

/**
 * Whether a selector list matches the LAST element of a chain from <html> down.
 * Just enough CSS for the rules in globals.css: descendant combinators, and
 * compounds of tag, .class, [attr], :root and :not(simple).
 */
function selectorMatches(list: string, chain: readonly El[]): boolean {
  return splitTop(list, (ch) => ch === ",").some((complex) => {
    const parts = splitTop(complex, (ch) => /\s/.test(ch));
    const from = (ci: number, pi: number): boolean => {
      if (!compoundMatches(parts[pi], chain[ci])) return false;
      if (pi === 0) return true;
      for (let a = ci - 1; a >= 0; a -= 1) if (from(a, pi - 1)) return true;
      return false;
    };
    return parts.length > 0 && chain.length > 0 && from(chain.length - 1, parts.length - 1);
  });
}

describe.each([
  ["light", light],
  ["dark", dark],
])("%s theme", (name, t) => {
  it("body text clears AA on the page and on cards", () => {
    expect(ratio(t, "--foreground", "--background")).toBeGreaterThanOrEqual(4.5);
    expect(ratio(t, "--card-foreground", "--card")).toBeGreaterThanOrEqual(4.5);
  });

  it("muted text clears AA on every surface it is drawn on", () => {
    // --background and --card alone are not enough, and that is exactly how
    // #7a6a52 shipped: it passed both while failing --muted at 4.14:1 (the
    // segmented-control chips), --accent at 4.07:1 and --secondary at 3.86:1.
    // A token is only as good as the worst ground it lands on.
    for (const ground of [
      "--background", "--card", "--muted", "--accent", "--secondary", "--surface-raised",
    ]) {
      expect(ratio(t, "--muted-foreground", ground)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("inline links clear AA on both grounds they appear on", () => {
    // The regression this file was written for. --primary was serving as link
    // ink and measured 2.89:1 on --card in dark.
    expect(ratio(t, "--primary-ink", "--background")).toBeGreaterThanOrEqual(4.5);
    expect(ratio(t, "--primary-ink", "--card")).toBeGreaterThanOrEqual(4.5);
  });

  it("the filled primary button clears AA for its own label", () => {
    // The other half of the same trade-off: lightening --primary to fix the ink
    // would have dropped this pair to 3.53:1. Both assertions have to hold, and
    // that is why they are two tokens.
    expect(ratio(t, "--primary-foreground", "--primary")).toBeGreaterThanOrEqual(4.5);
  });

  it("the raised surface carries body text and placeholders", () => {
    // --surface-raised is inputs, dropdown panels and the new-tasting rows.
    // It was `bg-white` at 41 call sites, which rendered a literal white panel
    // on the near-black page.
    //
    // Placeholder text on it is asserted for DARK below, not here: in light it
    // is 2.92:1, the same shipped shortfall the placeholder block records, and
    // renaming the class did not cause it -- bg-white was already #ffffff.
    expect(ratio(t, "--foreground", "--surface-raised")).toBeGreaterThanOrEqual(4.5);
  });

  it("labels on the gold accent stay readable, in both themes", () => {
    // Gold is a LIGHT surface whichever theme is on. Letting its label follow
    // --foreground put parchment on gold in dark: 1.81:1, the worst contrast
    // in the app. --on-accent is fixed dark ink for exactly this.
    expect(ratio(t, "--on-accent", "--gold")).toBeGreaterThanOrEqual(4.5);
    expect(ratio(t, "--on-accent", "--gold-deep")).toBeGreaterThanOrEqual(4.5);
  });

  it("the success ink clears AA on every ground it is drawn on, its own chip included", () => {
    // A category you got, "+N" in the standings, the "locked in" line. It was a
    // literal #3f5b42 in the play, standings and results code, which cannot
    // follow the theme: 2.24:1 on the dark card and 2.08:1 on its own 12% chip.
    for (const ground of ["--background", "--card", "--surface-raised"]) {
      expect(ratio(t, "--success", ground)).toBeGreaterThanOrEqual(4.5);
    }
    const chip = over(t["--success"], 0.12, t["--card"]);
    expect(Number(contrast(t["--success"], chip).toFixed(2))).toBeGreaterThanOrEqual(4.5);
  });

  it("the destructive colour is readable as text on both grounds", () => {
    expect(ratio(t, "--destructive", "--background")).toBeGreaterThanOrEqual(3);
    expect(ratio(t, "--destructive", "--card")).toBeGreaterThanOrEqual(3);
  });
});

describe("the placeholder shades, which carry real text", () => {
  // Not decorative. --placeholder is the input placeholder in the new-tasting
  // form and the flight picker; --placeholder-soft is the points value on every
  // unanswered ladder row. Both also draw aria-hidden separators and chevrons,
  // but the text uses are what set the bar.
  //
  // Both themes now clear AA on all three grounds these can sit on. Light was
  // 2.55:1 and 1.70:1 on --background until 2026-09-14; dark was 4.04:1 and
  // 2.41:1 before that. Neither was ever caught by anything but measurement.
  it.each([["light", light], ["dark", dark]])(
    "%s clears AA on the page, cards and the raised surface",
    (_name, t) => {
      for (const token of ["--placeholder", "--placeholder-soft"]) {
        expect(ratio(t, token, "--background")).toBeGreaterThanOrEqual(4.3);
        expect(ratio(t, token, "--card")).toBeGreaterThanOrEqual(4.5);
        expect(ratio(t, token, "--surface-raised")).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  // -soft is the fainter of the two, and has to STAY fainter or the tier it
  // exists to express is gone. Faint means lighter on a light ground and darker
  // on a dark one, so this compares luminance in the right direction per theme.
  it("keeps -soft fainter than --placeholder in both themes", () => {
    expect(luminance(light["--placeholder-soft"])).toBeGreaterThan(luminance(light["--placeholder"]));
    expect(luminance(dark["--placeholder-soft"])).toBeLessThan(luminance(dark["--placeholder"]));
  });

  // TIER ORDER, expressed as contrast on the page rather than raw luminance so
  // it reads the same in both themes: secondary text must be STRONGER than a
  // placeholder, never the other way round.
  //
  // In light this held only after --muted-foreground was darkened to clear the
  // chips. Before that the two were within 0.003 of each other in luminance and
  // --placeholder was fractionally the stronger of the pair, which is backwards.
  it.each([["light", light], ["dark", dark]])(
    "%s keeps secondary text stronger than placeholder text",
    (_name, t) => {
      expect(ratio(t, "--muted-foreground", "--background"))
        .toBeGreaterThan(ratio(t, "--placeholder", "--background"));
      expect(ratio(t, "--placeholder", "--background"))
        .toBeGreaterThan(ratio(t, "--placeholder-soft", "--background"));
    },
  );

  // And the light placeholder is at its ceiling, which is why the gap above it
  // is narrow. On a #f5efe3 ground AA caps any ink at L <= 0.154; --placeholder
  // is 0.153. It cannot be made fainter without failing, so anyone wanting more
  // separation has to move --muted-foreground, not this.
  it("light --placeholder sits at the AA ceiling and cannot go lighter", () => {
    expect(luminance(light["--placeholder"])).toBeLessThanOrEqual(0.154);
    expect(luminance(light["--placeholder"])).toBeGreaterThan(0.145);
  });
});

describe("the console palette, which is dark in BOTH themes", () => {
  it("keeps its ink readable on its own ground", () => {
    // These three are deliberately not overridden in .dark. If someone ever
    // adds a .dark variant for them, this is what should still hold.
    expect(ratio(light, "--console-ink", "--console")).toBeGreaterThanOrEqual(4.5);
    expect(ratio(light, "--console-ink", "--console-card")).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the wrong-answer red distinguishable on the reveal", () => {
    expect(ratio(light, "--miss", "--console")).toBeGreaterThanOrEqual(4.5);
  });
});

describe("the dark palette's coverage of the light one", () => {
  it("overrides every colour token except the console ones already dark", () => {
    // --radius is not a colour; the console three are dark-surface values the
    // reveal screen uses in both themes. Anything ELSE missing here is a light
    // value bleeding onto a near-black ground, which is how --border-light at
    // #f0e6d1 nearly shipped.
    //
    // --miss is allowed but no longer absent: BT-D1 set it explicitly, to the
    // same value it already had in light. Kept in the list because it is still
    // legitimately either way.
    //
    // --on-accent is the same kind of exception from the other direction: it is
    // ink for the GOLD surface, and gold is light in both themes, so the ink
    // must NOT flip with the theme. That is the whole point of it.
    //
    // The four --rail tokens are a third kind (owner, 2026-09-14): the menu is
    // the same colour in every theme, so a dark value for them is the bug.
    const allowed = new Set([
      "--radius", "--miss", "--console", "--console-card", "--console-ink",
      "--on-accent", "--rail", "--rail-foreground", "--rail-accent", "--rail-accent-deep",
    ]);
    const missing = Object.keys(light).filter((k) => !(k in darkOnly) && !allowed.has(k));
    expect(missing).toEqual([]);
  });
});

describe("the live palette on live surfaces, under a light AND a dark root (spec section 6.3)", () => {
  // A running tasting's LiveShell and the popups it portals carry both the
  // `.dark` class and data-live, and there --primary is the section 6.3
  // bordeaux rather than the dark theme's indigo, whatever the app theme is
  // (owner, 2026-09-14). It sits ON TOP of the dark palette, so the pairs are
  // measured on that merge, the same way `dark` above is measured on
  // light + .dark.
  const liveOnly = block("\\.dark\\[data-live\\]");
  const live = { ...dark, ...liveOnly };

  it("overrides only the primary trio, so it cannot grow into a second dark palette", () => {
    expect(Object.keys(liveOnly).sort()).toEqual(["--primary", "--primary-hover", "--primary-ink"]);
  });

  it("the filled primary and its hover carry their label", () => {
    expect(ratio(live, "--primary-foreground", "--primary")).toBeGreaterThanOrEqual(4.5);
    expect(ratio(live, "--primary-foreground", "--primary-hover")).toBeGreaterThanOrEqual(4.5);
  });

  it("primary as ink clears AA on the live page and cards", () => {
    expect(ratio(live, "--primary-ink", "--background")).toBeGreaterThanOrEqual(4.5);
    expect(ratio(live, "--primary-ink", "--card")).toBeGreaterThanOrEqual(4.5);
  });

  it("stays screen-only, so PR #60's print fallback to light still wins", () => {
    expect(CSS).toMatch(/@media screen\s*\{\s*[^{}]*\{[^{}]*--primary:\s*#a8425a[^{}]*\}\s*\}/);
    expect(CSS.match(/--primary:\s*#a8425a/g) ?? []).toHaveLength(1);
  });

  // What the rule can meet: <html> (light, or .dark under the dark theme), the
  // body, a live surface, an ordinary element, and a `.dark` element that is
  // not live (none exists today; the rule must not depend on that).
  const lightRoot: El = { tag: "html", root: true };
  const darkRoot: El = { tag: "html", classes: ["dark"], root: true };
  const body: El = { tag: "body" };
  const liveSurface: El = { tag: "div", classes: ["dark"], attrs: ["data-live"] };
  const plain: El = { tag: "div" };
  const darkNotLive: El = { tag: "div", classes: ["dark"] };
  const selector = (/@media screen\s*\{\s*([^{}]*)\{[^{}]*--primary:\s*#a8425a/.exec(CSS)?.[1] ?? "").trim();

  it.each([
    ["a light root", lightRoot],
    ["a dark root", darkRoot],
  ])("reaches LiveShell's wrapper and a portalled live popup under %s", (_name, root) => {
    expect(selectorMatches(selector, [root, body, plain, liveSurface])).toBe(true);
    expect(selectorMatches(selector, [root, body, liveSurface])).toBe(true);
  });

  it.each([
    ["the dark <html> itself", [darkRoot]],
    ["the body under a dark root", [darkRoot, body]],
    ["an ordinary element under a dark root", [darkRoot, body, plain]],
    ["an ordinary element under a light root", [lightRoot, body, plain]],
    ["a .dark element that is not marked live", [lightRoot, body, darkNotLive]],
  ])("does not reach %s", (_name, chain) => {
    expect(selectorMatches(selector, chain)).toBe(false);
  });

  it("uses a matcher that sees why the old rule failed the dark root", () => {
    const old = ":root:not(.dark) .dark";
    expect(selectorMatches(old, [lightRoot, body, liveSurface])).toBe(true);
    expect(selectorMatches(old, [darkRoot, body, liveSurface])).toBe(false);
  });
});

describe("the menu rail, which never changes colour (owner, 2026-09-14)", () => {
  // "Why is the menu blue???? ... And the menu should never change." The rail
  // was a bg-primary panel, and the dark theme's --primary is indigo.
  const RAIL = ["--rail", "--rail-foreground", "--rail-accent", "--rail-accent-deep"];
  const NAV = ["src/components/app-sidebar.tsx", "src/components/mobile-nav.tsx"];

  it("resolves every rail token to the same value under :root and under .dark", () => {
    for (const token of RAIL) {
      expect(light[token], token).toMatch(/^#[0-9a-f]{6}$/i);
      expect(dark[token], token).toBe(light[token]);
    }
  });

  it("declares each rail token once, so no theme or live block can override it", () => {
    for (const token of RAIL) {
      const declarations = CSS.match(new RegExp(`(?<![\\w-])${token}\\s*:`, "g")) ?? [];
      expect(declarations, token).toHaveLength(1);
    }
  });

  it("keeps exactly the colours the rail showed in light before", () => {
    expect(light["--rail"]).toBe(light["--primary"]);
    expect(light["--rail-foreground"]).toBe(light["--primary-foreground"]);
    expect(light["--rail-accent"]).toBe(light["--gold"]);
    expect(light["--rail-accent-deep"]).toBe(light["--gold-deep"]);
  });

  it.each([["light", light], ["dark", dark]])(
    "parchment clears 4.5:1 on the rail under %s, the dimmed labels included",
    (_name, t) => {
      expect(ratio(t, "--rail-foreground", "--rail")).toBeGreaterThanOrEqual(4.5);
      // Idle nav labels are parchment at 70%, the sign-out icon at 60%.
      for (const alpha of [0.7, 0.6]) {
        const ink = over(t["--rail-foreground"], alpha, t["--rail"]);
        expect(Number(contrast(ink, t["--rail"]).toFixed(2))).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it("paints the rail and both drawers with rail tokens, never a theme token", () => {
    // Theme-following utilities are exactly what repainted the menu. Its
    // overlays (/70, /50, /15, /10), avatar chips and badges are all
    // rail-foreground at an alpha, so none of them may name a theme token.
    const themeUtility =
      /\b(?:bg|text|border|ring|outline|fill|stroke|divide|from|via|to)-(?:primary|secondary|foreground|background|card|popover|muted|accent|gold|border|input|ring|destructive|rose|live|surface|sidebar)\b/g;
    for (const file of NAV) {
      const source = readFileSync(file, "utf8");
      expect(source.match(themeUtility) ?? [], file).toEqual([]);
      expect(source, file).toContain("bg-rail text-rail-foreground");
      // outline-ring/50 sits on every element; pinning --ring keeps focus
      // outlines on the rail's gold rather than the theme's.
      expect(source, file).toContain("[--ring:var(--rail-accent)]");
      expect(source, file).toMatch(/<BlindrMark[^>]*\bonDark\b/);
    }
  });

  it("draws the logo on the rail from rail tokens, so it matches in both themes", () => {
    const logo = readFileSync("src/components/logo.tsx", "utf8");
    for (const token of ["--rail-foreground", "--rail-accent", "--rail-accent-deep"]) {
      expect(logo).toContain(`"var(${token})"`);
    }
  });
});

describe("every element in src that carries the `dark` class", () => {
  // Two kinds, and the live rule above depends on telling them apart. The ROOT
  // is <html>, set by the theme store and its anti-flash script. LIVE surfaces
  // are LiveShell's wrapper and the popups that copy its class out of a portal,
  // and each must also carry data-live, or the section 6.3 trio misses it under
  // a dark root. A new place that adds the class fails the first test until it
  // is listed as one kind or the other.
  const ROOT_SETTERS = ["src/app/layout.tsx", "src/lib/theme.ts"];
  const LIVE_SETTERS = [
    "src/app/tastings/[id]/play/field-picker.tsx",
    "src/components/live-shell.tsx",
    "src/components/ui/popover.tsx",
  ];
  const addsDark = /classList\.(?:add|toggle)\(\s*["']dark["']|className=["']dark[\s"']|&&\s*["']dark["']/;
  const count = (source: string, re: RegExp) => (source.match(new RegExp(re.source, "g")) ?? []).length;
  const sources = readdirSync("src", { encoding: "utf8", recursive: true })
    .map((p) => `src/${p.replaceAll("\\", "/")}`)
    .filter((p) => /\.(?:tsx?|jsx?|mjs)$/.test(p) && !/\.test\.tsx?$/.test(p));

  it("is added only by the root theme and the live surfaces", () => {
    const setters = sources.filter((p) => addsDark.test(readFileSync(p, "utf8")));
    expect(setters.sort()).toEqual([...ROOT_SETTERS, ...LIVE_SETTERS].sort());
  });

  it("marks every live surface with data-live, once for each place that adds the class", () => {
    for (const file of LIVE_SETTERS) {
      const source = readFileSync(file, "utf8");
      expect(count(source, addsDark), file).toBeGreaterThan(0);
      expect(count(source, /\bdata-live=/), file).toBe(count(source, addsDark));
    }
  });

  it("never marks the root as live", () => {
    for (const file of ROOT_SETTERS) {
      expect(readFileSync(file, "utf8"), file).not.toContain("data-live");
    }
  });
});
