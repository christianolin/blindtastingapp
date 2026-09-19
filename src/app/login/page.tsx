import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wordmark } from "@/components/wordmark";
import { accountDeletedNotice } from "@/lib/account/delete-account";
import { LoginForm } from "./login-form";

// `?next=/j/<code>` (a share link opened signed out) is carried through the
// form so sign-in lands back on it; the action re-validates the path.
// `?deleted=1` is where a self-service account deletion lands
// (account-deletion spec §5.3): one status line above the form.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; deleted?: string | string[] }>;
}) {
  const { next, deleted } = await searchParams;
  const notice = accountDeletedNotice(deleted);
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-4">
      <Wordmark />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {notice ? (
            <p role="status" className="rounded-lg border bg-muted/50 px-3 py-2 text-sm">
              {notice}
            </p>
          ) : null}
          <LoginForm next={next ?? null} />
        </CardContent>
      </Card>
    </div>
  );
}
