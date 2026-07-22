import Link from "next/link";
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
      <div className="mx-auto flex w-full max-w-[1500px] flex-1 flex-col gap-6 p-6 sm:p-8">
        <div>
          <Link
            href="/knowledge"
            className="text-sm text-muted-foreground underline underline-offset-4"
          >
            ← Knowledge
          </Link>
          <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">
            Wine Map
          </h1>
          <p className="mt-2 text-muted-foreground">
            Click through from country to region to appellation.
          </p>
        </div>

        <TileWineMapExplorer initialPlaceKey={place ?? null} />
      </div>
    </div>
  );
}
