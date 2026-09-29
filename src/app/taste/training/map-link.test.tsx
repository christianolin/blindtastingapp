import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { arch } from "@/lib/training/__fixtures__/archetypes";
import { groupRanking, regionPanelView } from "@/lib/training/groups";
import type { RankedCandidate, TrainingCandidate } from "@/lib/training/types";
import { emptyNoteState } from "@/lib/wset/note-state";
import { ArchetypeDetail } from "./archetype-detail";
import { RegionGroups } from "./candidates-panel";
import { DetailMapLink, GroupMapLink } from "./map-link";

// The room's links out to the wine map (training-room-map spec RM6-RM8, §11
// "component markup tests"): a new tab with rel="noopener" and a visually
// hidden hint, or plain "Not on the wine map yet" text and no link.

const PAUILLAC_KEY = "france.bordeaux.haut-medoc.pauillac";
const placed: TrainingCandidate = {
  ...arch("margaux"),
  placeCanonicalKey: PAUILLAC_KEY,
  mapRegion: { key: "france.bordeaux", name: "Bordeaux" },
  mapPoint: { lon: -0.7708, lat: 45.1971, source: "place" },
};
const unplaced: TrainingCandidate = arch("vosne");

function rc(c: TrainingCandidate): RankedCandidate {
  return { candidate: c, closeness: null, capped: null, explanation: null, signatureHits: [] };
}

describe("DetailMapLink", () => {
  it("links a placed wine to its place in a new tab", () => {
    const html = renderToStaticMarkup(<DetailMapLink placeKey={PAUILLAC_KEY} />);
    expect(html).toContain(`href="/knowledge/map?place=${PAUILLAC_KEY}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener"');
    expect(html).toContain("See it on the wine map");
    expect(html).toMatch(/<span class="sr-only"> \(opens in a new tab\)<\/span>/);
    expect(html).toContain('aria-hidden="true"');
  });

  it("reads 'Not on the wine map yet' as text, with no link, for an unplaced wine", () => {
    const html = renderToStaticMarkup(<DetailMapLink placeKey={null} />);
    expect(html).toBe('<p class="text-[12.5px] text-muted-foreground">Not on the wine map yet</p>');
  });
});

describe("GroupMapLink", () => {
  it("names the MAP region and opens it in a new tab", () => {
    const html = renderToStaticMarkup(<GroupMapLink region={{ key: "italy.veneto", name: "Veneto" }} />);
    expect(html).toContain('href="/knowledge/map?place=italy.veneto"');
    expect(html).toContain("Veneto on the wine map");
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener"');
  });

  it("names the region in English, as the explorer does by default, and keeps its key", () => {
    // R1 review nit: the map's place names are local ("Vallée du Rhône"); the
    // explorer shows English by default (localize-names.ts), so the link does too.
    const rhone = renderToStaticMarkup(<GroupMapLink region={{ key: "france.rhone", name: "Vallée du Rhône" }} />);
    expect(rhone).toContain("Rhône Valley on the wine map");
    expect(rhone).toContain('href="/knowledge/map?place=france.rhone"');
    expect(renderToStaticMarkup(<GroupMapLink region={{ key: "spain.andalucia", name: "Andalucía" }} />)).toContain(
      "Andalusia on the wine map",
    );
    // A name with no English exonym is unchanged.
    expect(renderToStaticMarkup(<GroupMapLink region={{ key: "italy.veneto", name: "Veneto" }} />)).toContain(
      "Veneto on the wine map",
    );
  });

  it("reads 'Not on the wine map yet' with no link when the group has no map region", () => {
    const html = renderToStaticMarkup(<GroupMapLink region={null} />);
    expect(html).not.toContain("<a");
    expect(html).toContain("Not on the wine map yet");
  });
});

describe("ArchetypeDetail", () => {
  it("ends with the wine's map link", () => {
    const html = renderToStaticMarkup(<ArchetypeDetail candidate={placed} note={emptyNoteState()} />);
    expect(html).toContain(`href="/knowledge/map?place=${PAUILLAC_KEY}"`);
    expect(html.lastIndexOf("See it on the wine map")).toBeGreaterThan(html.indexOf(placed.name));
  });

  it("an unplaced wine's detail has no map link", () => {
    const html = renderToStaticMarkup(<ArchetypeDetail candidate={unplaced} note={emptyNoteState()} />);
    expect(html).not.toContain("/knowledge/map");
    expect(html).toContain("Not on the wine map yet");
  });
});

describe("RegionGroups", () => {
  it("an open group's first row links its map region, outside the region row's button", () => {
    const groups = groupRanking([rc(placed), rc(unplaced)]);
    const view = regionPanelView(groups, true);
    const bordeaux = groups.find((g) => g.region.name === "Bordeaux")!;
    const bourgogne = groups.find((g) => g.region.name === "Bourgogne")!;
    const html = renderToStaticMarkup(
      <RegionGroups
        view={view}
        expand={{ [bordeaux.key]: true, [bourgogne.key]: true }}
        onToggle={() => {}}
        onOpen={() => {}}
      />,
    );
    // The link row comes before the group's first wine, and no <a> sits in a <button>.
    expect(html.indexOf("Bordeaux on the wine map")).toBeGreaterThan(-1);
    expect(html.indexOf("Bordeaux on the wine map")).toBeLessThan(html.indexOf(placed.name));
    expect(html).not.toMatch(/<button[^>]*>(?:(?!<\/button>)[\s\S])*<a /);
    // The unplaced group reads the muted line.
    expect(html).toContain("Not on the wine map yet");
  });

  it("a closed group shows no link row", () => {
    const groups = groupRanking([rc(placed)]);
    const view = regionPanelView(groups, true);
    const html = renderToStaticMarkup(
      <RegionGroups view={view} expand={{ [groups[0].key]: false }} onToggle={() => {}} onOpen={() => {}} />,
    );
    expect(html).not.toContain("on the wine map");
  });
});
