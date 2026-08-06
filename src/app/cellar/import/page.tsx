import { requireUser } from "@/lib/auth/dal";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImportForm } from "./import-form";

export default async function ImportCellarPage() {
  await requireUser();

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-6">
      <Link
        href="/cellar"
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        ← Back to cellar
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>Import from CellarTracker</CardTitle>
        </CardHeader>
        <CardContent>
          <ImportForm />
        </CardContent>
      </Card>
    </div>
  );
}
