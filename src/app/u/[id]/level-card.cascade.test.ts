import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The compiler the app's own CSS pipeline uses: resolved through the declared
// @tailwindcss/postcss plugin rather than imported by name, so the test runs the
// exact Tailwind that builds production and needs no dependency of its own.
const fromPlugin = createRequire(createRequire(import.meta.url).resolve("@tailwindcss/postcss"));
const { compile } = fromPlugin("@tailwindcss/node") as typeof import("@tailwindcss/node");

// Review finding (2026-09-28): the card's wide layout lost to its `md:` rules.
// Tailwind 4 sorts arbitrary `min-[…]` variants by unit, px before rem, so a
// `min-[1100px]:grid-cols-3` was emitted BEFORE `md:grid-cols-2` (48rem) and
// the later md rule won at every width. A markup test cannot see rule order,
// so this compiles the card's own classes against the app's real globals.css
// and checks that every wide override comes after the md rule it overrides.

const SOURCE = fs.readFileSync(path.join(__dirname, "level-card.tsx"), "utf8");
const WIDE = "min-[68.75rem]:";

// Every class token the component names (string literals only; good enough
// for a Tailwind candidate list, which ignores what is not a utility).
const candidates = [...new Set(SOURCE.match(/[^\s"'`{}()<>,;]+/g) ?? [])];

// The selector Tailwind writes for a class: every non-word character escaped.
const selector = (cls: string) => "." + cls.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);

describe("level card breakpoints: cascade order", async () => {
  const css = fs.readFileSync(path.resolve(__dirname, "../../globals.css"), "utf8");
  const compiler = await compile(css, { base: path.resolve(__dirname, "../.."), onDependency: () => {} });
  const out = compiler.build(candidates);

  it("uses no px arbitrary breakpoint beside md (px sorts before rem)", () => {
    expect(SOURCE).not.toMatch(/min-\[\d+px\]:/);
  });

  // The wide class and the md class it must beat (same property).
  const pairs: [string, string][] = [
    [`${WIDE}grid-cols-3`, "md:grid-cols-2"],
    [`${WIDE}col-span-1`, "md:col-span-2"],
    [`${WIDE}columns-3`, "md:columns-2"],
  ];

  it.each(pairs)("%s is emitted after %s", (wide, md) => {
    expect(SOURCE).toContain(wide);
    const wideAt = out.indexOf(selector(wide));
    const mdAt = out.indexOf(selector(md));
    expect(mdAt).toBeGreaterThan(-1);
    expect(wideAt).toBeGreaterThan(mdAt);
  });

  it("gives the phone summary a shrinkable single column (truncation works)", () => {
    expect(out).toMatch(/\.grid-cols-1\s*\{\s*grid-template-columns:\s*repeat\(1,\s*minmax\(0,\s*1fr\)\)/);
  });

  it("compiles the wide query as 68.75rem (1100px)", () => {
    expect(out).toMatch(/@media \(width >= 68\.75rem\)/);
  });
});
