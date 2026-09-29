import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { arch } from "@/lib/training/__fixtures__/archetypes";
import { MAP_PALETTES } from "@/lib/wine-map/map-palette";
import { MapFallback, MapUpright } from "./map-fallback";
import { MapSwitch, nextTab } from "./map-switch";
import { TrainingMapLegend } from "./training-map-legend";

// The likelihood map's markup outside its chunk, and its legend (training-room-map
// spec RM19, RM22, RM25, §6.4, §11 "component markup tests").

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
