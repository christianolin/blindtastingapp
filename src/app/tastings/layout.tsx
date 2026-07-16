import { AppHeader } from "@/components/app-header";

// Puts the persistent app nav above every /tastings route (create form,
// lobby, wine entry, play, results). The [id] layout nested below adds the
// leaderboard column; this one only owns the header.
export default function TastingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <AppHeader />
      {children}
    </div>
  );
}
