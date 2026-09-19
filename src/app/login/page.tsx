import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wordmark } from "@/components/wordmark";
import { accountDeletedNotice } from "@/lib/account/delete-account";
import { isLinkFailed, sameSiteNext } from "@/lib/auth/login-copy";
import { LoginForm } from "./login-form";

// `?next=/j/<code>` (a share link opened signed out) is carried through the
// form so sign-in lands back on it; only a same-site path is carried (into
// the hidden field and the Sign up link), and the action re-validates it.
// `?error=auth_callback_failed` is where /auth/callback, /auth/confirm and
// the reset-mode set-password page send a link that no longer works.
// `?deleted=1` is where a self-service account deletion lands
// (account-deletion spec §5.3): one status line above the form.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string | string[];
    error?: string | string[];
    deleted?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const next = sameSiteNext(params.next);
  const error = params.error;
  const notice = accountDeletedNotice(params.deleted);
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
          <LoginForm next={next} linkFailed={isLinkFailed(error)} />
        </CardContent>
      </Card>
    </div>
  );
}
