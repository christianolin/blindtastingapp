import { describe, expect, it } from "vitest";
import { emptyNoteState } from "../wset/note-state";
import type { WsetNoteState } from "../wset/types";
import { LEXICON, POOL, arch, tid } from "./__fixtures__/archetypes";
import {
  CAP_MAX,
  WEIGHTS,
  explain,
  ladderFor,
  rankCandidates,
  snapshotRanking,
  stepScore,
} from "./match";
import type { MatchExtras, RankedCandidate, TrainingCandidate } from "./types";

// The training room's matcher (spec 2026-09-25-training-room-design.md §5).
// Every expected closeness below is worked by hand in the comment beside it:
// closeness = min(100, round(100 · (Σ wᵢ·s(dᵢ) + 2·a + bonus) / (Σ wᵢ + 2·[aromas]))).

const NONE: MatchExtras = { bubbles: null, fortified: null };

function note(partial: Partial<WsetNoteState>): WsetNoteState {
  return { ...emptyNoteState(), ...partial };
}

function rank(
  n: Partial<WsetNoteState>,
  extras: MatchExtras = NONE,
  pool: TrainingCandidate[] = POOL,
): RankedCandidate[] {
  return rankCandidates(note(n), extras, pool, LEXICON);
}

function get(ranked: RankedCandidate[], key: string): RankedCandidate {
  const r = ranked.find((x) => x.candidate.id === `arch-${key}`);
  if (!r) throw new Error(`no ranked ${key}`);
  return r;
}

/** A fixture with some fields replaced (a new id so it never collides). */
function variant(key: string, patch: Partial<TrainingCandidate>, id = `${key}-variant`): TrainingCandidate {
  return { ...arch(key), ...patch, id: `arch-${id}` };
}

describe("stepScore and the constants", () => {
  it("scores in range 1.0, one step 0.6, two 0.2, further 0", () => {
    expect(stepScore(0)).toBe(1);
    expect(stepScore(1)).toBe(0.6);
    expect(stepScore(2)).toBe(0.2);
    expect(stepScore(3)).toBe(0);
    expect(stepScore(6)).toBe(0);
  });

  it("carries the plan header's weights and cap", () => {
    expect(WEIGHTS).toEqual({
      sweetness: 1.5,
      tannin: 1.5,
      acidity: 1.5,
      body: 1.2,
      alcohol: 1.0,
      colourHue: 1.0,
      mousse: 1.0,
      noseIntensity: 0.8,
      flavourIntensity: 0.8,
      finish: 0.8,
      development: 0.6,
      appearanceIntensity: 0.6,
      aromas: 2.0,
    });
    expect(CAP_MAX).toBe(15);
  });
});

describe("ladderFor", () => {
  it("uses the full enum order, not the slider's stops", () => {
    expect(ladderFor("appearanceIntensity", arch("margaux"))).toEqual([
      "PALE",
      "MEDIUM_MINUS",
      "MEDIUM",
      "MEDIUM_PLUS",
      "DEEP",
    ]);
    expect(ladderFor("sweetness", arch("margaux"))).toEqual([
      "DRY",
      "OFF_DRY",
      "MEDIUM_DRY",
      "MEDIUM",
      "MEDIUM_SWEET",
      "SWEET",
      "LUSCIOUS",
    ]);
    expect(ladderFor("tannin", arch("margaux"))).toEqual(["LOW", "MEDIUM_MINUS", "MEDIUM", "MEDIUM_PLUS", "HIGH"]);
    expect(ladderFor("development", arch("margaux"))).toEqual([
      "YOUTHFUL",
      "DEVELOPING",
      "FULLY_DEVELOPED",
      "TIRED_PAST_BEST",
    ]);
  });

  it("takes hue from the candidate's colour row", () => {
    expect(ladderFor("colourHue", arch("margaux"))).toEqual(["PURPLE", "RUBY", "GARNET", "TAWNY", "BROWN"]);
    expect(ladderFor("colourHue", arch("chablis"))).toEqual(["LEMON_GREEN", "LEMON", "GOLD", "AMBER", "BROWN"]);
  });

  it("measures unfortified alcohol on three stops and never a fortified one", () => {
    expect(ladderFor("alcohol", arch("margaux"))).toEqual(["LOW", "MEDIUM", "HIGH"]);
    expect(ladderFor("alcohol", arch("vintage-port"))).toBeNull();
  });

  it("matches mousse on sparkling only, and never clarity", () => {
    expect(ladderFor("mousse", arch("champagne"))).toEqual(["DELICATE", "CREAMY", "AGGRESSIVE"]);
    expect(ladderFor("mousse", arch("margaux"))).toBeNull();
    expect(ladderFor("clarity", arch("margaux"))).toBeNull();
  });
});

