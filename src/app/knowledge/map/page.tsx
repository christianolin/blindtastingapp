import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { createClient } from "@/lib/supabase/server";
import { TileWineMapExplorer } from "./tile-wine-map-explorer";

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
