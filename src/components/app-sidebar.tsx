"use client";

import { useEffect, useState, type ComponentType } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Wine,
  BookOpen,
  Boxes,
  GraduationCap,
  Users,
  Shield,
  LogOut,
  ChevronRight,
  LayoutDashboard,
  PanelLeftOpen,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  navWithAdmin,
  isNavActive,
  type NavChild,
  type NavLink,
} from "@/components/nav-links";
import { useAddWine } from "@/components/add-wine-context";
import { useTasteLauncher } from "@/components/taste-launcher-context";
import { signOut } from "@/app/actions";
import { BlindrMark } from "@/components/logo";
import { PROFILE_LINKS } from "@/components/profile-links";

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  overview: LayoutDashboard,
  taste: Wine,
  catalog: BookOpen,
  cellar: Boxes,
  learn: GraduationCap,
  community: Users,
  admin: Shield,
};

type SidebarUser = { id: string; name: string; avatarUrl: string | null };

// The persistent left navigation. Below md the MobileNav drawer in the top bar
// takes over and the aside is hidden. Between md and xl it is a 60px rail —
// logo mark, one icon + 10px label per pillar, the avatar pinned at the
// bottom — whose expand control opens the full 240px sidebar as an overlay
// drawer. From xl it is the full sidebar in flow. Both aside variants are
// rendered and toggled with breakpoint classes, so no JS width detection.
export function AppSidebar({
  isManager,
  user,
}: {
  isManager: boolean;
  user: SidebarUser;
}) {
  const pathname = usePathname();
  const links = navWithAdmin(isManager);

  // Tablet drawer: opened from the rail, closed by the backdrop, the X, or any
  // navigation. The path comparison runs during render (a render-phase reset,
  // as in AppNav) rather than in an effect, so a route change closes it in
  // the same pass and stays clear of set-state-in-effect.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [seenPath, setSeenPath] = useState(pathname);
  if (pathname !== seenPath) {
    setSeenPath(pathname);
    setDrawerOpen(false);
  }
  const closeDrawer = () => setDrawerOpen(false);

  // The drawer is a modal overlay, so Escape closes it like a dialog. The
  // listener only exists while it is open; the effect itself sets no state.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  // Portaled to document.body for the same reason as MobileNav: an ancestor
  // with backdrop-blur (the header) becomes the containing block for `fixed`
  // descendants, so an inline `fixed inset-0` would not cover the page.
  const drawer =
    drawerOpen && typeof document !== "undefined"
      ? createPortal(
          <div className="fixed inset-0 z-50 xl:hidden">
            <button
              type="button"
              aria-label="Close menu"
              className="animate-in fade-in absolute inset-0 bg-black/40 duration-150"
              onClick={closeDrawer}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
              className="animate-in slide-in-from-left absolute top-0 left-0 flex h-full w-60 flex-col bg-primary text-primary-foreground shadow-xl duration-200"
            >
              <SidebarBody
                variant="full"
                links={links}
                user={user}
                onNavigate={closeDrawer}
                onClose={closeDrawer}
              />
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {/* In flow, full height: the shell locks window scrolling and scrolls
          the content column instead, so the aside cannot move on any device. */}
      <aside className="hidden h-full shrink-0 flex-col bg-primary text-primary-foreground md:flex md:w-[60px] xl:w-60">
        <SidebarBody
          variant="full"
          links={links}
          user={user}
          className="hidden xl:flex"
        />
        <SidebarBody
          variant="rail"
          links={links}
          user={user}
          className="flex xl:hidden"
          onExpand={() => setDrawerOpen(true)}
        />
      </aside>
      {drawer}
    </>
  );
}