describe("distance on a single scale", () => {
  // Margaux tannin [MEDIUM_PLUS, HIGH]; only tannin answered, so
  // closeness = 100 · 1.5·s / 1.5 = 100·s.
  it("in range scores 100", () => {
    expect(get(rank({ tannin: "HIGH" }), "margaux").closeness).toBe(100);
  });
  it("one step below scores 60", () => {
    expect(get(rank({ tannin: "MEDIUM" }), "margaux").closeness).toBe(60);
  });
  it("two steps below scores 20", () => {
    expect(get(rank({ tannin: "MEDIUM_MINUS" }), "margaux").closeness).toBe(20);
  });
  it("three steps below scores 0", () => {
    expect(get(rank({ tannin: "LOW" }), "margaux").closeness).toBe(0);
  });

  it("places a bound the slider cannot produce on the full ladder", () => {
    // Appearance [MEDIUM_PLUS, DEEP] (spec §4.4's example): DEEP 1.0, MEDIUM
    // one step below MEDIUM_PLUS 0.6, PALE three steps below 0.
    const c = variant("margaux", { sat: { appearanceIntensity: ["MEDIUM_PLUS", "DEEP"] } });
    expect(get(rank({ appearanceIntensity: "DEEP" }, NONE, [c]), "margaux-variant").closeness).toBe(100);
    expect(get(rank({ appearanceIntensity: "MEDIUM" }, NONE, [c]), "margaux-variant").closeness).toBe(60);
    expect(get(rank({ appearanceIntensity: "PALE" }, NONE, [c]), "margaux-variant").closeness).toBe(0);
  });

  it("measures sweetness across the enum's MEDIUM the slider skips", () => {
    // Vintage Port sweetness [MEDIUM_SWEET, SWEET]: MEDIUM_DRY is index 2,
    // MEDIUM_SWEET index 4 → d = 2 → 0.2 → 20.
    expect(get(rank({ sweetness: "MEDIUM_DRY" }), "vintage-port").closeness).toBe(20);
  });

  it("measures unfortified alcohol on three stops: medium → high is one step", () => {
    // Margaux alcohol [MEDIUM, MEDIUM]; HIGH is one step on LOW/MEDIUM/HIGH → 60.
    expect(get(rank({ alcohol: "HIGH" }), "margaux").closeness).toBe(60);
  });
});

