import { AppHeader } from "@/components/app-header";

// Persistent app nav above every /cellar route (the list, add-lot, edit-lot).
// Mirrors the /catalog and /tastings layouts so the pages never render without
// app chrome.
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
