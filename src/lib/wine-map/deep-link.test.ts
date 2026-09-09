import { describe, expect, it } from "vitest";
import { deepLinkAction, type DeepLinkState } from "./deep-link";

/**
 * These cases are written as sequences because the bug that motivated them is a
 * sequence bug: each step feeds its result into the next, exactly as the
 * component does across renders.
 */
function step(state: DeepLinkState) {
  const action = deepLinkAction(state);
  return {
    action,
    // What the component's state looks like after applying the action.
    lastInitialKey: action ? action.nextWatermark : state.lastInitialKey,
    selectedKey: action?.select ?? state.selectedKey,
  };
}

/** A selection made on the map or in the tree: replaceState only, prop frozen. */
function selectLocally(state: DeepLinkState, key: string): DeepLinkState {
  return { ...state, selectedKey: key };
}

/** A real router navigation: the server component re-renders with a new prop. */
function navigate(state: DeepLinkState, place: string): DeepLinkState {
  return { ...state, initialPlaceKey: place };
}

describe("deepLinkAction", () => {
  it("does nothing when the page has no ?place=", () => {
    expect(
      deepLinkAction({ initialPlaceKey: null, lastInitialKey: null, selectedKey: null }),
    ).toBeNull();
  });

  it("does nothing on the initial mount of a deep link", () => {
    // The component seeds both the watermark and the selection from the prop.
    expect(
      deepLinkAction({
        initialPlaceKey: "france.bordeaux",
        lastInitialKey: "france.bordeaux",
        selectedKey: "france.bordeaux",
      }),
    ).toBeNull();
  });

  // THE REGRESSION. Shipped twice (#22 compared the prop against selectedKey;
  // #23 advanced the watermark inside select()). Both made the watermark
  // diverge from a prop that cannot move, so every click was undone in the same
  // render pass and no polygon on the map could be selected at all.
  it("leaves a local selection alone when the page was deep-linked", () => {
    let state: DeepLinkState = {
      initialPlaceKey: "france.bordeaux",
      lastInitialKey: "france.bordeaux",
      selectedKey: "france.bordeaux",
    };

    state = selectLocally(state, "france.bourgogne.la-tache");
    const first = step(state);
    expect(first.action).toBeNull();
    expect(first.selectedKey).toBe("france.bourgogne.la-tache");

    // And it must stay put across further renders, not just the first one.
    const second = step({ ...state, lastInitialKey: first.lastInitialKey });
    expect(second.action).toBeNull();
    expect(second.selectedKey).toBe("france.bourgogne.la-tache");
  });

  it("keeps every subsequent selection too", () => {
    let state: DeepLinkState = {
      initialPlaceKey: "france.bordeaux",
      lastInitialKey: "france.bordeaux",
      selectedKey: "france.bordeaux",
    };
    for (const key of ["italy.toscana", "italy.toscana.chianti", "germany.mosel"]) {
      state = selectLocally(state, key);
      const result = step(state);
      expect(result.action).toBeNull();
      expect(result.selectedKey).toBe(key);
      state = { ...state, lastInitialKey: result.lastInitialKey };
    }
  });

  it("selects on a real navigation to a different place", () => {
    const state = navigate(
      {
        initialPlaceKey: "france.bordeaux",
        lastInitialKey: "france.bordeaux",
        selectedKey: "france.bordeaux",
      },
      "italy.toscana",
    );
    expect(deepLinkAction(state)).toEqual({
      nextWatermark: "italy.toscana",
      select: "italy.toscana",
    });
  });

  it("advances the watermark without reselecting when the target is already selected", () => {
    // Navigating to what the user had already clicked: the watermark must catch
    // up, but re-selecting would restart the context fetch and re-fly the camera.
    const state: DeepLinkState = {
      initialPlaceKey: "italy.toscana",
      lastInitialKey: "france.bordeaux",
      selectedKey: "italy.toscana",
    };
    expect(deepLinkAction(state)).toEqual({
      nextWatermark: "italy.toscana",
      select: null,
    });
  });

  it("re-selects a deep link after navigating away and back", () => {
    let state: DeepLinkState = {
      initialPlaceKey: "france.bordeaux",
      lastInitialKey: "france.bordeaux",
      selectedKey: "france.bordeaux",
    };
    state = selectLocally(state, "italy.toscana.chianti");
    state = navigate(state, "germany.mosel");
    const away = step(state);
    expect(away.selectedKey).toBe("germany.mosel");

    state = navigate(
      { ...state, lastInitialKey: away.lastInitialKey, selectedKey: away.selectedKey },
      "france.bordeaux",
    );
    const back = step(state);
    expect(back.selectedKey).toBe("france.bordeaux");
  });

  // Documented limitation, asserted so it is a decision rather than a surprise.
  it("does NOT re-select when re-navigating to the same key it last navigated to", () => {
    let state: DeepLinkState = {
      initialPlaceKey: "france.bordeaux",
      lastInitialKey: "france.bordeaux",
      selectedKey: "france.bordeaux",
    };
    state = selectLocally(state, "italy.toscana.chianti");
    // The router navigates to ?place=france.bordeaux again, but the prop is
    // identical to last time, so it is indistinguishable from no navigation.
    expect(step(state).selectedKey).toBe("italy.toscana.chianti");
  });
});

/**
 * Guards against reintroducing either historical implementation. Both pass every
 * other case above; only the "leaves a local selection alone" scenario separates
 * them from the correct rule, which is precisely why reading them looked fine.
 */
describe("historical implementations stay dead", () => {
  const deepLinked: DeepLinkState = {
    initialPlaceKey: "france.bordeaux",
    lastInitialKey: "france.bordeaux",
    selectedKey: "france.bourgogne.la-tache",
  };

  it("#22: comparing the prop against the selection reverted every click", () => {
    const broken = (s: DeepLinkState) =>
      s.initialPlaceKey && s.initialPlaceKey !== s.selectedKey ? s.initialPlaceKey : null;
    expect(broken(deepLinked)).toBe("france.bordeaux"); // would revert
    expect(deepLinkAction(deepLinked)).toBeNull(); // current rule does not
  });

  it("#23: advancing the watermark in select() reverted every click", () => {
    // select() had set the watermark to the clicked key.
    const afterBrokenSelect: DeepLinkState = {
      ...deepLinked,
      lastInitialKey: "france.bourgogne.la-tache",
    };
    expect(deepLinkAction(afterBrokenSelect)?.select).toBe("france.bordeaux"); // would revert
    // The fix is that select() must not touch the watermark at all.
    expect(deepLinkAction(deepLinked)).toBeNull();
  });
});
