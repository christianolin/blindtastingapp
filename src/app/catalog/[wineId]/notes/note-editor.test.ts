import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// A-07 (v3-groups.json group 5): before this fix, note-editor.tsx built
// `const sheetWine = { colour: wine.colour ?? "RED", style: wine.style ?? "STILL" }`
// and handed THAT — not the real, possibly-null `wine` prop — to WsetSheet.
// A hidden-glass note's genuinely unknown colour was silently coerced to
// "RED" before it ever reached AromaPicker/WineColourControl, hiding every
// white-fruit aroma group (spec 9.3 item 2). `aromaVisibleFor` (vocab.ts)
// was never the bug — it already handled a null colour correctly and is
// unchanged by this fix (see vocab.test.ts, which pins that pure function's
// behaviour but not this regression). This test pins the actual regression
// site — the RED/STILL coercion at the note-editor/WsetSheet boundary — by
// inspecting the real source, since this codebase has no
// @testing-library/react to render NoteEditor/WsetSheet directly (same
// source-inspection approach as incomplete.test.ts's SQL-field-name test).
describe("note-editor -> WsetSheet wine prop (A-07 regression)", () => {
  const noteEditorSrc = readFileSync(
    path.join(process.cwd(), "src/app/catalog/[wineId]/notes/note-editor.tsx"),
    "utf8",
  );
  const wsetSheetSrc = readFileSync(
    path.join(process.cwd(), "src/components/wset/wset-sheet.tsx"),
    "utf8",
  );

  it("passes the real wine prop straight through to WsetSheet, with no RED/STILL fallback", () => {
    expect(noteEditorSrc).toMatch(/<WsetSheet[\s\S]*?\bwine=\{wine\}/);
    expect(noteEditorSrc).not.toMatch(/\?\?\s*["']RED["']/);
    expect(noteEditorSrc).not.toMatch(/\?\?\s*["']STILL["']/);
    // The old coerced variable this bug hinged on must be gone entirely, not
    // just unused (a leftover unread `sheetWine` would mean the fix landed
    // by accident, not by design).
    expect(noteEditorSrc).not.toContain("sheetWine");
  });

  it("WsetSheet's wine prop type accepts the hidden-glass null case, not only concrete colour/style", () => {
    expect(wsetSheetSrc).toMatch(
      /wine:\s*\{\s*colour:\s*WineColour\s*\|\s*null;\s*style:\s*WineStyle\s*\|\s*null\s*\}/,
    );
  });
});
