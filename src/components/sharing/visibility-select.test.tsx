import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VisibilitySelect } from "./visibility-select";

// The first paint of the one sharing control (sharing-defaults spec
// 2026-09-27 S6, S18, §7.6). renderToStaticMarkup runs in node: no DOM, no
// Supabase call (the client is only created on change).

const HELP = "Applies to every note you write.";

describe("VisibilitySelect", () => {
  it("lists Everyone, Friends, Only me in that order, with the stored value selected", () => {
    const html = renderToStaticMarkup(
      <VisibilitySelect userId="u1" column="notes_visibility" current="FRIENDS" label="Who can see your tasting notes" />,
    );
    const options = [...html.matchAll(/<option value="([A-Z]+)"( selected="")?>([^<]+)<\/option>/g)].map((m) => [
      m[1],
      Boolean(m[2]),
      m[3],
    ]);
    expect(options).toEqual([
      ["PUBLIC", false, "Everyone"],
      ["FRIENDS", true, "Friends"],
      ["PRIVATE", false, "Only me"],
    ]);
  });

  it("labels the select and describes it by its help line, then its status line (field)", () => {
    const html = renderToStaticMarkup(
      <VisibilitySelect userId="u1" column="notes_visibility" current="PUBLIC" label="Who can see your tasting notes" help={HELP} />,
    );
    const selectId = /<select id="([^"]+)"/.exec(html)?.[1];
    const [helpId, statusId] = /aria-describedby="([^"]+)"/.exec(html)?.[1].split(" ") ?? [];
    expect(selectId).toBeTruthy();
    expect(html).toContain(`<label for="${selectId}" class="text-sm font-medium">Who can see your tasting notes</label>`);
    expect(html).toContain(`<p id="${helpId}" class="text-xs leading-relaxed text-muted-foreground">${HELP}</p>`);
    expect(html).toContain(`<span id="${statusId}" role="status"`);
  });

  it("is a 44px tap target on touch at every width, described by its status line alone (inline)", () => {
    const html = renderToStaticMarkup(
      <VisibilitySelect userId="u1" column="cellar_visibility" current="PUBLIC" label="Visible to" variant="inline" />,
    );
    expect(html).toMatch(/<select[^>]*class="[^"]*\bmin-h-11\b/);
    expect(html).toContain(">Visible to</label>");
    const statusId = /aria-describedby="([^"]+)"/.exec(html)?.[1];
    expect(statusId).toBeTruthy();
    expect(statusId).not.toContain(" ");
    expect(html).toContain(`<span id="${statusId}" role="status"`);
  });

  it("stays enabled while it saves, saying aria-busy instead (disabling it would drop keyboard focus)", () => {
    const html = renderToStaticMarkup(
      <VisibilitySelect userId="u1" column="notes_visibility" current="PUBLIC" label="Who can see your tasting notes" />,
    );
    const select = /<select[^>]*>/.exec(html)?.[0] ?? "";
    expect(select).toContain('aria-busy="false"');
    expect(select).not.toContain("disabled");
  });

  it("keeps an empty, visually hidden live region on first paint, so a later failure is announced", () => {
    const html = renderToStaticMarkup(
      <VisibilitySelect userId="u1" column="cellar_visibility" current="PRIVATE" label="Who can see your cellar" help="h" />,
    );
    expect(html).not.toContain("Not saved");
    expect(html).toMatch(/<span id="[^"]+" role="status" class="text-xs text-destructive sr-only"><\/span>/);
  });
});
