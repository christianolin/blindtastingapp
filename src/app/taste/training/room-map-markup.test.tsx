import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MapFallback, MapUpright } from "./map-fallback";
import { MapSwitch, nextTab } from "./map-switch";

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