describe("skipped scales", () => {
  it("skips a scale the candidate does not carry (a white with no tannin range)", () => {
    // tannin HIGH + acidity HIGH.
    const r = rank({ tannin: "HIGH", acidity: "HIGH" });
    // Tannin-free white: tannin skipped; acidity [HIGH, HIGH] in range → 1.5/1.5 = 100.
    expect(get(r, "tannin-free-white").closeness).toBe(100);
    // Chablis: acidity [MEDIUM_PLUS, HIGH] 1.5·1 + tannin [LOW, LOW] d4 1.5·0
    // = 1.5 / 3.0 = 0.5 → 50.
    expect(get(r, "chablis").closeness).toBe(50);
  });

  it("skips a scale whose range bound is off its ladder", () => {
    // acidity ["EXTREME", "HIGH"] is not on the level ladder → skipped; only
    // body counts: [MEDIUM_MINUS, MEDIUM] holds MEDIUM → 1.2/1.2 = 100 (with
    // acidity LOW counted it would have been (0 + 1.2) / 2.7 = 44).
    const c = variant("chablis", { sat: { ...arch("chablis").sat, acidity: ["EXTREME", "HIGH"] } });
    expect(get(rank({ acidity: "LOW", body: "MEDIUM" }, NONE, [c]), "chablis-variant").closeness).toBe(100);
  });

  it("skips an answer that is not on the candidate's ladder", () => {
    // MEDIUM_PLUS is not an unfortified alcohol stop; only tannin counts.
    expect(get(rank({ alcohol: "MEDIUM_PLUS", tannin: "HIGH" }), "margaux").closeness).toBe(100);
  });

  it("skips mousse on a still candidate", () => {
    const r = rank({ mousse: "CREAMY" });
    expect(get(r, "champagne").closeness).toBe(100);
    expect(get(r, "margaux").closeness).toBeNull();
  });

  it("gives null with nothing answered, and with only scales the candidate lacks", () => {
    for (const r of rank({})) expect(r.closeness).toBeNull();
    // Only tannin answered: the tannin-free white carries no tannin → null.
    expect(get(rank({ tannin: "HIGH" }), "tannin-free-white").closeness).toBeNull();
  });

  it("ignores clarity, quality, price and readiness (D18)", () => {
    const r = rank({ clarity: "HAZY", qualityScore: 95, priceCategory: "PREMIUM", readiness: "TOO_OLD" });
    for (const x of r) expect(x.closeness).toBeNull();
  });
});

describe("weights", () => {
  it("weighs each scale by §5.3", () => {
    // Margaux: tannin MEDIUM d1 → 1.5·0.6 = 0.9; finish LONG in range → 0.8;
    // appearance PALE vs [MEDIUM, DEEP] on the full ladder d2 → 0.6·0.2 = 0.12.
    // (0.9 + 0.8 + 0.12) / (1.5 + 0.8 + 0.6) = 1.82 / 2.9 = 0.6276 → 63.
    expect(
      get(rank({ tannin: "MEDIUM", finish: "LONG", appearanceIntensity: "PALE" }), "margaux").closeness,
    ).toBe(63);
  });
});

describe("aromas", () => {
  it("credits the share of the taster's groups the archetype carries", () => {
    // Margaux groups {Black fruit, Herbal, Oak, Red wine}. Picked blackberry
    // (Black fruit), vanilla (Oak), grass (Herbaceous): a = 2/3.
    // 2·(2/3) / 2 = 0.667 → 67 (no signature picked: cedar is Margaux's).
    const r = rank({
      noseTermIds: [tid("Black fruit", "blackberry"), tid("Oak", "vanilla")],
      palateTermIds: [tid("Herbaceous", "grass")],
    });
    expect(get(r, "margaux").closeness).toBe(67);
  });

  it("counts a term picked on nose and palate once", () => {
    const t = tid("Black fruit", "blackberry");
    const r = rank({ noseTermIds: [t, tid("Herbaceous", "grass")], palateTermIds: [t] });
    // groups {Black fruit, Herbaceous}; Margaux carries one → a = 1/2 → 50.
    expect(get(r, "margaux").closeness).toBe(50);
  });

  it("skips the aroma term for a candidate with no aromas", () => {
    // acidity HIGH + blackberry.
    const r = rank({ acidity: "HIGH", noseTermIds: [tid("Black fruit", "blackberry")] });
    // Tannin-free white has no aroma links: acidity alone → 100.
    expect(get(r, "tannin-free-white").closeness).toBe(100);
    // Chablis: acidity 1.5 + aromas 2·0 (no Black fruit) = 1.5 / 3.5 = 0.4286 → 43.
    expect(get(r, "chablis").closeness).toBe(43);
  });

  it("ignores a picked term the lexicon does not know", () => {
    const r = rank({ noseTermIds: ["not-a-term"] });
    for (const x of r) expect(x.closeness).toBeNull();
  });
});

