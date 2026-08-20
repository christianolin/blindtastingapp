// Coverage + uniqueness tests for the aroma-icon mapping. LEXICON mirrors the
// seeded wset_aroma_terms (group_name + term). Guarantees: (1) every seeded term
// has its own ICON_META entry (never the neutral "wine" fallback), (2) no two
// distinct terms share the same (icon, colour) pair — i.e. no visual duplicate,
// and (3) every ICON_META slug has a vendored SVG on disk. Node imports the .mjs
// natively.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { iconForTerm, slugForTerm, ICON_META } from "./aroma-icons.mjs";

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

test("every seeded term has its own ICON_META entry (no wine fallback)", () => {
  for (const terms of Object.values(LEXICON)) {
    for (const term of terms) {
      const slug = slugForTerm(term);
      assert.ok(ICON_META[slug], `"${term}" -> slug "${slug}" has no ICON_META entry`);
      assert.notEqual(iconForTerm(term, ""), "wine", `"${term}" fell back to wine`);
    }
  }
});

test("no two ICON_META slugs share the same (set, icon, colour)", () => {
  const seen = new Map();
  for (const [slug, m] of Object.entries(ICON_META)) {
    const key = `${m.set}|${m.icon}|${(m.color ?? "").toLowerCase()}`;
    assert.ok(!seen.has(key), `duplicate icon: "${slug}" and "${seen.get(key)}" both ${key}`);
    seen.set(key, slug);
  }
});

// Only the emoji sets ship their own colours. Every other set is monochrome, so
// an entry without a tint renders BLACK — which shipped once (a black quince, a
// black apricot). Colour carries real meaning here (the brain ties colour to
// smell/taste), so a missing tint is a bug, not a style nit.
const EMOJI_SETS = new Set(["fluent-emoji", "fluent-emoji-flat", "noto", "twemoji", "openmoji", "emojione", "fxemoji", "streamline-emojis", "noto-v1"]);

test("every ICON_META entry names a set and an icon; every monochrome set is tinted", () => {
  for (const [slug, m] of Object.entries(ICON_META)) {
    assert.ok(m.set && m.icon, `${slug}: missing set/icon`);
    if (!EMOJI_SETS.has(m.set)) {
      assert.match(
        m.color ?? "",
        /^#[0-9a-f]{6}$/i,
        `${slug}: "${m.set}" is monochrome and would render black without a colour`,
      );
    }
  }
});

test("every ICON_META slug has a vendored SVG in public/emoji", () => {
  const dir = fileURLToPath(new URL("../../../public/emoji/", import.meta.url));
  for (const slug of Object.keys(ICON_META)) {
    assert.ok(existsSync(`${dir}${slug}.svg`), `missing public/emoji/${slug}.svg`);
  }
});
