import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wordmark } from "@/components/wordmark";
import { query } from "@/lib/auth/db";
import { sha256 } from "@/lib/auth/session";
import { SetPasswordForm } from "./set-password-form";

// Invite landing page. The token arrives in the query string; we look it up
// read-only here purely to greet them by name and to fail early on a dead link.
// It is NOT consumed until the form is submitted — rendering a page must never
// spend a single-use token, or a link preview would burn the invite.
export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  const rows = token
    ? await query<{ email: string; display_name: string }>(
        `select t.email, p.display_name
           from auth_tokens t
           join profiles p on p.id = t.user_id
          where t.purpose = 'INVITE'
            and t.token_hash = $1
            and t.consumed_at is null
            and t.expires_at > now()`,
        [sha256(token)],
      )
    : [];

  const invite = rows[0];

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-4">
      <Wordmark />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            {invite ? "Welcome — set up your account" : "This link has expired"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {invite ? (
            <SetPasswordForm
              token={token ?? ""}
              suggestedName={
                invite.display_name || invite.email.split("@")[0] || ""
              }
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Invite links last a week and can only be used once. Ask your host
              to send a new one.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