describe("signature bonus", () => {
  const riesling = {
    acidity: "HIGH" as const,
    tannin: "MEDIUM" as const,
    noseTermIds: [tid("White wine", "petrol"), tid("Citrus fruit", "lime"), tid("Tropical fruit", "banana")],
  };

  it("adds a full scale's share per hit", () => {
    // Alsace Riesling: acidity [HIGH, HIGH] 1.5·1 = 1.5; tannin MEDIUM vs
    // [LOW, LOW] d2 1.5·0.2 = 0.3; groups {White wine, Citrus fruit, Tropical
    // fruit} vs {Green fruit, Citrus fruit, Stone fruit, White wine, Other}
    // a = 2/3 → 2·(2/3) = 1.333. den = 1.5 + 1.5 + 2 = 5.
    // base = 3.1333 / 5 = 62.67; petrol is a signature → + 100·1/5 = 20
    // → round(82.67) = 83.
    const r = get(rank(riesling), "alsace-riesling");
    expect(r.closeness).toBe(83);
    expect(r.signatureHits).toEqual(["petrol"]);
  });

  it("never lowers anyone: the same note without the flag scores the base", () => {
    const plain = variant("alsace-riesling", {
      aromas: arch("alsace-riesling").aromas.map((a) => ({ ...a, signature: false })),
    });
    // 62.67 → 63 without the bonus; 83 with it.
    const r = get(rank(riesling, NONE, [plain]), "alsace-riesling-variant");
    expect(r.closeness).toBe(63);
    expect(r.signatureHits).toEqual([]);
  });

  it("a missed signature costs nothing", () => {
    // acidity HIGH + lime, no petrol: flagged and unflagged score the same.
    // acidity 1.5 + aromas 2·1 (Citrus fruit is Riesling's) = 3.5 / 3.5 → 100;
    // add tannin MEDIUM (0.3 of 1.5) so it is not at the ceiling:
    // (1.5 + 0.3 + 2) / 5 = 0.76 → 76 either way.
    const n = { acidity: "HIGH" as const, tannin: "MEDIUM" as const, noseTermIds: [tid("Citrus fruit", "lime")] };
    const plain = variant("alsace-riesling", {
      aromas: arch("alsace-riesling").aromas.map((a) => ({ ...a, signature: false })),
    });
    expect(get(rank(n), "alsace-riesling").closeness).toBe(76);
    expect(get(rank(n, NONE, [plain]), "alsace-riesling-variant").closeness).toBe(76);
  });

  it("counts at most two hits", () => {
    // Sancerre with three signatures (gooseberry, grass, blackcurrant leaf).
    const three = variant("sancerre", {
      aromas: arch("sancerre").aromas.map((a) => ({
        ...a,
        signature: ["gooseberry", "grass", "blackcurrant leaf"].includes(a.term),
      })),
    });
    // acidity LOW vs [HIGH, HIGH] d4 → 0; body FULL vs [MEDIUM_MINUS, MEDIUM]
    // d2 → 1.2·0.2 = 0.24; tannin HIGH vs [LOW, LOW] d4 → 0; sweetness LUSCIOUS
    // vs [DRY, DRY] d6 → 0; groups {Green fruit, Herbaceous} both Sancerre's
    // → a = 1 → 2. den = 1.5 + 1.2 + 1.5 + 1.5 + 2 = 7.7; num = 2.24.
    // base 29.09; two hits count → + 200/7.7 = 25.97 → round(55.06) = 55
    // (all three would have given 68).
    const r = get(
      rank(
        {
          acidity: "LOW",
          body: "FULL",
          tannin: "HIGH",
          sweetness: "LUSCIOUS",
          noseTermIds: [
            tid("Green fruit", "gooseberry"),
            tid("Herbaceous", "grass"),
            tid("Herbaceous", "blackcurrant leaf"),
          ],
        },
        NONE,
        [three],
      ),
      "sancerre-variant",
    );
    expect(r.closeness).toBe(55);
    expect(r.signatureHits).toEqual(["gooseberry", "grass", "blackcurrant leaf"]);
  });

  it("caps closeness at 100", () => {
    // acidity HIGH 1.5 + petrol (White wine) a = 1 → 2: 3.5 / 3.5 = 100;
    // + 100/3.5 = 28.6 → 128.6 → capped at 100.
    const r = get(rank({ acidity: "HIGH", noseTermIds: [tid("White wine", "petrol")] }), "alsace-riesling");
    expect(r.closeness).toBe(100);
  });
});

