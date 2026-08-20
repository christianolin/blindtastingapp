# WSET Aroma Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Put a consistent, colourful Twemoji SVG icon left of every aroma/flavour term pill in the WSET sheet.

**Architecture:** A pure `term → slug` map with a per-family fallback (`aroma-icons.ts`), a tiny `<AromaIcon>` that renders a vendored local SVG, wired into the two pill sites. Only the ~40 SVGs we reference are vendored into `public/emoji/`. No DB/schema/query change.

**Tech Stack:** Next.js/React, TypeScript, jdecked-Twemoji SVGs (CC-BY 4.0), Node `*.test.mjs`.

## Global Constraints

- Icons are decorative (`alt=""`); the term text stays the accessible label.
- Consistent vendored SVGs only — never rely on the OS emoji font.
- No change to selection, filtering, progress, or the saved note.
- `tsc` + `eslint` green; coverage test green before commit.

## File structure

- Create `public/emoji/<slug>.svg` — the vendored subset (~40 files).
- Create `src/lib/wset/aroma-icons.ts` — `TERM_ICON`, `FAMILY_ICON`, `ICON_CODEPOINT`, `iconForTerm`.
- Create `src/components/wset/aroma-icon.tsx` — `<AromaIcon term family size>`.
- Create `src/lib/wset/aroma-icons.test.mjs` — coverage + no-broken-image tests.
- Create `.tiles-build/vendor-emoji.mjs` — session-only fetch script (gitignored).
- Modify `src/components/wset/aroma-picker.tsx` — 4 pill sites.
- Modify `src/components/wset/archetype-sheet.tsx` — `AromaPills`.

## The mapping (the substance)

`ICON_CODEPOINT` (slug → Twemoji hex, for both the vendor script and the test):
```
lemon 1f34b · orange 1f34a · green-apple 1f34f · pear 1f350 · grapes 1f347 ·
candy 1f36c · peach 1f351 · banana 1f34c · mango 1f96d · melon 1f348 ·
pineapple 1f34d · strawberry 1f353 · cherries 1f352 · blueberries 1fad0 ·
bell-pepper 1fad1 · herb 1f33f · pill 1f48a · bread 1f35e · cheese 1f9c0 ·
milk 1f95b · butter 1f9c8 · coconut 1f965 · chocolate 1f36b · coffee 2615 ·
dash 1f4a8 · wood 1fab5 · honey 1f36f · chestnut 1f330 · mushroom 1f344 ·
meat 1f356 · fuel-pump 26fd · fallen-leaf 1f342 · hot-pepper 1f336 ·
custard 1f36e · blossom 1f338 · rose 1f339 · rock 1faa8 · wine 1f377
```

`FAMILY_ICON` (group_name → slug):
```
Floral→blossom · Green fruit→green-apple · Citrus fruit→lemon · Stone fruit→peach ·
Tropical fruit→pineapple · Red fruit→cherries · Black fruit→blueberries ·
Herbaceous→herb · Herbal→herb · Spice→hot-pepper · Fruit ripeness→grapes ·
Other→rock · Yeast→bread · Malolactic→butter · Oak→wood · Red wine→fallen-leaf ·
White wine→fallen-leaf · Deliberately oxidised→chestnut
```
Generic default (unknown family): `wine`.

`TERM_ICON` (term string → slug — only terms with a clear emoji; the rest fall to family):
```
lemon→lemon · lemon peel→lemon · lime→lemon · grapefruit→orange · orange→orange ·
orange peel→orange · orange marmalade→orange · apple→green-apple · dried apple→green-apple ·
gooseberry→green-apple · quince→green-apple · pear→pear · grape→grapes · raisin→grapes ·
sultana→grapes · pear drop→candy · candy→candy · liquorice→candy · peach→peach ·
apricot→peach · dried apricot→peach · nectarine→peach · banana→banana · dried banana→banana ·
mango→mango · melon→melon · pineapple→pineapple · passion fruit→pineapple · lychee→pineapple ·
strawberry→strawberry · red cherry→cherries · black cherry→cherries · cooked cherry→cherries ·
cooked red plum→cherries · red plum→cherries · redcurrant→cherries · cranberry→cherries ·
dried cranberry→cherries · raspberry→cherries · blueberry→blueberries · blackberry→blueberries ·
dried blackberry→blueberries · cooked blackberry→blueberries · blackcurrant→blueberries ·
black plum→blueberries · cooked plum→blueberries · bramble→blueberries · green bell pepper→bell-pepper ·
grass→herb · mint→herb · eucalyptus→herb · hay→herb · lavender→blossom · rose→rose · violet→blossom ·
medicinal→pill · biscuit→bread · graham cracker→bread · bread→bread · toast→bread · pastry→bread ·
brioche→bread · bread dough→bread · cheese→cheese · yogurt→milk · butter→butter · cream→milk ·
coconut→coconut · chocolate→chocolate · coffee→coffee · smoke→dash · honey→honey · almond→chestnut ·
marzipan→chestnut · hazelnut→chestnut · walnut→chestnut · mushroom→mushroom · meat→meat · game→meat ·
petrol→fuel-pump · kerosene→fuel-pump · earth→fallen-leaf · forest floor→fallen-leaf ·
wet leaves→fallen-leaf · caramel→custard · butterscotch→custard · toffee→custard · prune→grapes ·
fig→grapes · dried fruit→grapes · jammy→grapes · cooked fruit→grapes · ripe fruit→grapes ·
blossom→blossom · acacia→blossom · elderflower→blossom · honeysuckle→blossom · jasmine→blossom ·
chamomile→blossom · geranium→blossom
```
Everything not listed (wet stones, flint, simple, wet wool, tar, leather, tobacco,
savoury, farmyard, game→meat handled, vanilla, cloves, nutmeg, cinnamon, ginger,
black/white pepper, cedar, charred wood, resinous, petrol handled, acetaldehyde,
nutty, mushroom handled…) resolves via `FAMILY_ICON`, giving a family cue.

