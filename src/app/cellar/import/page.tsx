import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { ImportForm } from "./import-form";

export default async function ImportCellarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-6">
      <Link
        href="/cellar"
        className="text-sm text-muted-foreground underline underline-offset-4"
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
