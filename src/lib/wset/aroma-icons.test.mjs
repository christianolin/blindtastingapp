// Coverage tests for the aroma-icon mapping. LEXICON mirrors the seeded
// wset_aroma_terms (group_name + term). Two guarantees: every term resolves to a
// real slug (no bare pill), and every slug the mapping can return has a vendored
// SVG on disk (no broken image). Node strips the .ts types on import.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { iconForTerm, ICON_CODEPOINT, FAMILY_ICON } from "./aroma-icons.mjs";

// group_name -> terms, copied from the DB seed (families in vocab order).
const LEXICON = {
  Floral: ["blossom", "acacia", "elderflower", "honeysuckle", "jasmine", "chamomile", "geranium", "rose", "violet"],
  "Green fruit": ["apple", "pear", "gooseberry", "grape", "pear drop", "quince"],
  "Citrus fruit": ["grapefruit", "lemon", "lime", "orange", "lemon peel", "orange peel"],
  "Stone fruit": ["peach", "apricot", "nectarine"],
  "Tropical fruit": ["banana", "lychee", "mango", "melon", "passion fruit", "pineapple"],
  "Red fruit": ["redcurrant", "cranberry", "raspberry", "strawberry", "red cherry", "red plum"],
  "Black fruit": ["blackcurrant", "blackberry", "blueberry", "black cherry", "black plum", "bramble"],
  Herbaceous: ["green bell pepper", "grass", "tomato leaf", "asparagus", "blackcurrant leaf"],
  Herbal: ["eucalyptus", "mint", "fennel", "dill", "dried herbs", "medicinal", "lavender"],
  Spice: ["black pepper", "white pepper", "liquorice", "cinnamon"],
  "Fruit ripeness": ["unripe fruit", "ripe fruit", "dried fruit", "cooked fruit", "jammy"],
  Other: ["simple", "wet stones", "flint", "candy", "wet wool"],
  Yeast: ["biscuit", "graham cracker", "bread", "toast", "pastry", "brioche", "bread dough", "cheese", "yogurt", "acetaldehyde"],
  Malolactic: ["butter", "cream", "cheese"],
  Oak: ["vanilla", "cloves", "nutmeg", "coconut", "butterscotch", "toast", "cedar", "charred wood", "smoke", "chocolate", "coffee", "resinous"],
  "Red wine": ["prune", "raisin", "fig", "cooked plum", "cooked cherry", "cooked red plum", "dried blackberry", "dried cranberry", "cooked blackberry", "kirsch", "leather", "earth", "mushroom", "meat", "game", "tobacco", "wet leaves", "forest floor", "vegetal", "savoury", "farmyard", "tar", "caramel"],
  "White wine": ["dried apricot", "sultana", "raisin", "orange marmalade", "petrol", "kerosene", "cinnamon", "ginger", "nutmeg", "almond", "hazelnut", "honey", "caramel", "toast", "nutty", "mushroom", "hay", "dried apple", "dried banana"],
  "Deliberately oxidised": ["almond", "marzipan", "hazelnut", "walnut", "chocolate", "coffee", "toffee", "caramel"],
};

test("every seeded term resolves to a non-empty slug", () => {
  for (const [family, terms] of Object.entries(LEXICON)) {
    for (const term of terms) {
      const slug = iconForTerm(term, family);
      assert.ok(slug && typeof slug === "string", `no slug for "${term}" (${family})`);
    }
  }
});

test("every family fallback and the default resolve to a known slug", () => {
  for (const slug of [...Object.values(FAMILY_ICON), "wine"]) {
    assert.ok(ICON_CODEPOINT[slug], `family/default slug "${slug}" missing from ICON_CODEPOINT`);
  }
});

test("every slug iconForTerm can return maps to a known codepoint", () => {
  const slugs = new Set(["wine", ...Object.values(FAMILY_ICON)]);
  for (const [family, terms] of Object.entries(LEXICON)) {
    for (const term of terms) slugs.add(iconForTerm(term, family));
  }
  for (const slug of slugs) {
    assert.ok(ICON_CODEPOINT[slug], `returned slug "${slug}" missing from ICON_CODEPOINT`);
  }
});

test("every codepoint has a vendored SVG in public/emoji", () => {
  const dir = fileURLToPath(new URL("../../../public/emoji/", import.meta.url));
  for (const slug of Object.keys(ICON_CODEPOINT)) {
    assert.ok(existsSync(`${dir}${slug}.svg`), `missing public/emoji/${slug}.svg`);
  }
});
