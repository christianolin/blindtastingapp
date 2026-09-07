import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { createClient } from "@/lib/supabase/server";
import { WINE_MAP_MANIFEST_URL } from "@/lib/wine-map/manifest";
import { TileWineMapExplorer } from "./tile-wine-map-explorer";

// The map's first paint waits on two cross-origin fetches it cannot start until
// the bundle has parsed: the basemap style and the tile manifest. Warming the
// connections here gets DNS + TLS out of the way in parallel with the JS, which
// is pure latency saved on a cold visit. Derived from the manifest URL so it
// cannot drift from wherever the tiles actually live.
const TILE_ORIGIN = new URL(WINE_MAP_MANIFEST_URL).origin;
const BASEMAP_ORIGIN = "https://basemaps.cartocdn.com";

export const metadata = {
  title: "Wine Map · Knowledge · Blindr",
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
    <div className="flex flex-1 flex-col">
      {/* Next hoists these into <head>. crossOrigin matters: the tile and
          basemap fetches are CORS requests, and a preconnect opened without it
          warms the wrong connection and is silently wasted. */}
      <link rel="preconnect" href={TILE_ORIGIN} crossOrigin="anonymous" />
      <link rel="preconnect" href={BASEMAP_ORIGIN} crossOrigin="anonymous" />
      <link rel="dns-prefetch" href={TILE_ORIGIN} />
      <AppHeader />
      <div className="flex w-full flex-1 flex-col gap-6 p-6 sm:p-8">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            Knowledge Explorer
          </h1>
          <p className="mt-2 text-muted-foreground">
            Explore the world of wine through places, grapes, styles and the
            rules that shape them.
          </p>
        </div>

        <TileWineMapExplorer initialPlaceKey={place ?? null} />
      </div>
    </div>
  );
}
