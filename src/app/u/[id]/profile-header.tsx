import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

/**
 * `/u/[id]`'s header (spec §2.2, D1): avatar, name in the heading serif, a
 * meta line, the bio, and the actions row. A server component — the page
 * builds `actions` itself, since those are the only client pieces (Cellar/
 * FriendButton or Edit profile/InvitePeopleButton).
 */
export function ProfileHeader({
  name,
  avatarUrl,
  isOwn,
  meta,
  bio,
  actions,
}: {
  name: string;
  avatarUrl: string | null;
  isOwn: boolean;
  meta: string;
  bio: string | null;
  actions: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start gap-x-4 gap-y-3">
      <Avatar
        src={avatarUrl}
        name={name}
        size="lg"
        className="size-20 text-3xl max-md:size-16 max-md:text-2xl"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h1 className="font-heading text-3xl font-semibold tracking-tight break-words">
            {name}
          </h1>
          {isOwn ? <Badge variant="secondary">You</Badge> : null}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{meta}</p>
        {bio ? <p className="mt-2 max-w-prose text-sm break-words">{bio}</p> : null}
      </div>
      <div className="flex flex-wrap items-start gap-2 max-md:w-full md:justify-end">
        {actions}
      </div>
    </header>
  );
}