// The sidebar's contents — logo row, nav list, footer — in either the full
// (240px) or the rail (60px) layout. Used three times: the aside renders both
// variants (one hidden per breakpoint) and the tablet drawer renders "full".
function SidebarBody({
  variant,
  links,
  user,
  className,
  onNavigate,
  onClose,
  onExpand,
}: {
  variant: "full" | "rail";
  links: NavLink[];
  user: SidebarUser;
  className?: string;
  // Drawer only: fired on every link and launcher tap so the overlay closes
  // even when the path does not change (already on that page, or a modal).
  onNavigate?: () => void;
  // Drawer only: renders the X close button in the logo row. It takes focus
  // on mount so keyboard focus lands inside the dialog when it opens.
  onClose?: () => void;
  // Rail only: the expand control that opens the drawer.
  onExpand?: () => void;
}) {
  const pathname = usePathname();
  const profileActive = pathname.startsWith("/profile");
  // Collapsible sub-nav: a pillar's children show when you're inside that
  // section; a chevron tap overrides either way. Keeps the sidebar one calm
  // line per pillar instead of every section's sub-pages all the time.
  const [expandOverrides, setExpandOverrides] = useState<Record<string, boolean>>(
    {},
  );
  const { openAddWine } = useAddWine();
  const { openTaste } = useTasteLauncher();
  const openModal = (kind: NonNullable<NavChild["modal"]>) => {
    onNavigate?.();
    if (kind === "catalog" || kind === "cellar") openAddWine(kind);
    else if (kind === "taste-blind") openTaste("blind");
    else if (kind === "taste-semi-blind") openTaste("semi-blind");
    else openTaste("rate");
  };

  if (variant === "rail") {
    return (
      <div className={cn("flex min-h-0 w-full flex-1 flex-col items-center", className)}>
        <div className="flex shrink-0 flex-col items-center pt-2 pb-1">
          <button
            type="button"
            aria-label="Open menu"
            onClick={onExpand}
            className="flex size-11 items-center justify-center rounded-lg text-primary-foreground/70 transition-colors hover:bg-primary-foreground/10 hover:text-primary-foreground"
          >
            <PanelLeftOpen className="size-[18px]" />
          </button>
          <Link
            href="/overview"
            aria-label="Blindr overview"
            className="flex size-11 items-center justify-center transition-opacity hover:opacity-90"
          >
            <BlindrMark size={24} onDark />
          </Link>
        </div>

        <nav className="no-scrollbar flex min-h-0 w-full flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-0.5 py-2">
          {links.map((link) => {
            const Icon = ICONS[link.key] ?? Wine;
            const sectionActive = isNavActive(pathname, link);
            return (
              <Link
                key={link.key}
                href={link.href}
                title={link.label}
                aria-current={sectionActive ? "page" : undefined}
                className={cn(
                  "flex min-h-11 w-full flex-col items-center justify-center gap-1 rounded-lg px-0 py-1.5 transition-colors",
                  sectionActive
                    ? "bg-primary-foreground/15 text-primary-foreground"
                    : "text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-primary-foreground",
                )}
              >
                <Icon className="size-[18px] shrink-0" />
                <span className="max-w-full truncate text-[10px] leading-tight tracking-[-0.01em]">
                  {link.label}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="flex w-full shrink-0 justify-center border-t border-primary-foreground/15 py-2">
          <Link
            href={`/u/${user.id}`}
            aria-label={user.name}
            title={user.name}
            className={cn(
              "flex size-11 items-center justify-center rounded-lg transition-colors hover:bg-primary-foreground/10",
              profileActive && "bg-primary-foreground/15",
            )}
          >
            <UserAvatar user={user} className="size-[30px]" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex min-h-0 w-full flex-1 flex-col", className)}>
      <div className="flex shrink-0 items-center justify-between px-5 pt-4 pb-2">
        <Link
          href="/overview"
          onClick={onNavigate}
          className="flex items-center gap-2 transition-opacity hover:opacity-90"
        >
          <BlindrMark size={26} onDark />
          <span className="font-heading text-xl font-semibold tracking-tight">Blindr</span>
        </Link>
        {onClose ? (
          <button
            type="button"
            aria-label="Close menu"
            autoFocus
            onClick={onClose}
            className="-mr-2.5 flex size-11 items-center justify-center rounded-md text-primary-foreground/70 transition-colors hover:bg-primary-foreground/10 hover:text-primary-foreground"
          >
            <X className="size-5" />
          </button>
        ) : null}
      </div>

      <nav className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2">
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
                  onClick={onNavigate}
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
                        onClick={onNavigate}
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

      {/* The signed-in person. Under /profile/* this block is the active item
          and reveals its two sub-pages (Your numbers, Profile & settings) —
          that, plus the top-bar pill, is how the stats page is reached; it is
          deliberately not a nav pillar. */}
      <div className="shrink-0 border-t border-primary-foreground/15 p-3">
        <div className="flex items-center gap-2">
          <Link
            href={`/u/${user.id}`}
            onClick={onNavigate}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-primary-foreground/10",
              profileActive && "bg-primary-foreground/15",
            )}
          >
            <UserAvatar user={user} className="size-8" />
            <span
              className={cn(
                "truncate text-sm",
                profileActive ? "font-semibold" : "font-medium",
              )}
            >
              {user.name}
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
        {profileActive ? (
          <div className="mt-0.5 mb-1 ml-6 flex flex-col border-l border-primary-foreground/[.18] pl-3">
            {PROFILE_LINKS.map((l) => {
              const active =
                pathname === l.href || pathname.startsWith(`${l.href}/`);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-[12.5px] transition-colors",
                    active
                      ? "font-semibold text-primary-foreground"
                      : "text-primary-foreground/60 hover:text-primary-foreground",
                  )}
                >
                  {l.label}
                </Link>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// The avatar image, or an initial in a ring when there is none. `className`
// sets the size (32px in the full footer, 30px in the rail).
function UserAvatar({
  user,
  className,
}: {
  user: SidebarUser;
  className: string;
}) {
  return user.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={user.avatarUrl}
      alt=""
      className={cn(
        "shrink-0 rounded-full object-cover ring-1 ring-primary-foreground/20",
        className,
      )}
    />
  ) : (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-primary-foreground/15 text-xs font-medium",
        className,
      )}
    >
      {user.name.slice(0, 1).toUpperCase()}
    </span>
  );
}
