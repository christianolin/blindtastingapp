import Link from "next/link";

export const metadata = { title: "Admin · Blindr" };

export default function AdminHome() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Admin
        </h1>
        <p className="mt-2 text-muted-foreground">Curator tools.</p>
      </div>
      <Link
        href="/admin/archetypes"
        className="rounded-lg border border-border p-4 transition-colors hover:bg-muted"
      >
        <div className="font-medium">Typical-wine placements</div>
        <p className="text-sm text-muted-foreground">
          Choose which typical wines appear on which regions, subregions and
          appellations in the map hierarchy.
        </p>
      </Link>
    </div>
  );
}
