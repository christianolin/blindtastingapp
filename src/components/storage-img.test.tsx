import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StorageImg } from "./storage-img";
import { Avatar } from "./ui/avatar";
import { HatchThumb } from "./overview/hatch-thumb";

const SUPABASE = "https://abcxyz.supabase.co";
const PHOTO = `${SUPABASE}/storage/v1/object/public/wine-images/catalog/w1/a.jpg`;

let saved: string | undefined;
beforeEach(() => {
  saved = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE;
});
afterEach(() => {
  if (saved === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = saved;
});

const decode = (html: string) => html.replace(/&amp;/g, "&");

describe("StorageImg", () => {
  it("serves a Storage photo through the optimizer at 1x and 2x of the drawn width", () => {
    const html = decode(renderToStaticMarkup(<StorageImg src={PHOTO} renderWidth={30} className="x" />));
    const enc = encodeURIComponent(PHOTO);
    expect(html).toContain(`srcSet="/_next/image?url=${enc}&w=32&q=75 1x, /_next/image?url=${enc}&w=64&q=75 2x"`);
    expect(html).toContain(`src="/_next/image?url=${enc}&w=64&q=75"`);
    // Same element otherwise: the caller's classes, no width/height/style added.
    expect(html).toContain(`class="x"`);
    expect(html).not.toMatch(/ width=| height=| style=/);
  });

  it("passes a blob preview or a local file through untouched", () => {
    // (React 19 also emits a <link rel=preload> for an eager image, as before.)
    expect(renderToStaticMarkup(<StorageImg src="blob:https://app/1" renderWidth={30} />)).toContain(
      `<img src="blob:https://app/1" alt=""/>`,
    );
    expect(renderToStaticMarkup(<StorageImg src="/emoji/x.svg" renderWidth={30} />)).toContain(
      `<img src="/emoji/x.svg" alt=""/>`,
    );
  });
});

describe("callers size their photo to the box", () => {
  it("Avatar uses its size, or the caller's renderWidth", () => {
    expect(decode(renderToStaticMarkup(<Avatar src={PHOTO} size="sm" />))).toContain("&w=32&q=75 1x");
    expect(decode(renderToStaticMarkup(<Avatar src={PHOTO} size="lg" renderWidth={80} />))).toContain(
      "&w=96&q=75 1x",
    );
  });

  it("HatchThumb uses a numeric width, or renderWidth for a percentage box", () => {
    expect(decode(renderToStaticMarkup(<HatchThumb src={PHOTO} width={52} height={52} />))).toContain(
      "&w=64&q=75 1x",
    );
    const pct = decode(
      renderToStaticMarkup(<HatchThumb src={PHOTO} width="100%" height="100%" renderWidth={64} />),
    );
    expect(pct).toContain("&w=64&q=75 1x");
    expect(pct).toContain(`style="width:100%;height:100%"`);
  });
});
