import Link from "next/link";
import { redirect } from "next/navigation";
import { Map, GraduationCap, Grape } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppHeader } from "@/components/app-header";
import { LinkLoadingHint } from "@/components/link-loading-hint";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Knowledge · Blindr",
};

const SECTIONS = [
  {
    href: "/knowledge/map",
    icon: Map,
    title: "Wine Map",
    description:
      "Explore wine regions and appellations — click through from country to region to appellation for a description, climate, grapes, styles, and key facts.",
  },
  {
    href: "/knowledge/type-designations",
    icon: GraduationCap,
    title: "Type Designations",
    description:
      "What terms like Kabinett, Grand Cru, Riserva, and Tawny actually mean, grouped by category.",
  },
  {
    href: "/knowledge/grapes",
    icon: Grape,
    title: "Grape Library",
    description:
      "Aromas, acidity, tannin, body, alcohol, and where each grape variety is typically grown.",
  },
];

// A reference library, deliberately separate from the tasting/scoring flows
// — nothing here is scored or tied to a tasting. Requires login only for
// consistency with the rest of the app (its data isn't tasting-specific).
export default async function KnowledgePage() {
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
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6 sm:p-8">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            Knowledge
          </h1>
          <p className="mt-2 text-muted-foreground">
            A wine reference library — browse at your own pace, separate from
            any tasting.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {SECTIONS.map((s) => (
            <Link key={s.href} href={s.href}>
              <Card className="group transition-all hover:-translate-y-0.5 hover:shadow-md">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-lg">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <s.icon className="size-5" strokeWidth={2} />
                    </span>
                    <span className="flex-1 font-heading group-hover:text-primary">
                      {s.title}
                    </span>
                    <LinkLoadingHint />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {s.description}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
