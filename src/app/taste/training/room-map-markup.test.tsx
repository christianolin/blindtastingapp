import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { arch } from "@/lib/training/__fixtures__/archetypes";
import { groupRanking } from "@/lib/training/groups";
import type { RankedCandidate, TrainingCandidate } from "@/lib/training/types";
import { MAP_PALETTES } from "@/lib/wine-map/map-palette";
import { emptyNoteState } from "@/lib/wset/note-state";
import { CandidatesPanel, selectedMapIds, targetDetailId, visibleTarget, type PopoverTarget } from "./candidates-panel";
import { MapFallback, MapUpright } from "./map-fallback";
import { MapSwitch, nextTab } from "./map-switch";
import { ROOM_MAP_START, type RoomMap, type RoomMapState } from "./room-map-state";
import { TrainingMapLegend } from "./training-map-legend";

// The likelihood map's markup outside its chunk, and its legend (training-room-map
// spec RM19, RM22, RM25, §6.4, §11 "component markup tests").

function rc(c: TrainingCandidate, closeness: number | null): RankedCandidate {
  return {
    candidate: c,
    closeness,
    capped: null,
    explanation: null,
    signatureHits: [],
  };
}
const RANKED = [rc(arch("margaux"), 80), rc(arch("cdp"), 60)];
const roomMap = (state: Partial<RoomMapState> = {}): RoomMap => ({
  state: { ...ROOM_MAP_START, ...state },
  dispatch: () => {},
  warm: () => {},
});
const panel = (map: RoomMap | null, ranked = RANKED) =>
  renderToStaticMarkup(
    <CandidatesPanel groups={groupRanking(ranked)} ranked={ranked} note={emptyNoteState()} roomMap={map} />,
  );

describe("MapSwitch (RM25)", () => {
  const html = renderToStaticMarkup(<MapSwitch idBase="t" view="map" onSelect={() => {}} onWarm={() => {}} />);

  it("is a labelled tablist of two tabs with a roving tabIndex", () => {
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="What it could be, as a list or a map"');
    expect(html).toMatch(
      /<button[^>]*role="tab"[^>]*id="t-tab-list"[^>]*aria-selected="false"[^>]*aria-controls="t-panel-list"[^>]*tabindex="-1"[^>]*>List<\/button>/,
    );
    expect(html).toMatch(
      /<button[^>]*role="tab"[^>]*id="t-tab-map"[^>]*aria-selected="true"[^>]*aria-controls="t-panel-map"[^>]*tabindex="0"[^>]*>Map<\/button>/,
    );
  });

  it("nextTab: either arrow flips, Home and End go to the ends, other keys do nothing", () => {
    expect(nextTab("ArrowRight", "list")).toBe("map");
    expect(nextTab("ArrowLeft", "list")).toBe("map");
    expect(nextTab("ArrowLeft", "map")).toBe("list");
    expect(nextTab("ArrowRight", "map")).toBe("list");
    expect(nextTab("Home", "map")).toBe("list");
    expect(nextTab("End", "list")).toBe("map");
    expect(nextTab("Enter", "list")).toBeNull();
    expect(nextTab("Tab", "map")).toBeNull();
  });
});

describe("CandidatesPanel with the map switch (RM19)", () => {
  it("with the kill switch on (roomMap null) there is no tablist and no tabpanel: R1's column", () => {
    const html = panel(null);
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain('role="tabpanel"');
    expect(html).toContain(
      '<h2 id="training-candidates" class="px-3 pt-2 font-heading text-[19px] font-semibold">What it could be</h2>',
    );
  });

  it("on List: the list's panel shows, the map's is hidden and empty", () => {
    const html = panel(roomMap());
    expect(html).toContain('role="tablist"');
    expect(html).toMatch(/role="tabpanel" id="[^"]*-panel-list" aria-labelledby="[^"]*-tab-list" class=/);
    expect(html).toMatch(
      /role="tabpanel" id="[^"]*-panel-map" aria-labelledby="[^"]*-tab-map" hidden="" class="[^"]*"><\/div>/,
    );
    expect(html).toContain("Bordeaux, France");
  });

  it("on Map: the list stays mounted but hidden (its regions and Show all come back as they were)", () => {
    const html = panel(roomMap({ view: "map" }));
    expect(html).toMatch(/role="tabpanel" id="[^"]*-panel-list" aria-labelledby="[^"]*-tab-list" hidden=""/);
    // Still rendered inside the hidden panel: the same region rows.
    const listPanel = html.slice(
      html.search(/role="tabpanel" id="[^"]*-panel-list"/),
      html.search(/role="tabpanel" id="[^"]*-panel-map"/),
    );
    expect(listPanel).toContain("Bordeaux, France");
    expect(html).toMatch(/role="tabpanel" id="[^"]*-panel-map" aria-labelledby="[^"]*-tab-map" class=/);
  });

  it("before any answer, Map leaves 'Start describing the wine' to the legend", () => {
    const before = [rc(arch("margaux"), null)];
    expect(panel(roomMap(), before)).toContain("Start describing the wine");
    expect(panel(roomMap({ view: "map" }), before)).not.toContain("Start describing the wine");
  });

  it("a stopped map puts the line and 'Try the map again' at the top of the list", () => {
    const html = panel(roomMap({ fault: "stopped" }));
    expect(html).toContain("The map stopped working — the list has every wine.");
    expect(html).toContain(">Try the map again</button>");
    expect(html.indexOf("The map stopped working")).toBeLessThan(html.indexOf("Bordeaux, France"));
  });
});

