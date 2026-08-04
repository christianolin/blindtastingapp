"use client";

import { useState, type ComponentType } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  X,
  Wine,
  BookOpen,
  Boxes,
  GraduationCap,
  Users,
  Shield,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/app/actions";
import { cn } from "@/lib/utils";
import { BlindrMark } from "@/components/logo";
import { type NavLink, type NavChild, isNavActive } from "@/components/nav-links";
import { useAddWine } from "@/components/add-wine-context";
import { useTasteLauncher } from "@/components/taste-launcher-context";

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  taste: Wine,
  catalog: BookOpen,
  cellar: Boxes,
  learn: GraduationCap,
  community: Users,
  admin: Shield,
};

/**
 * Hamburger + slide-in drawer for the app nav on phones (the desktop nav in
 * AppHeader is hidden below md). Dependency-free overlay + panel so it never
 * fights base-ui's Dialog positioning; closes on link tap, backdrop tap, or
 * the X. Styled to mirror the desktop AppSidebar (bordeaux panel, pillar icons,
 * profile + sign out pinned to the bottom). `notifications` is an optional slot
 * the header drops the invite bell into so pending invites are reachable on
 * mobile too.
 *
 * The drawer is portaled to document.body: AppHeader uses backdrop-blur, which
 * makes it a containing block for `position: fixed` descendants — rendered
 * inline the drawer's `fixed inset-0` resolved against the short header box
 * (so its background didn't cover the page). Portaling escapes that.
 */
export function MobileNav({
  userId,
  displayName,
  avatarUrl,
  links,
  notifications,
}: {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  links: NavLink[];
  notifications?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const close = () => setOpen(false);
  const { openAddWine } = useAddWine();
  const { openTaste } = useTasteLauncher();
  const openModal = (kind: NonNullable<NavChild["modal"]>) => {
    close();
    if (kind === "catalog" || kind === "cellar") openAddWine(kind);
    else if (kind === "taste-blind") openTaste("blind");
    else if (kind === "taste-semi-blind") openTaste("semi-blind");
    else openTaste("rate");
  };

  const drawer =
    open && typeof document !== "undefined"
      ? createPortal(
          <div className="fixed inset-0 z-50">
            <button
              aria-label="Close menu"
              className="animate-in fade-in absolute inset-0 bg-black/40 duration-150"
              onClick={close}
            />
            <div className="animate-in slide-in-from-left absolute top-0 left-0 flex h-full w-64 flex-col bg-primary text-primary-foreground shadow-xl duration-200">
              <div className="flex shrink-0 items-center justify-between px-5 pt-4 pb-2">
                <Link
                  href="/taste"
                  onClick={close}
                  className="flex items-center gap-2 transition-opacity hover:opacity-90"
                >
                  <BlindrMark size={24} onDark />
                  <span className="font-heading text-lg font-semibold tracking-tight">
                    Blindr
                  </span>
                </Link>
                <button
                  type="button"
                  aria-label="Close menu"
                  onClick={close}
                  className="rounded-md p-2 text-primary-foreground/70 transition-colors hover:bg-primary-foreground/10 hover:text-primary-foreground"
                >
                  <X className="size-5" />
                </button>
              </div>

              <nav className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2">
                {links.map((link) => {
                  const Icon = ICONS[link.key] ?? Wine;
                  const sectionActive = isNavActive(pathname, link);
                  return (
                    <div key={link.key} className="mb-1">
                      <Link
                        href={link.href}
                        onClick={close}
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
                                onClick={close}
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

              <div className="shrink-0 border-t border-primary-foreground/15 p-3">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/u/${userId}`}
                    onClick={close}
                    className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-primary-foreground/10"
                  >
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatarUrl}
                        alt=""
                        className="size-8 shrink-0 rounded-full object-cover ring-1 ring-primary-foreground/20"
                      />
                    ) : (
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-foreground/15 text-xs font-medium">
                        {displayName.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <span className="truncate text-sm font-medium">
                      {displayName}
                    </span>
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
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="flex items-center gap-1 md:hidden">
      {notifications}
      <Button
        variant="ghost"
        size="icon"
        aria-label="Open menu"
        onClick={() => setOpen(true)}
      >
        <Menu />
      </Button>
      {drawer}
    </div>
  );
}