describe("caps (tri-state)", () => {
  it("null extras and no hue never cap", () => {
    for (const r of rank({ tannin: "HIGH" })) expect(r.capped).toBeNull();
  });

  it("bubbles: yes caps non-sparkling, no caps sparkling", () => {
    const yes = rank({}, { bubbles: true, fortified: null });
    expect(get(yes, "champagne").capped).toBeNull();
    expect(get(yes, "margaux").capped).toBe("bubbles");
    const no = rank({}, { bubbles: false, fortified: null });
    expect(get(no, "champagne").capped).toBe("bubbles");
    expect(get(no, "margaux").capped).toBeNull();
  });

  it("fortified: yes caps unfortified, no caps fortified", () => {
    const yes = rank({}, { bubbles: null, fortified: true });
    expect(get(yes, "vintage-port").capped).toBeNull();
    expect(get(yes, "margaux").capped).toBe("fortified");
    const no = rank({}, { bubbles: null, fortified: false });
    expect(get(no, "vintage-port").capped).toBe("fortified");
    expect(get(no, "margaux").capped).toBeNull();
  });

  it("colour: a hue off the candidate's colour row caps it", () => {
    const r = rank({ colourHue: "RUBY" });
    expect(get(r, "chablis").capped).toBe("colour");
    expect(get(r, "margaux").capped).toBeNull();
  });

  it("an ORANGE candidate is uncapped on GOLD; a red one is capped", () => {
    const orange = variant("tannin-free-white", { colour: "ORANGE" }, "orange");
    const r = rank({ colourHue: "GOLD" }, NONE, [orange, arch("margaux")]);
    expect(get(r, "orange").capped).toBeNull();
    expect(get(r, "margaux").capped).toBe("colour");
  });

  it("BROWN fits white and red, not rosé", () => {
    const rose = variant("tannin-free-white", { colour: "ROSE" }, "rose");
    const r = rank({ colourHue: "BROWN" }, NONE, [arch("chablis"), arch("margaux"), rose]);
    expect(get(r, "chablis").capped).toBeNull();
    expect(get(r, "margaux").capped).toBeNull();
    expect(get(r, "rose").capped).toBe("colour");
  });

  it("caps a number at 15 and keeps a null null", () => {
    // Chablis on RUBY + acidity HIGH: hue skipped (off the white row), acidity
    // in range → 100 → capped at 15.
    expect(get(rank({ colourHue: "RUBY", acidity: "HIGH" }), "chablis").closeness).toBe(15);
    // bubbles only: Margaux capped with nothing answered that applies → null.
    const m = get(rank({}, { bubbles: true, fortified: null }), "margaux");
    expect(m.capped).toBe("bubbles");
    expect(m.closeness).toBeNull();
  });

  it("a capped candidate never outranks an uncapped numbered one", () => {
    // RUBY + tannin LOW: Chablis tannin [LOW, LOW] in range → 100 → capped 15
    // (RUBY is off the white row, so hue is skipped for it). Margaux, uncapped:
    // hue RUBY in [RUBY, GARNET] 1.0 + tannin LOW vs [MEDIUM_PLUS, HIGH] d3 0
    // → 1.0 / 2.5 = 0.4 → 40.
    const r = rank({ colourHue: "RUBY", tannin: "LOW" });
    const ids = r.map((x) => x.candidate.id);
    expect(get(r, "margaux").closeness).toBe(40);
    expect(get(r, "chablis").closeness).toBe(15);
    expect(ids.indexOf("arch-margaux")).toBeLessThan(ids.indexOf("arch-chablis"));
    const firstCapped = r.findIndex((x) => x.capped !== null);
    expect(r.slice(firstCapped).every((x) => x.capped !== null)).toBe(true);
  });
});

