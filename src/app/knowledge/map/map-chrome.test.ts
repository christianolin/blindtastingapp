import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// map-chrome.css dresses MapLibre's own controls (zoom/compass, attribution)
// for the dark theme. Three rules keep it from leaking anywhere else:
//   - it is screen-only and stands down under forced colours, where MapLibre's
//     own high-contrast icons must win, so every rule sits in ONE
//     `@media screen and (forced-colors: none)` block;
//   - it only ever applies in dark, so every selector starts with `.dark `;
//   - it has no colours of its own, only theme tokens (or a color-mix of one),
//     so a palette change in globals.css reaches the map chrome too.

const CSS = readFileSync(
  path.join(process.cwd(), "src/app/knowledge/map/map-chrome.css"),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

type Block = { prelude: string; children: Block[] | null; body: string };

/** A brace-matching split into blocks: at-rules keep their parsed children,
    style rules keep their declarations. Enough for this one small file. */
function parse(text: string): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf("{", i);
    if (open === -1) {
      expect(text.slice(i).trim(), "stray text outside any block").toBe("");
      break;
    }
    let depth = 1;
    let j = open + 1;
    while (depth > 0 && j < text.length) {
      if (text[j] === "{") depth += 1;
      else if (text[j] === "}") depth -= 1;
      j += 1;
    }
    expect(depth, "unbalanced braces").toBe(0);
    const prelude = text.slice(i, open).trim();
    const body = text.slice(open + 1, j - 1);
    blocks.push({ prelude, body, children: prelude.startsWith("@") ? parse(body) : null });
    i = j;
  }
  return blocks;
}

function styleRules(blocks: Block[]): Block[] {
  return blocks.flatMap((b) => (b.children ? styleRules(b.children) : [b]));
}

describe("map-chrome.css", () => {
  const top = parse(CSS);

  it("puts every rule inside one screen, non-forced-colours media block", () => {
    expect(top).toHaveLength(1);
    expect(top[0].prelude.replace(/\s+/g, " ")).toBe("@media screen and (forced-colors: none)");
    // Nested conditions (hover capability) are fine; any other at-rule is not.
    const nested = (blocks: Block[]): string[] =>
      blocks.flatMap((b) => (b.children ? [b.prelude, ...nested(b.children)] : []));
    for (const prelude of nested(top[0].children ?? [])) expect(prelude).toMatch(/^@media /);
  });

  it("scopes every selector to the dark theme", () => {
    const rules = styleRules(top);
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      for (const selector of rule.prelude.split(",")) {
        expect(selector.trim()).toMatch(/^\.dark /);
      }
    }
  });

  it("takes every colour from a theme token", () => {
    expect(CSS).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(CSS).not.toMatch(/\brgba?\(/i);
    expect(CSS).not.toMatch(/\bhsla?\(/i);
    expect(CSS).toMatch(/var\(--/);
  });
});
