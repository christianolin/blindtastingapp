import { Wordmark } from "@/components/wordmark";
import { createClient } from "@/lib/supabase/server";
import { InviteLanding } from "./invite-landing";
import { inviteView } from "./invite-route";

// /invite/<code> — the personal invite link's landing page (spec §1, §5;
// D1, D9, D19). Signed out or in, this is the FIRST call this feature makes
// for the code: `get_platform_invite_preview` (anon-callable, SECURITY
// DEFINER) returns only a validity state and the inviter's directory-public
// name/avatar — never the invitee's own name or address, never a count of
// how many times the link has been used (D9).
// A missing row is `"unknown"`; `inviteView` (the pure router beside this
// file) then names one of the six views D19 lists, and `InviteLanding`
// renders it. No other table or column is read here.
export default async function InviteLandingPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: rows } = await supabase.rpc("get_platform_invite_preview", {
    p_code: code,
  });
  const preview = rows?.[0] ?? null;

  const view = inviteView({
    state: preview?.state ?? "unknown",
    signedIn: !!user,
    isInviter: !!user && preview?.inviter_id === user.id,
  });

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-4">
      <Wordmark />
      <InviteLanding
        code={code}
        view={view}
        inviterName={preview?.inviter_name ?? null}
        inviterAvatarUrl={preview?.inviter_avatar_url ?? null}
      />
    </div>
  );
}
