// Coverage + uniqueness tests for the aroma-icon mapping. LEXICON mirrors the
// seeded wset_aroma_terms (group_name + term). Guarantees: (1) every seeded term
// has its own ICON_META entry (never the neutral "wine" fallback), (2) no two
// distinct terms share the same (icon, colour) pair — i.e. no visual duplicate,
// and (3) every ICON_META slug has a vendored SVG on disk. Runs under vitest
// (the earlier node:test file was never picked up by `vitest run`).
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ICON_META, iconForTerm, slugForTerm } from "./aroma-icons.mjs";

type IconMeta = { set: string; icon: string; color?: string };
// The .mjs literal infers per-key shapes; widen it to one indexable record.
const META: Record<string, IconMeta> = ICON_META;

// The lexicon as of 20260929090000_aroma_lexicon_v2 (150 terms), in sort order.
const LEXICON: Record<string, string[]> = {
  Floral: ["blossom", "acacia", "elderflower", "honeysuckle", "jasmine", "chamomile", "geranium", "rose", "violet"],
  "Green fruit": ["green apple", "red apple", "pear", "gooseberry", "grape", "quince"],
  "Citrus fruit": ["grapefruit", "lemon", "lime", "orange", "lemon peel", "lime zest", "orange peel"],
  "Stone fruit": ["peach", "apricot", "nectarine"],
  "Tropical fruit": ["banana", "lychee", "mango", "melon", "passion fruit", "pineapple"],
  "Red fruit": ["redcurrant", "cranberry", "pomegranate", "raspberry", "strawberry", "red cherry", "red plum"],
  "Black fruit": ["blackcurrant", "blackberry", "blueberry", "black cherry", "black plum", "bramble"],
  Herbaceous: ["green bell pepper", "grass", "tomato leaf", "asparagus", "blackcurrant leaf", "black olive", "green olive"],
  Herbal: ["eucalyptus", "mint", "fennel", "dill", "dried herbs", "medicinal", "lavender"],
  Spice: ["black pepper", "white pepper", "liquorice", "cinnamon", "ginger"],
  "Fruit ripeness": ["unripe fruit", "ripe fruit", "jammy"],
  Other: ["simple", "wet stones", "flint / struck match", "minerality", "saline", "candy", "wet wool"],
  Yeast: ["biscuit", "bread", "toasted bread", "pastry", "brioche", "bread dough", "cheese", "yogurt", "acetaldehyde"],
  Malolactic: ["butter", "cream", "cheese"],
  Oak: ["vanilla", "cloves", "nutmeg", "coconut", "butterscotch", "toast", "cedar", "charred wood", "smoke", "chocolate", "coffee", "resinous"],
  "Red wine": ["prune", "raisin", "fig", "cooked plum", "cooked cherry", "dried blackberry", "dried cranberry", "cooked blackberry", "kirsch", "leather", "earth", "mushroom", "truffle", "meat", "smoked meat", "game", "tobacco", "black tea", "wet leaves", "forest floor", "vegetal", "savoury", "farmyard", "tar", "caramel"],
  "White wine": ["dried apricot", "sultana", "raisin", "orange marmalade", "petrol", "cinnamon", "ginger", "nutmeg", "almond", "hazelnut", "honey", "beeswax", "caramel", "toast", "nutty", "mushroom", "truffle", "hay", "dried apple", "dried banana"],
  "Deliberately oxidised": ["almond", "marzipan", "hazelnut", "walnut", "chocolate", "coffee", "toffee", "caramel"],
};

// Only the emoji sets ship their own colours. Every other set is monochrome, so
// an entry without a tint renders BLACK — which shipped once (a black quince, a
// black apricot). Colour carries real meaning here (the brain ties colour to
// smell/taste), so a missing tint is a bug, not a style nit.
const EMOJI_SETS = new Set([
  "fluent-emoji",
  "fluent-emoji-flat",
  "noto",
  "twemoji",
  "openmoji",
  "emojione",
  "fxemoji",
  "streamline-emojis",
  "noto-v1",
]);

describe("aroma icons", () => {
  it("every seeded term has its own ICON_META entry (no wine fallback)", () => {
    for (const terms of Object.values(LEXICON)) {
      for (const term of terms) {
        const slug = slugForTerm(term);
        expect(META[slug], `"${term}" -> slug "${slug}" has no ICON_META entry`).toBeTruthy();
        expect(iconForTerm(term, ""), `"${term}" fell back to wine`).not.toBe("wine");
      }
    }
  });

  it("no two ICON_META slugs share the same (set, icon, colour)", () => {
    const seen = new Map<string, string>();
    for (const [slug, m] of Object.entries(META)) {
      const key = `${m.set}|${m.icon}|${(m.color ?? "").toLowerCase()}`;
      expect(
        seen.has(key),
        `duplicate icon: "${slug}" and "${seen.get(key)}" both ${key}`,
      ).toBe(false);
      seen.set(key, slug);
    }
  });

  it("every ICON_META entry names a set and an icon; every monochrome set is tinted", () => {
    for (const [slug, m] of Object.entries(META)) {
      expect(m.set && m.icon, `${slug}: missing set/icon`).toBeTruthy();
      if (!EMOJI_SETS.has(m.set)) {
        expect(
          m.color ?? "",
          `${slug}: "${m.set}" is monochrome and would render black without a colour`,
        ).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it("every ICON_META slug has a vendored SVG in public/emoji", () => {
    const dir = fileURLToPath(new URL("../../../public/emoji/", import.meta.url));
    for (const slug of Object.keys(META)) {
      expect(existsSync(`${dir}${slug}.svg`), `missing public/emoji/${slug}.svg`).toBe(true);
    }
  });
});
