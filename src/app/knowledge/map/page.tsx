import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { createClient } from "@/lib/supabase/server";
import { BASEMAP_ORIGIN, BASEMAP_STYLE_URL } from "@/lib/wine-map/basemap";
import { WINE_MAP_MANIFEST_URL, WINE_MAP_TILES_ORIGIN } from "@/lib/wine-map/manifest";
import { TileWineMapExplorer } from "./tile-wine-map-explorer";

// The map's first paint waits on two cross-origin fetches it cannot start until
// the bundle has parsed: the basemap style and the tile manifest. Warming the
// connections here gets DNS + TLS out of the way in parallel with the JS, which
// is pure latency saved on a cold visit. The tiles' origin comes from the live
// manifest's URL (manifest.ts), so it cannot drift from wherever the archives
// actually live, even when a local build loads a draft manifest from its own
// origin; BASEMAP_ORIGIN is where both basemap styles (light Positron, dark
// Dark Matter) are served from.
const TILE_ORIGIN = WINE_MAP_TILES_ORIGIN;

export const metadata = {
  title: "Wine map · Blindr",
};

export default async function WineMapPage({
  searchParams,
}: {
  searchParams: Promise<{ place?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { place } = await searchParams;

  return (
    // Phones, and md+ windows at least 30rem tall (map-lock): exactly
    // AppShell's column tall, never taller (see <main>).
    <div className="flex flex-1 flex-col max-md:min-h-0 max-md:overflow-hidden map-lock:min-h-0 map-lock:overflow-hidden">
      {/* Next hoists these into <head>. crossOrigin matters: the tile and
          basemap fetches are CORS requests, and a preconnect opened without it
          warms the wrong connection and is silently wasted. */}
      <link rel="preconnect" href={TILE_ORIGIN} crossOrigin="anonymous" />
      <link rel="preconnect" href={BASEMAP_ORIGIN} crossOrigin="anonymous" />
      <link rel="dns-prefetch" href={TILE_ORIGIN} />
      {/* Preconnect only warms the socket. These two JSON fetches are the
          map's critical path and cannot start until the bundle has parsed:
          measured on production with a warm cache, FCP 1236ms, manifest
          1270ms, basemap style 1645ms, first tile byte 1808ms. Preloading
          lets the browser fetch both alongside the JS, so MapLibre finds
          them cached the moment it asks. as="fetch" + anonymous CORS is
          what both requests actually use; a mismatch would fetch twice.
          Light is the default theme — dark is only reached by an explicit
          pick, which fetches (and caches) it then. */}
      <link rel="preload" as="fetch" href={WINE_MAP_MANIFEST_URL} crossOrigin="anonymous" />
      <link rel="preload" as="fetch" href={BASEMAP_STYLE_URL.light} crossOrigin="anonymous" />
      {/* "Wine map" names the page next to the burger on phones; from md the
          bar carries the page's h1 instead (spec 2026-09-27 M3), since the
          locked screen has no room for an in-page heading. */}
      <AppHeader title="Wine map" heading="Wine map" />
      {/* One fixed screen (spec 2026-09-25 D1, D3 on phones; spec 2026-09-27
          M1, M2 from md). <main> is exactly what is left under the header,
          and under the active-tasting strip when there is one, and it never
          scrolls, so a drag on the map is always the map's. The height is a
          flex chain, not a calc: AppShell's column is h-dvh, and this page's
          root and <main> are flex-1 min-h-0 inside it, so a strip that
          appears simply takes its share (a calc(100dvh - header) would
          overflow by the strip). AppShell itself is untouched: this page just
          never overflows its column.
          - Phones (below md): the max-md: utilities, unchanged.
          - md+ and at least 30rem tall (map-lock:): the same chain, with a
            16 px page padding.
          - md+ and shorter (map-scroll:, e.g. a landscape phone): the
            explorer's row takes a fixed 420 px and the column scrolls by the
            difference, so a tiny window still gets a usable map. */}
      <main
        data-map-page=""
        className="flex w-full flex-1 flex-col max-md:min-h-0 max-md:overflow-hidden md:p-4 map-lock:min-h-0 map-lock:overflow-hidden"
      >
        {/* The heading moved into the top bar; its line stays for screen
            readers from md, where that h1 is (phones never exposed either). */}
        <p className="sr-only max-md:hidden">
          Explore the world of wine through places, grapes, styles and the
          rules that shape them.
        </p>
        <TileWineMapExplorer initialPlaceKey={place ?? null} />
      </main>
    </div>
  );
}
