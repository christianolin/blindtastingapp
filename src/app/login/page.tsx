import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wordmark } from "@/components/wordmark";
import { isLinkFailed, sameSiteNext } from "@/lib/auth/login-copy";
import { LoginForm } from "./login-form";

// `?next=/j/<code>` (a share link opened signed out) is carried through the
// form so sign-in lands back on it; only a same-site path is carried (into
// the hidden field and the Sign up link), and the action re-validates it.
// `?error=auth_callback_failed` is where /auth/callback, /auth/confirm and
// the reset-mode set-password page send a link that no longer works.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; error?: string | string[] }>;
}) {
  const params = await searchParams;
  const next = sameSiteNext(params.next);
  const error = params.error;
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-4">
      <Wordmark />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
        </CardHeader>
        <CardContent>
          <LoginForm next={next} linkFailed={isLinkFailed(error)} />
        </CardContent>
      </Card>
    </div>
  );
}
