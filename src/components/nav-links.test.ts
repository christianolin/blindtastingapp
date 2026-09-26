import { describe, expect, it } from "vitest";
import { TRAINING_COPY } from "../lib/training/copy";
import { NAV_CHILD_PILL, NAV_LINKS, navChildState } from "./nav-links";

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
