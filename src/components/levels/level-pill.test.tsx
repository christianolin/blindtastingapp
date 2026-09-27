import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LevelPill } from "./level-pill";

describe("LevelPill", () => {
  it("reads 'Lv N' and says 'Level N' to assistive technology", () => {
    const html = renderToStaticMarkup(<LevelPill level={7} />);
    expect(html).toContain('<span aria-hidden="true">Lv 7</span>');
    expect(html).toContain('<span class="sr-only">Level 7</span>');
  });
});
