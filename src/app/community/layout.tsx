import { AppHeader } from "@/components/app-header";

// Puts the persistent app nav above every /community route, and above
// loading.tsx too (R8) — mirrors catalog/layout.tsx and cellar/layout.tsx.
export default function CommunityLayout({
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
