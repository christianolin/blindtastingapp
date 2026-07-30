import { requireContributor } from "@/lib/auth/roles";
import { AppHeader } from "@/components/app-header";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireContributor();
  return (
    <div className="flex flex-1 flex-col">
      <AppHeader />
      <div className="mx-auto w-full max-w-4xl flex-1 p-6">{children}</div>
    </div>
  );
}
