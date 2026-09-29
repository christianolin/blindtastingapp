import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ArchetypeLinks } from "./archetype-links";

// The map → room links (training-room-map spec RM10, §11): the practise link
// always, never naming the wine; the map link only when asked for and placed.

const KEY = "france.bourgogne.chablis";
const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);

describe("ArchetypeLinks", () => {
  it("the Library (mapLink) shows both links, same tab", () => {
    const html = renderToStaticMarkup(<ArchetypeLinks placeKey={KEY} mapLink />);
    expect(hrefs(html)).toEqual(["/taste/training", `/knowledge/map?place=${KEY}`]);
    expect(html).toContain("Practise blind in the training room →");
    expect(html).toContain("See it on the wine map");
    expect(html).not.toContain("target=");
  });

  it("the explorer and the archetype page (no mapLink) show only the practise link", () => {
    expect(hrefs(renderToStaticMarkup(<ArchetypeLinks placeKey={KEY} />))).toEqual(["/taste/training"]);
  });

  it("an unplaced wine gets no map link even when asked for", () => {
    expect(hrefs(renderToStaticMarkup(<ArchetypeLinks placeKey={null} mapLink />))).toEqual(["/taste/training"]);
  });
});
