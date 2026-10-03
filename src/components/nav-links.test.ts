import { describe, expect, it } from "vitest";
import { TRAINING_COPY } from "../lib/training/copy";
import { NAV_CHILD_PILL, NAV_LINKS, isNavActive, navChildState } from "./nav-links";

// Owner, 2026-10-03: "Split Learn in two" — the wine map is a pillar of its own.
describe("Wine map and Library pillars", () => {
  const lit = (path: string) => NAV_LINKS.filter((l) => isNavActive(path, l)).map((l) => l.key);

  it("lists them as top-level items in place of Learn", () => {
    expect(NAV_LINKS.map((l) => l.label)).toEqual([
      "Overview", "Taste", "Wine map", "Library", "Cellar", "Catalog", "Community",
    ]);
    expect(NAV_LINKS.find((l) => l.key === "map")?.href).toBe("/knowledge/map");
    expect(NAV_LINKS.find((l) => l.key === "library")?.href).toBe("/knowledge/designations");
  });

  it("lights exactly one of them on each knowledge page", () => {
    expect(lit("/knowledge/map")).toEqual(["map"]);
    expect(lit("/knowledge/designations")).toEqual(["library"]);
    expect(lit("/knowledge/grapes/abc")).toEqual(["library"]);
    expect(lit("/knowledge/type-designations")).toEqual(["library"]);
    expect(lit("/knowledge/archetypes/claret")).toEqual(["library"]);
    expect(lit("/rules")).toEqual(["library"]);
  });
});

// Training-room spec §3.1 / D12: the Training Room is a live link with a
// Preview pill, drawn through one helper by the sidebar and the phone drawer.
describe("navChildState", () => {
  it("a plain child is a link", () => {
    expect(navChildState({ href: "/taste/notes", label: "Tasting notes" })).toBe("link");
  });
  it("a teaser is soon", () => {
    expect(navChildState({ href: "/somewhere", label: "Somewhere", soon: true })).toBe("soon");
  });
  it("a preview is a live link with a pill", () => {
    expect(navChildState({ href: "/taste/training", label: "Training Room", preview: true })).toBe("preview");
  });
  it("soon wins when both are set, so a teaser never becomes clickable by accident", () => {
    expect(navChildState({ href: "/x", label: "X", soon: true, preview: true })).toBe("soon");
  });
  it("names the two pills", () => {
    expect(NAV_CHILD_PILL).toEqual({ soon: "Soon", preview: "Preview" });
  });
  it("takes the Preview pill and the Training Room label from the room's copy (one source)", () => {
    expect(NAV_CHILD_PILL.preview).toBe(TRAINING_COPY.previewPill);
    const taste = NAV_LINKS.find((l) => l.key === "taste");
    expect(taste?.children?.find((c) => c.href === "/taste/training")?.label).toBe(TRAINING_COPY.navLabel);
  });
  it("Taste lists the Training Room as a preview link to /taste/training, and nothing as soon", () => {
    const taste = NAV_LINKS.find((l) => l.key === "taste");
    expect(taste?.children?.find((c) => c.label === "Training Room")).toEqual({
      href: "/taste/training",
      label: "Training Room",
      preview: true,
    });
    expect(taste?.children?.some((c) => c.soon)).toBe(false);
  });
});
