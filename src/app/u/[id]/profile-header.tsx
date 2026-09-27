import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { LevelRing } from "@/components/levels/level-ring";
import { LiveLevelRing } from "@/components/levels/live-level-ring";
import type { OwnLevel } from "@/lib/levels/types";

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
  favourites,
  actions,
  level,
  liveUserId,
}: {
  name: string;
  avatarUrl: string | null;
  isOwn: boolean;
  meta: string;
  bio: string | null;
  /** Favourite regions and producers as chips (renders nothing when empty). */
  favourites?: ReactNode;
  actions: ReactNode;
  /** The person's level (levels spec §8.2): a ring round the avatar. Null or
      absent: the plain avatar, as before. */
  level?: OwnLevel | null;
  /** Your own profile: the ring follows the store live (LiveLevelRing). */
  liveUserId?: string;
}) {
  return (
    <header className="flex flex-wrap items-start gap-x-4 gap-y-3">
      {level ? (
        // 90 px around an 80 px avatar from md, 74 around 64 on phones; one
        // is display:none, so assistive technology meets one labelled ring.
        <>
          <ProfileRing level={level} liveUserId={liveUserId} size={90} className="mt-2 max-md:hidden">
            <Avatar src={avatarUrl} name={name} size="lg" className="size-20 text-3xl" />
          </ProfileRing>
          <ProfileRing level={level} liveUserId={liveUserId} size={74} className="mt-2 md:hidden">
            <Avatar src={avatarUrl} name={name} size="lg" className="size-16 text-2xl" />
          </ProfileRing>
        </>
      ) : (
        <Avatar
          src={avatarUrl}
          name={name}
          size="lg"
          className="size-20 text-3xl max-md:size-16 max-md:text-2xl"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h1 className="font-heading text-3xl font-semibold tracking-tight break-words">
            {name}
          </h1>
          {isOwn ? <Badge variant="secondary">You</Badge> : null}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{meta}</p>
        {bio ? <p className="mt-2 max-w-prose text-sm break-words">{bio}</p> : null}
        {favourites}
      </div>
      <div className="flex flex-wrap items-start gap-2 max-md:w-full md:justify-end">
        {actions}
      </div>
    </header>
  );
}

/** The /u/[id] ring: labelled, on the page surface; live on your own profile. */
function ProfileRing({
  level,
  liveUserId,
  size,
  className,
  children,
}: {
  level: OwnLevel;
  liveUserId?: string;
  size: number;
  className?: string;
  children: ReactNode;
}) {
  return liveUserId ? (
    <LiveLevelRing userId={liveUserId} initial={level} size={size} tone="surface" labelled className={className}>
      {children}
    </LiveLevelRing>
  ) : (
    <LevelRing level={level.level} xp={level.xp} size={size} tone="surface" labelled className={className}>
      {children}
    </LevelRing>
  );
}
