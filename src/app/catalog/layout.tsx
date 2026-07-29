import { AppHeader } from "@/components/app-header";

// Puts the persistent app nav above every /cellar route — the list, add-wine,
// wine detail, and the tasting-note editor. Without this the note editor
// rendered with no app chrome, so there was no way back to Cellar or the rest
// of the app; mirrors the /tastings layout.
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
