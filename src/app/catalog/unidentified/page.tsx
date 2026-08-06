import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { ResolveRow } from "./resolve-row";

type Rel = { name: string } | { name: string }[] | null;
function rel(r: Rel): string | null {
  if (!r) return null;
  const row = Array.isArray(r) ? r[0] : r;
  return row?.name ?? null;
}

export default async function UnidentifiedQueuePage() {
  const supabase = await createClient();
  const user = await requireUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_curator")
    .eq("id", user.id)
    .maybeSingle();

  const { data: rows } = await supabase
    .from("catalog_wines_unidentified")
    .select(
      "id, wine_name, colour, style, vintage_kind, vintage_year, vintage_tawny_years, reason, " +
        "country:countries(name), region:regions(name), appellation:appellations(name), producer:producers(name)",
    )
    .is("resolved_into_catalog_wine_id", null)
    .order("created_at", { ascending: false })
    .limit(200);

  const wines = ((rows ?? []) as unknown as Array<Record<string, unknown>>).map((w) => {
    const vk = w.vintage_kind as string | null;
    const vintage =
      vk === "YEAR" ? String(w.vintage_year ?? "")
      : vk === "NV" ? "NV"
      : w.vintage_tawny_years ? `${w.vintage_tawny_years}yo` : "";
    return {
      id: w.id as string,
      wineName: (w.wine_name as string | null) ?? null,
      colour: (w.colour as string | null) ?? null,
      vintage,
      country: rel(w.country as Rel),
      region: rel(w.region as Rel),
      appellation: rel(w.appellation as Rel),
      producer: rel(w.producer as Rel),
    };
  });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Unidentified bottles</h1>
        <p className="text-sm text-muted-foreground">
          Bottles added without a real catalog identity. Resolve each into the wine it
          actually is — its tasting answers and notes then point at the real wine.
        </p>
      </div>
      {!profile?.is_curator ? (
        <p className="text-sm text-muted-foreground">
          Only curators can resolve unidentified bottles.
        </p>
      ) : wines.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing to resolve — every bottle is identified.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {wines.map((w) => (
            <li key={w.id} className="rounded-lg border border-border p-4">
              <p className="font-medium">
                {[w.producer, w.wineName, w.appellation, w.vintage].filter(Boolean).join(" ") ||
                  "Unknown bottle"}
              </p>
              <p className="mb-3 text-xs text-muted-foreground">
                {[w.country, w.region].filter(Boolean).join(" · ")}
                {w.colour ? ` — ${w.colour[0] + w.colour.slice(1).toLowerCase()}` : ""}
              </p>
              <ResolveRow unidentifiedId={w.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
