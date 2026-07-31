"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wine, BookOpen, Boxes, GraduationCap, Users, Shield, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { navWithAdmin, isNavActive } from "@/components/nav-links";
import { useAddWine } from "@/components/add-wine-context";
import { signOut } from "@/app/actions";

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  taste: Wine,
  catalog: BookOpen,
  cellar: Boxes,
  learn: GraduationCap,
  community: Users,
  admin: Shield,
};

// The persistent left navigation (desktop only — below lg the MobileNav drawer
// in the top bar takes over). Five pillars with their real sub-pages, active-
// highlighted from the URL, and the signed-in user pinned at the bottom.
export function AppSidebar({
  isManager,
  user,
}: {
  isManager: boolean;
  user: { id: string; name: string; avatarUrl: string | null };
}) {
  const pathname = usePathname();
  const links = navWithAdmin(isManager);
  const { openAddWine } = useAddWine();

  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-primary text-primary-foreground md:flex">
      <div className="px-5 pt-4 pb-2">
        <Link href="/taste" className="flex items-center transition-opacity hover:opacity-90">
          <span className="font-heading text-xl font-semibold tracking-tight">Blindr</span>
        </Link>
      </div>

      <nav className="no-scrollbar flex-1 overflow-y-auto px-3 py-2">
        {links.map((link) => {
          const Icon = ICONS[link.key] ?? Wine;
          const sectionActive = isNavActive(pathname, link);
          return (
            <div key={link.key} className="mb-1">
              <Link
                href={link.href}
                aria-current={sectionActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  sectionActive
                    ? "bg-primary-foreground/15 text-primary-foreground"
                    : "text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-primary-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" />
                {link.label}
              </Link>
              {link.children ? (
                <div className="mt-0.5 mb-1 ml-[1.35rem] flex flex-col border-l border-primary-foreground/15 pl-3">
                  {link.children.map((child) => {
                    const childActive =
                      child.href === link.href
                        ? pathname === child.href
                        : pathname === child.href ||
                          pathname.startsWith(`${child.href}/`);
                    const childClass = cn(
                      "rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
                      childActive
                        ? "font-medium text-primary-foreground"
                        : "text-primary-foreground/55 hover:text-primary-foreground",
                    );
                    return child.modal ? (
                      <button
                        key={child.href}
                        type="button"
                        onClick={() => openAddWine(child.modal!)}
                        className={childClass}
                      >
                        {child.label}
                      </button>
                    ) : (
                      <Link
                        key={child.href}
                        href={child.href}
                        aria-current={childActive ? "page" : undefined}
                        className={childClass}
                      >
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-primary-foreground/15 p-3">
        <div className="flex items-center gap-2">
          <Link
            href={`/u/${user.id}`}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-primary-foreground/10"
          >
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatarUrl}
                alt=""
                className="size-8 shrink-0 rounded-full object-cover ring-1 ring-primary-foreground/20"
              />
            ) : (
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-foreground/15 text-xs font-medium">
                {user.name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="truncate text-sm font-medium">{user.name}</span>
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              aria-label="Sign out"
              className="rounded-md p-2 text-primary-foreground/60 transition-colors hover:bg-primary-foreground/10 hover:text-primary-foreground"
            >
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