describe("fortification skips alcohol both ways (D19)", () => {
  it("a fortified candidate never scores alcohol", () => {
    // Port: alcohol LOW skipped; sweetness SWEET in [MEDIUM_SWEET, SWEET] → 100.
    expect(get(rank({ alcohol: "LOW", sweetness: "SWEET" }), "vintage-port").closeness).toBe(100);
  });

  it("a note that says fortified skips alcohol on every candidate", () => {
    // Margaux, fortified true: alcohol HIGH skipped, tannin HIGH in range →
    // 100 → capped (not fortified) at 15.
    const yes = get(rank({ alcohol: "HIGH", tannin: "HIGH" }, { bubbles: null, fortified: true }), "margaux");
    expect(yes.capped).toBe("fortified");
    expect(yes.closeness).toBe(15);
    // fortified false: alcohol HIGH vs [MEDIUM, MEDIUM] d1 → 0.6; tannin 1.5
    // → (1.5 + 0.6) / 2.5 = 0.84 → 84.
    const no = get(rank({ alcohol: "HIGH", tannin: "HIGH" }, { bubbles: null, fortified: false }), "margaux");
    expect(no.capped).toBeNull();
    expect(no.closeness).toBe(84);
  });
});

describe("explanations (§5.7)", () => {
  it("is null before anything that applies is answered", () => {
    for (const r of rank({})) expect(r.explanation).toBeNull();
  });

  it("explains every cap", () => {
    expect(get(rank({ colourHue: "RUBY" }), "chablis").explanation).toBe("Looks like a red wine, not a white");
    expect(get(rank({}, { bubbles: true, fortified: null }), "margaux").explanation).toBe("Bubbles noted");
    expect(get(rank({}, { bubbles: false, fortified: null }), "champagne").explanation).toBe("No bubbles noted");
    expect(get(rank({}, { bubbles: null, fortified: true }), "margaux").explanation).toBe("Fortified");
    expect(get(rank({}, { bubbles: null, fortified: false }), "vintage-port").explanation).toBe("Not fortified");
    const rose = variant("tannin-free-white", { colour: "ROSE" }, "rose");
    expect(get(rank({ colourHue: "BROWN" }, NONE, [rose]), "rose").explanation).toBe(
      "Looks like a white or red wine, not a rosé",
    );
    const orange = variant("tannin-free-white", { colour: "ORANGE" }, "orange");
    expect(get(rank({ colourHue: "RUBY" }, NONE, [orange]), "orange").explanation).toBe(
      "Looks like a red wine, not an orange",
    );
  });

  it("names the largest scale loss and its direction", () => {
    // Riesling note above: tannin loss 1.5·(1 − 0.2) = 1.2 beats aromas 2·(1/3) = 0.67.
    const r = rank({
      acidity: "HIGH",
      tannin: "MEDIUM",
      noseTermIds: [tid("White wine", "petrol"), tid("Citrus fruit", "lime"), tid("Tropical fruit", "banana")],
    });
    expect(get(r, "alsace-riesling").explanation).toBe("Tannin higher than typical");
    expect(get(rank({ tannin: "LOW" }), "margaux").explanation).toBe("Tannin lower than typical");
  });

  it("words hue as darker or lighter", () => {
    // Margaux [RUBY, GARNET] on the red row: BROWN d2 (loss 0.8) → darker;
    // PURPLE d1 (loss 0.4) → lighter.
    expect(get(rank({ colourHue: "BROWN" }), "margaux").explanation).toBe("Colour darker than typical");
    expect(get(rank({ colourHue: "PURPLE" }), "margaux").explanation).toBe("Colour lighter than typical");
  });

  it("names the taster's missing group with the most picked terms", () => {
    // Margaux: grass + green bell pepper (Herbaceous ×2), banana (Tropical
    // fruit ×1), blackcurrant (Black fruit, Margaux's): a = 1/3, loss 1.33.
    const r = rank({
      noseTermIds: [
        tid("Herbaceous", "grass"),
        tid("Herbaceous", "green bell pepper"),
        tid("Tropical fruit", "banana"),
        tid("Black fruit", "blackcurrant"),
      ],
    });
    expect(get(r, "margaux").explanation).toBe("Herbaceous isn't typical");
  });

  it("below 0.3: a signature hit, else 'Fits what you've said so far'", () => {
    // acidity HIGH + petrol on Riesling: no loss at all, petrol hit.
    expect(
      get(rank({ acidity: "HIGH", noseTermIds: [tid("White wine", "petrol")] }), "alsace-riesling").explanation,
    ).toBe("✓ petrol — a signature");
    expect(get(rank({ tannin: "HIGH" }), "margaux").explanation).toBe("Fits what you've said so far");
    // development FULLY_DEVELOPED vs [YOUTHFUL, DEVELOPING]: d1, loss
    // 0.6·0.4 = 0.24 < 0.3 → still "fits" (closeness 0.36/0.6 = 60).
    const dev = get(rank({ development: "FULLY_DEVELOPED" }), "margaux");
    expect(dev.closeness).toBe(60);
    expect(dev.explanation).toBe("Fits what you've said so far");
    // nose PRONOUNCED vs [MEDIUM, MEDIUM_PLUS]: d1, loss 0.8·0.4 = 0.32 ≥ 0.3.
    expect(get(rank({ noseIntensity: "PRONOUNCED" }), "margaux").explanation).toBe(
      "Nose intensity higher than typical",
    );
  });

  it("explain() is pure over its inputs", () => {
    const c = arch("margaux");
    expect(
      explain({ candidate: c, closeness: null, capped: null, signatureHits: [], losses: [], aromaLoss: null }),
    ).toBeNull();
    expect(
      explain({
        candidate: c,
        closeness: 40,
        capped: null,
        signatureHits: ["cedar"],
        losses: [{ scale: "body", loss: 0.96, direction: "lower" }],
        aromaLoss: { loss: 1.0, group: "Tropical fruit" },
      }),
    ).toBe("Tropical fruit isn't typical");
    // A tie goes to the scale seen first.
    expect(
      explain({
        candidate: c,
        closeness: 40,
        capped: null,
        signatureHits: [],
        losses: [
          { scale: "acidity", loss: 0.6, direction: "higher" },
          { scale: "tannin", loss: 0.6, direction: "lower" },
        ],
        aromaLoss: null,
      }),
    ).toBe("Acidity higher than typical");
    expect(
      explain({
        candidate: c,
        closeness: 90,
        capped: null,
        signatureHits: ["cedar"],
        losses: [{ scale: "body", loss: 0.24, direction: "lower" }],
        aromaLoss: null,
      }),
    ).toBe("✓ cedar — a signature");
  });
});

