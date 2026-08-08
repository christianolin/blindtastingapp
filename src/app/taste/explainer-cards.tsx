// "Explore Blindr": compact cards naming the product areas. Deliberately NOT
// links — the sidebar is the navigation, and "Explore tasting" on the tasting
// page itself was a button to nowhere. These just say what each area is.
const AREAS = [
  { title: "Taste", body: "Structured notes, ratings and blind tastings." },
  { title: "Learn", body: "Regions, grapes, styles and classifications." },
  { title: "Cellar", body: "Your bottles, tasting history and collection." },
  { title: "Community", body: "Taste and share with other wine enthusiasts." },
] as const;

export function ExplainerCards() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-2xl font-medium">Explore Blindr</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {AREAS.map((a) => (
          <div
            key={a.title}
            className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4"
          >
            <span className="font-heading text-lg font-medium">{a.title}</span>
            <span className="text-sm text-muted-foreground">{a.body}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