---

### Task 1: Mapping module + tests (TDD)

**Files:** Create `src/lib/wset/aroma-icons.ts`, `src/lib/wset/aroma-icons.test.mjs`.

**Produces:** `iconForTerm(term: string, family: string): string`, `ICON_CODEPOINT: Record<string,string>`, `TERM_ICON`, `FAMILY_ICON`.

- [ ] Write `aroma-icons.ts` with the three maps above and:
  `iconForTerm = (term, family) => TERM_ICON[term] ?? FAMILY_ICON[family] ?? "wine"`.
- [ ] Write `aroma-icons.test.mjs`: import the seeded term/family list (fixture array copied from the DB `group_name`/`term` seed — the 19 families and ~90 terms), assert `iconForTerm` returns a non-empty slug for every term; assert every distinct slug returned (plus every `FAMILY_ICON` value and `"wine"`) is a key of `ICON_CODEPOINT`.
- [ ] Run `node --test src/lib/wset/aroma-icons.test.mjs` — expect fail then pass.
- [ ] Commit.

### Task 2: Vendor the SVGs

**Files:** Create `.tiles-build/vendor-emoji.mjs` (gitignored), `public/emoji/<slug>.svg`.

- [ ] `vendor-emoji.mjs` imports `ICON_CODEPOINT`, fetches `https://cdn.jsdelivr.net/gh/jdecked/twemoji@main/assets/svg/{codepoint}.svg` for each, writes `public/emoji/{slug}.svg`. Assert HTTP 200 + non-empty SVG per file; fail loudly on any miss.
- [ ] Run it; verify ~40 files exist under `public/emoji/`.
- [ ] Re-run the Task-1 test (no-broken-image assertion now passes against real files).
- [ ] Commit `public/emoji/*.svg` (assets are committed; the script is gitignored).

### Task 3: `<AromaIcon>` component

**Files:** Create `src/components/wset/aroma-icon.tsx`.

**Consumes:** `iconForTerm`. **Produces:** `<AromaIcon term family size?>`.

- [ ] `<img src={`/emoji/${iconForTerm(term, family)}.svg`} alt="" width={size} height={size} loading="lazy" decoding="async" className="shrink-0" />`, `size` default 15. `eslint-disable-next-line @next/next/no-img-element`.
- [ ] `tsc` + `eslint` green. Commit.

### Task 4: Wire the picker

**Files:** Modify `src/components/wset/aroma-picker.tsx`.

- [ ] Add `<AromaIcon term={term.term} family={term.groupName} />` + a 4px gap before the label in: the desktop cluster-grid buttons, the mobile-sheet cluster buttons, the mobile selected chips, the desktop selected strip (the four `{term.term}`/`{term.term} ×` sites). Wrap each pill's inner content in a flex row (`display:flex; align-items:center; gap:4`).
- [ ] `tsc` + `eslint` green; manually confirm the sheet renders icons. Commit.

### Task 5: Wire the read-only pills + attribution

**Files:** Modify `src/components/wset/archetype-sheet.tsx`; add attribution.

- [ ] In `AromaPills`, render `<AromaIcon term={t} family="" />` before each term (family unknown here → term-level icon or generic default).
- [ ] Add a one-line credit "Emoji graphics © Twemoji (jdecked), CC-BY 4.0" to the licenses/about surface (grep for an existing credits/footer; if none, add a `public/emoji/ATTRIBUTION.txt`).
- [ ] `tsc` + `eslint` green. Commit + push.

## Self-review

- Spec coverage: mapping (T1), assets (T2), component (T3), picker wiring (T4), read-only wiring + attribution (T5), tests (T1/T2). All spec sections covered.
- No placeholders: mapping tables are concrete; component code shown.
- Type consistency: `iconForTerm(term, family)` signature identical across tasks.
