import { AppHeader } from "@/components/app-header";

// Puts the persistent app nav above every /cellar route (catalog, add-wine,
// wine detail, and the WSET note editor). Without it the note editor rendered
// chrome-less, leaving no way back into the app; now the menu is always there
// and "Cellar" is one tap away. The note sheet's own sticky save-bar is offset
// to sit just below this header (see wset-sheet.tsx).
export default function CellarLayout({
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
