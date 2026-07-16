import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BlindrLockup } from "@/components/logo";
import { LinkLoadingHint } from "@/components/link-loading-hint";
import { signOut } from "@/app/actions";

export function AppHeader({
  userId,
  displayName,
  avatarUrl,
}: {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
}) {
  return (
    <header className="flex items-center justify-between border-b border-border px-6 py-3">
      <Link href="/dashboard" className="flex items-center">
        <BlindrLockup size={30} gap={8} />
      </Link>
      <nav className="flex items-center gap-4 text-sm">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 hover:underline"
        >
          Tastings
          <LinkLoadingHint />
        </Link>
        <Link
          href="/people"
          className="inline-flex items-center gap-1 hover:underline"
        >
          People
          <LinkLoadingHint />
        </Link>
        <Link
          href="/friends"
          className="inline-flex items-center gap-1 hover:underline"
        >
          Friends
          <LinkLoadingHint />
        </Link>
        <Link
          href={`/u/${userId}`}
          className="flex items-center gap-2 hover:underline"
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              className="size-6 rounded-full object-cover ring-1 ring-border"
            />
          ) : (
            <span className="flex size-6 items-center justify-center rounded-full bg-secondary text-xs">
              {displayName.slice(0, 1).toUpperCase()}
            </span>
          )}
          {displayName}
        </Link>
        <form action={signOut}>
          <Button variant="outline" size="sm" type="submit">
            Sign out
          </Button>
        </form>
      </nav>
    </header>
  );
}
