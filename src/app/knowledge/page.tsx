import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen, Grape, Map as MapIcon, Scale, Wine } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { AppHeader } from "@/components/app-header";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Library · Knowledge · Blindr" };

const SECTIONS: {
  href: string;
  label: string;
  description: string;
  icon: typeof BookOpen;
}[] = [
  { href: "/knowledge/designations", label: "Designations", description: "Where, how and by what rules a wine is made — from broad regions to single vineyards.", icon: Scale },
  { href: "/knowledge/grapes", label: "Grapes", description: "The varieties behind every wine, with tasting-note profiles for the classics.", icon: Grape },
  { href: "/knowledge/archetypes", label: "Typical wines", description: "What a classic wine from each place looks, smells and tastes like.", icon: Wine },
  { href: "/rules", label: "Rules", description: "How blind and semi-blind tasting is scored in Blindr.", icon: BookOpen },
];

export default async function LibraryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader />
      <div className="flex w-full max-w-[1500px] flex-1 flex-col gap-6 p-6 sm:p-8">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            Library
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Everything to learn about wine — regions, grapes, styles and the
            rules of the game.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map((s) => (
            <Link key={s.href} href={s.href}>
              <Card className="h-full transition-colors hover:border-primary/40 hover:bg-muted/30">
                <CardContent className="flex flex-col gap-2 pt-6">
                  <s.icon className="size-6 text-primary" />
                  <h2 className="font-heading text-lg font-semibold">{s.label}</h2>
                  <p className="text-sm text-muted-foreground">{s.description}</p>
                </CardContent>
              </Card>
            </Link>
          ))}

          <Link href="/knowledge/map">
            <Card className="h-full border-primary/30 bg-primary/5 transition-colors hover:bg-primary/10">
              <CardContent className="flex flex-col gap-2 pt-6">
                <MapIcon className="size-6 text-primary" />
                <h2 className="font-heading text-lg font-semibold">
                  Explore the Wine Map
                </h2>
                <p className="text-sm text-muted-foreground">
                  The interactive atlas of the world&apos;s wine regions.
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}