describe("order (§5.8)", () => {
  it("before any answer: grouped by country, then name", () => {
    const names = rank({}).map((r) => r.candidate.name);
    expect(names[0]).toBe("A typical Tannin-free White"); // Austria
    expect(names[1]).toBe("A typical Alsace Riesling"); // France, first by name
    expect(names[names.length - 2]).toBe("A typical Vosne-Romanée"); // France, last
    expect(names[names.length - 1]).toBe("A typical Vintage Port"); // Portugal
  });

  it("ranks a left-bank claret note: Margaux first, then by closeness", () => {
    // Every scale answered + blackcurrant/cedar/tobacco on the nose and
    // blackcurrant/leather on the palate. Σw over the 11 scales = 11.3,
    // + aromas 2 = 13.3 (Port skips alcohol: 12.3).
    const r = rank({
      appearanceIntensity: "DEEP",
      colourHue: "GARNET",
      noseIntensity: "MEDIUM",
      development: "DEVELOPING",
      sweetness: "DRY",
      acidity: "MEDIUM_PLUS",
      tannin: "HIGH",
      alcohol: "MEDIUM",
      body: "FULL",
      flavourIntensity: "MEDIUM",
      finish: "LONG",
      noseTermIds: [tid("Black fruit", "blackcurrant"), tid("Oak", "cedar"), tid("Red wine", "tobacco")],
      palateTermIds: [tid("Black fruit", "blackcurrant"), tid("Red wine", "leather")],
    });
    // Margaux: every scale in range, groups {Black fruit, Oak, Red wine} all
    // its own → 13.3/13.3 → 100 (+ cedar, capped at 100).
    // Côte-Rôtie: hue GARNET vs [PURPLE, RUBY] d1 (−0.4), nose and flavour
    // MEDIUM vs [MEDIUM_PLUS, …] d1 (−0.32 each), aromas a = 1:
    // (11.3 − 1.04 + 2) / 13.3 = 12.26 / 13.3 = 0.9218 → 92.
    // Bandol: nose, flavour d1 (−0.64), no Oak → a = 2/3:
    // (11.3 − 0.64 + 1.333) / 13.3 = 0.9018 → 90.
    // Châteauneuf: nose, flavour d1 (−0.64), acidity MEDIUM_PLUS vs
    // [MEDIUM_MINUS, MEDIUM] d1 (−0.6), tannin HIGH vs [MEDIUM, MEDIUM_PLUS]
    // d1 (−0.6), a = 2/3: (11.3 − 1.84 + 1.333) / 13.3 = 0.8115 → 81.
    // Vintage Port (alcohol skipped): nose d1 (−0.32), sweetness DRY vs
    // [MEDIUM_SWEET, SWEET] d4 (−1.5), flavour MEDIUM vs [PRONOUNCED] d2
    // (−0.64), a = 1: (10.3 − 2.46 + 2) / 12.3 = 9.84 / 12.3 = 0.8 → 80.
    expect(r.slice(0, 5).map((x) => [x.candidate.name, x.closeness])).toEqual([
      ["A typical Margaux", 100],
      ["A typical Côte-Rôtie", 92],
      ["A typical Bandol", 90],
      ["A typical Châteauneuf-du-Pape", 81],
      ["A typical Vintage Port", 80],
    ]);
    expect(get(r, "cote-rotie").explanation).toBe("Colour darker than typical");
    expect(get(r, "bandol").explanation).toBe("Oak isn't typical");
    expect(get(r, "vintage-port").explanation).toBe("Sweetness lower than typical");
    // GARNET caps every white; they close the list.
    const whites = r.filter((x) => x.candidate.colour === "WHITE");
    expect(whites.every((x) => x.capped === "colour")).toBe(true);
    expect(r.slice(-whites.length).every((x) => x.candidate.colour === "WHITE")).toBe(true);
  });

  it("breaks a tie by short name", () => {
    const beta = variant("margaux", { name: "A typical Beta" }, "beta");
    const alpha = variant("margaux", { name: "A typical Alpha" }, "alpha");
    const r = rank({ tannin: "HIGH" }, NONE, [beta, alpha]);
    expect(r.map((x) => x.candidate.name)).toEqual(["A typical Alpha", "A typical Beta"]);
  });

  it("puts capped nulls after capped numbers", () => {
    // RUBY + acidity HIGH: tannin-free white capped with 100 → 15; a white
    // with no acidity range (Chablis without sat) stays null, capped.
    const bare = variant("chablis", { sat: {} }, "bare");
    const r = rank({ colourHue: "RUBY", acidity: "HIGH" }, NONE, [bare, arch("tannin-free-white")]);
    expect(r.map((x) => [x.candidate.id, x.closeness])).toEqual([
      ["arch-tannin-free-white", 15],
      ["arch-bare", null],
    ]);
  });
});

describe("snapshotRanking", () => {
  it("freezes the whole list with 1-based ranks", () => {
    const r = rank({ colourHue: "RUBY", tannin: "LOW" });
    const s = snapshotRanking(r);
    expect(s).toHaveLength(POOL.length);
    expect(s.map((x) => x.rank)).toEqual(POOL.map((_, i) => i + 1));
    expect(s[0]).toEqual({
      archetypeId: r[0].candidate.id,
      name: r[0].candidate.name,
      closeness: r[0].closeness,
      rank: 1,
      capped: null,
    });
    const chablis = s.find((x) => x.archetypeId === "arch-chablis");
    expect(chablis).toEqual({
      archetypeId: "arch-chablis",
      name: "A typical Chablis",
      closeness: 15,
      rank: s.findIndex((x) => x.archetypeId === "arch-chablis") + 1,
      capped: "colour",
    });
  });
});
