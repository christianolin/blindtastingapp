import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { createClient } from "@/lib/supabase/server";
import { getDesignationsPageData } from "@/lib/designations/page-data";
import { DesignationsTabs } from "./designations-tabs";

export const metadata = { title: "Designations · Library · Blindr" };

export default async function DesignationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const data = await getDesignationsPageData(supabase);

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader />
      <div className="flex w-full max-w-[1500px] flex-1 flex-col gap-6 p-6 sm:p-8">
        <div>
          <nav className="mb-2 text-sm text-muted-foreground">
            <Link href="/knowledge" className="hover:text-foreground">
              Library
            </Link>
            <span className="px-1.5">›</span>
            <span className="text-foreground">Designations</span>
          </nav>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            Designations
          </h1>
        </div>
        <DesignationsTabs data={data} initialTab={tab ?? "overview"} />
      </div>
    </div>
  );
}
