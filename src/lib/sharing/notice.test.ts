import { describe, expect, it } from "vitest";
import type { SharingAudience } from "../supabase/database.types";
import { SHARING_NOTICE, sharingNoticeCopy, sharingNoticeHiddenKey, type SharingNoticeInput } from "./notice";

// Sharing defaults spec 2026-09-27 S4, S15, §7.5.

const AUDIENCES: SharingAudience[] = ["PUBLIC", "FRIENDS", "PRIVATE"];
const base: SharingNoticeInput = {
  cellarFlipped: true,
  notesShared: true,
  cellar: "PUBLIC",
  notes: "PUBLIC",
  dismissedAt: null,
};

describe("sharingNoticeCopy", () => {
  it("names both when both flags hold and both settings are still Everyone", () => {
    expect(sharingNoticeCopy(base)).toEqual({
      title: "Your cellar and tasting notes are now visible to everyone",
      body: "Other Blindr members can now see the bottles in your cellar and the notes you write. You choose who sees each one in your settings.",
      cta: "Change who can see them",
    });
  });

  it("names only the notes when the cellar was not flipped", () => {
    expect(sharingNoticeCopy({ ...base, cellarFlipped: false })).toEqual({
      title: "Your tasting notes are now visible to everyone",
      body: "Other Blindr members can now see the notes you write. You choose who sees them in your settings.",
      cta: "Change who can see them",
    });
  });

  it("names only the cellar when the person already changed the notes setting", () => {
    expect(sharingNoticeCopy({ ...base, notes: "FRIENDS" })).toEqual({
      title: "Your cellar is now visible to everyone",
      body: "Other Blindr members can now see the bottles in your cellar. You choose who sees it in your settings.",
      cta: "Change who can see it",
    });
  });

  it("is null once dismissed, whatever the flags and settings", () => {
    for (const cellar of AUDIENCES) {
      for (const notes of AUDIENCES) {
        expect(sharingNoticeCopy({ ...base, cellar, notes, dismissedAt: "2026-09-27T10:00:00Z" })).toBeNull();
      }
    }
  });

  it("is null when nothing it would say is still true", () => {
    expect(sharingNoticeCopy({ ...base, cellar: "FRIENDS", notes: "PRIVATE" })).toBeNull();
    expect(sharingNoticeCopy({ ...base, cellarFlipped: false, notes: "PRIVATE" })).toBeNull();
    expect(sharingNoticeCopy({ ...base, notesShared: false, cellar: "PRIVATE" })).toBeNull();
    expect(sharingNoticeCopy({ ...base, cellarFlipped: false, notesShared: false })).toBeNull();
  });

  it("never mentions a setting the row does not hold, over every flag x setting combination", () => {
    for (const cellarFlipped of [true, false]) {
      for (const notesShared of [true, false]) {
        for (const cellar of AUDIENCES) {
          for (const notes of AUDIENCES) {
            const copy = sharingNoticeCopy({ cellarFlipped, notesShared, cellar, notes, dismissedAt: null });
            const saysCellar = copy?.title.includes("cellar") ?? false;
            const saysNotes = copy?.title.includes("notes") ?? false;
            expect(saysCellar).toBe(cellarFlipped && cellar === "PUBLIC");
            expect(saysNotes).toBe(notesShared && notes === "PUBLIC");
          }
        }
      }
    }
  });
});

describe("SHARING_NOTICE", () => {
  it("carries the eyebrow, the dismiss label and the settings anchor", () => {
    expect(SHARING_NOTICE).toEqual({ eyebrow: "Sharing", dismiss: "Got it", href: "/profile/edit#sharing" });
  });
});

describe("sharingNoticeHiddenKey", () => {
  it("is per person, so another account in the same tab still sees its own notice", () => {
    expect(sharingNoticeHiddenKey("u1")).toBe("blindr:sharing-notice-hidden:u1");
    expect(sharingNoticeHiddenKey("u1")).not.toBe(sharingNoticeHiddenKey("u2"));
  });
});
