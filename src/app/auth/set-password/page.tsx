import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Wordmark } from "@/components/wordmark";
import {
  passwordCopy,
  passwordMode,
  passwordNext,
  setupNameSuggestion,
  signedOutRedirect,
} from "@/lib/auth/password-copy";
import { createClient } from "@/lib/supabase/server";
import { SetPasswordForm } from "./set-password-form";

// Two ways in (src/lib/auth/password-copy.ts):
// - setup: an account an email invite signed in straight from the link, sent
//   here by the session middleware until it has chosen a password;
// - reset (`?reason=reset`): the "Forgot password?" email, once
//   /auth/confirm has turned its token into a session.
// `?next=` is where to go afterwards; the action re-checks it.
export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; reason?: string | string[] }>;
}) {
  const params = await searchParams;
  const mode = passwordMode(params.reason);
  const next = passwordNext(params.next);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(signedOutRedirect(mode));
  }

  // Setup mode's pre-fill (spec D3): the name the inviter typed, else a
  // readable version of the email's local part. Only a suggestion.
  const suggestedName = setupNameSuggestion(user.user_metadata?.display_name, user.email);
  const copy = passwordCopy(mode);

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-4">
      <Wordmark />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{copy.title}</CardTitle>
          <CardDescription>{copy.lead}</CardDescription>
        </CardHeader>
        <CardContent>
          <SetPasswordForm
            mode={mode}
            next={next}
            email={user.email ?? ""}
            suggestedName={suggestedName}
          />
        </CardContent>
      </Card>
    </div>
  );
}
