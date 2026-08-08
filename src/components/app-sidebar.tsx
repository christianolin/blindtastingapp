"use client";

import { useState, type ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wine, BookOpen, Boxes, GraduationCap, Users, Shield, LogOut, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { navWithAdmin, isNavActive, type NavChild } from "@/components/nav-links";
import { useAddWine } from "@/components/add-wine-context";
import { useTasteLauncher } from "@/components/taste-launcher-context";
import { signOut } from "@/app/actions";
import { BlindrMark } from "@/components/logo";

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
  // Collapsible sub-nav: a pillar's children show when you're inside that
  // section; a chevron tap overrides either way. Keeps the sidebar one calm
  // line per pillar instead of every section's sub-pages all the time.
  const [expandOverrides, setExpandOverrides] = useState<Record<string, boolean>>(
    {},
  );
  const { openAddWine } = useAddWine();
  const { openTaste } = useTasteLauncher();
  const openModal = (kind: NonNullable<NavChild["modal"]>) => {
    if (kind === "catalog" || kind === "cellar") openAddWine(kind);
    else if (kind === "taste-blind") openTaste("blind");
    else if (kind === "taste-semi-blind") openTaste("semi-blind");
    else openTaste("rate");
  };

  return (
    // fixed, not sticky: iPad Safari's collapsing browser chrome makes a
    // sticky 100vh aside drift with the scroll. Fixed + a pl-60 content
    // column pins it to the viewport everywhere.
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col bg-primary text-primary-foreground md:flex">
      <div className="px-5 pt-4 pb-2">
        <Link href="/taste" className="flex items-center gap-2 transition-opacity hover:opacity-90">
          <BlindrMark size={26} onDark />
          <span className="font-heading text-xl font-semibold tracking-tight">Blindr</span>
        </Link>
      </div>

      <nav className="no-scrollbar flex-1 overflow-y-auto px-3 py-2">
        {links.map((link) => {
          const Icon = ICONS[link.key] ?? Wine;
          const sectionActive = isNavActive(pathname, link);
          const open =
            !!link.children && (expandOverrides[link.key] ?? sectionActive);
          return (
            <div key={link.key} className="mb-1">
              <div
                className={cn(
                  "flex items-center rounded-lg transition-colors",
                  sectionActive
                    ? "bg-primary-foreground/15 text-primary-foreground"
                    : "text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-primary-foreground",
                )}
              >
                <Link
                  href={link.href}
                  aria-current={sectionActive ? "page" : undefined}
                  className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2 text-sm font-medium"
                >
                  <Icon className="size-4 shrink-0" />
                  {link.label}
                </Link>
                {link.children ? (
                  <button
                    type="button"
                    aria-label={open ? `Collapse ${link.label}` : `Expand ${link.label}`}
                    aria-expanded={open}
                    onClick={() =>
                      setExpandOverrides((o) => ({ ...o, [link.key]: !open }))
                    }
                    className="mr-1.5 rounded-md p-1.5 text-primary-foreground/50 transition-colors hover:bg-primary-foreground/10 hover:text-primary-foreground"
                  >
                    <ChevronRight
                      className={cn(
                        "size-3.5 transition-transform",
                        open && "rotate-90",
                      )}
                    />
                  </button>
                ) : null}
              </div>
              {link.children && open ? (
                <div className="mt-0.5 mb-1 ml-[1.35rem] flex flex-col border-l border-primary-foreground/15 pl-3">
                  {link.children.map((child) => {
                    if (child.soon) {
                      return (
                        <span
                          key={child.label}
                          className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-primary-foreground/35"
                        >
                          {child.label}
                          <span className="rounded-full bg-primary-foreground/10 px-1.5 py-0.5 text-[0.6rem] font-medium tracking-wide uppercase">
                            Soon
                          </span>
                        </span>
                      );
                    }
                    const childActive =
                      !child.modal &&
                      (child.href === link.href
                        ? pathname === child.href
                        : pathname === child.href ||
                          pathname.startsWith(`${child.href}/`));
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
                        onClick={() => openModal(child.modal!)}
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