describe("the popover's target rules (RM18)", () => {
  const button = {} as HTMLElement;
  const map = (ids: string[], chosen: string | null = null): PopoverTarget => ({
    kind: "map",
    ids,
    chosen,
    anchor: button,
    returnFocus: button,
  });
  const row: PopoverTarget = { kind: "row", id: "a", anchor: button };

  it("one wine opens its detail; several open a chooser until one is chosen", () => {
    expect(targetDetailId(row)).toBe("a");
    expect(targetDetailId(map(["a"]))).toBe("a");
    expect(targetDetailId(map(["a", "b", "c"]))).toBeNull();
    expect(targetDetailId(map(["a", "b", "c"], "b"))).toBe("b");
  });

  it("the gold ring: every wine of an open chooser, then the chosen one; none for a row", () => {
    expect(selectedMapIds(map(["a", "b"]))).toEqual(["a", "b"]);
    expect(selectedMapIds(map(["a", "b"], "b"))).toEqual(["b"]);
    expect(selectedMapIds(row)).toEqual([]);
    expect(selectedMapIds(null)).toEqual([]);
  });

  it("a row's popover shows only on List, a map's only on Map", () => {
    expect(visibleTarget(row, false)).toBe(row);
    expect(visibleTarget(row, true)).toBeNull();
    const m = map(["a"]);
    expect(visibleTarget(m, true)).toBe(m);
    expect(visibleTarget(m, false)).toBeNull();
  });
});

describe("the fallbacks (RM20, RM22)", () => {
  it("stopped: a status line and a retry", () => {
    const html = renderToStaticMarkup(<MapFallback kind="stopped" onRetry={() => {}} />);
    expect(html).toContain('role="status"');
    expect(html).toContain("The map stopped working — the list has every wine.");
    expect(html).toContain(">Try the map again</button>");
  });

  it("a chunk that could not load: an alert, a reload, and no Try again", () => {
    const html = renderToStaticMarkup(<MapFallback kind="reload" />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("The map needs a page reload to load.");
    expect(html).toContain(">Reload the page</button>");
    expect(html).not.toContain("Try the map again");
  });

  it("a short screen: the upright note and Show the list", () => {
    const html = renderToStaticMarkup(<MapUpright onShowList={() => {}} />);
    expect(html).toContain("Turn your phone upright to see the map.");
    expect(html).toContain(">Show the list</button>");
  });
});

describe("TrainingMapLegend (§6.4)", () => {
  const legend = (props: Partial<Parameters<typeof TrainingMapLegend>[0]> = {}) =>
    renderToStaticMarkup(
      <TrainingMapLegend
        palette={MAP_PALETTES.light}
        before={false}
        curated={false}
        unmapped={[]}
        onOpenUnmapped={() => {}}
        {...props}
      />,
    );

  it("before any answer: only 'Start describing the wine'", () => {
    expect(legend({ before: true })).toBe(
      '<p class="text-[12.5px] text-muted-foreground">Start describing the wine</p>',
    );
  });

  it("the ramp through the four stops, the ring, and the relative line", () => {
    const html = legend();
    expect(html).toContain("Less close");
    expect(html).toContain("Closest");
    expect(html).toContain(`linear-gradient(to right, ${MAP_PALETTES.light.heat.stops.join(", ")})`);
    expect(html).toContain("Ruled out");
    expect(html).toContain(`border-color:${MAP_PALETTES.light.heat.capped}`);
    expect(html).toContain("Colours compare the wines with each other; the % is each wine&#x27;s own closeness.");
    expect(html).not.toContain("approximate spot");
    expect(html).not.toContain("not on the wine map yet");
  });

  it("the approximate-spot line only while a dot is curated", () => {
    expect(legend({ curated: true })).toContain("Wines outside the mapped countries sit at an approximate spot.");
  });

  it("wines with no dot: the count and each name as a real button", () => {
    const html = legend({ unmapped: [arch("champagne"), arch("bandol")] });
    expect(html).toContain("2 not on the wine map yet");
    expect(html).toMatch(/<button type="button"[^>]*>A typical Champagne<\/button>/);
    expect(html).toMatch(/<button type="button"[^>]*>A typical Bandol<\/button>/);
  });

  it("dark uses the dark table's stops", () => {
    expect(legend({ palette: MAP_PALETTES.dark })).toContain(MAP_PALETTES.dark.heat.stops.join(", "));
  });
});
