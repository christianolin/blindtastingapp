import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Globe,
  Grape,
  Home,
  Info,
  Landmark,
  Layers,
  Map as MapIcon,
  ScrollText,
  Sparkles,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { AppHeader } from "@/components/app-header";
import { createClient } from "@/lib/supabase/server";
import { listDesignationTopics } from "@/lib/designations/queries";
import {
  BLIND_TASTING_NOTE,
  OVERVIEW_INTRO,
  VARIATION_CARDS,
  VARIATION_INTRO,
  WHY_CARDS,
} from "@/lib/designations/content";

export const metadata = { title: "Designations · Library · Blindr" };

const WHY_ICONS = [Landmark, ScrollText, Layers, Sparkles];
const VARIATION_ICONS = [Globe, MapIcon, Home, Grape];

export default async function DesignationsOverviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { groups, glossary } = await listDesignationTopics(supabase);

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader />
      <div className="flex w-full max-w-[1500px] flex-1 flex-col gap-10 p-6 sm:p-8">
        <div>
          <nav className="mb-2 text-sm text-muted-foreground">
            <Link href="/knowledge" className="hover:text-foreground">Library</Link>
            <span className="px-1.5">›</span>
            <span className="text-foreground">Designations</span>
          </nav>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            Designations
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">{OVERVIEW_INTRO}</p>
        </div>

        <section className="flex flex-col gap-6">
          <h2 className="font-heading text-xl font-semibold">Browse designations</h2>
          {groups.map((group) => (
            <div key={group.group} className="flex flex-col gap-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-primary">
                {group.group}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.systems.map((s) => (
                  <Link key={s.key} href={`/knowledge/designations/${s.key}`}>
                    <Card className="h-full transition-colors hover:border-primary/40 hover:bg-muted/30">
                      <CardContent className="flex items-center justify-between gap-2 pt-6">
                        <span className="font-medium">{s.name}</span>
                        <span className="text-xs text-muted-foreground">{s.memberCount}</span>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          ))}

          {glossary.length > 0 ? (
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-primary">
                Glossary
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {glossary.map((c) => (
                  <Link
                    key={c.slug}
                    href={`/knowledge/designations/glossary/${c.slug}`}
                  >
                    <Card className="h-full transition-colors hover:border-primary/40 hover:bg-muted/30">
                      <CardContent className="flex items-center justify-between gap-2 pt-6">
                        <span className="font-medium">{c.category}</span>
                        <span className="text-xs text-muted-foreground">{c.count}</span>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="font-heading text-xl font-semibold">Why designations matter</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {WHY_CARDS.map((c, i) => {
              const Icon = WHY_ICONS[i];
              return (
                <div key={c.title} className="flex flex-col gap-2">
                  <Icon className="size-6 text-primary" />
                  <h3 className="font-medium">{c.title}</h3>
                  <p className="text-sm text-muted-foreground">{c.body}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="font-heading text-xl font-semibold">Variation in wine</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">{VARIATION_INTRO}</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {VARIATION_CARDS.map((c, i) => {
              const Icon = VARIATION_ICONS[i];
              return (
                <div key={c.title} className="flex flex-col gap-2">
                  <Icon className="size-6 text-primary" />
                  <h3 className="font-medium">{c.title}</h3>
                  <p className="text-sm text-muted-foreground">{c.body}</p>
                </div>
              );
            })}
          </div>
        </section>

        <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4">
          <Info className="mt-0.5 size-5 shrink-0 text-primary" />
          <p className="text-sm text-muted-foreground">{BLIND_TASTING_NOTE}</p>
        </div>

      </div>
    </div>
  );
}
