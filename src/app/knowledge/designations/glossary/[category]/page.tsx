import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getGlossaryCategory } from "@/lib/designations/queries";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  return { title: `${category} · Designations · Blindr` };
}

export default async function GlossaryCategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const data = await getGlossaryCategory(supabase, category);
  if (!data) notFound();

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader />
      <div className="flex w-full max-w-[1500px] flex-1 flex-col gap-6 p-6 sm:p-8">
        <div>
          <nav className="mb-2 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            <Link href="/knowledge" className="hover:text-foreground">Library</Link>
            <span>›</span>
            <Link href="/knowledge/designations" className="hover:text-foreground">
              Designations
            </Link>
            <span>›</span>
            <span className="text-foreground">{data.category}</span>
          </nav>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            {data.category}
          </h1>
        </div>

        <div className="flex flex-col gap-3">
          {data.terms.map((t) => (
            <Card key={t.id}>
              <CardContent className="flex flex-col gap-1 pt-6">
                <h2 className="font-heading text-lg font-semibold">{t.name}</h2>
                {t.description ? (
                  <p className="text-sm text-muted-foreground">{t.description}</p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
