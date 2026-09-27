// The tab's one level store (spec §8.1, L28). AppHeader's <AwardsFeed>
// publishes every render's snapshot here; the one <AwardsToaster> in AppShell
// and the viewer's own rings read it through useSyncExternalStore. Keyed by
// user id: a sign-out and sign-in in the same tab is a soft navigation, so this
// module outlives it. Every change replaces the view object, so a
// useSyncExternalStore snapshot is stable until something changed.
// Pure: relative imports only, no React, no browser globals.
import { MAX_VISIBLE, buildToasts, freshEvents } from "./toasts";
import type { LevelSnapshot, OwnLevel, Toast } from "./types";

export type ShownToast = Toast & { leaving: boolean };

export type ToasterView = {
  userId: string | null;
  /** On screen, oldest first (newest at the bottom), at most MAX_VISIBLE. */
  visible: readonly ShownToast[];
  /** The text the polite live region reads: the cards that last appeared. */
  announcement: string;
  /** Rows to mark seen without a card (toasts.ts's silentIds). */
  silent: readonly number[];
};

type UserState = {
  /** The newest level seen: the highest XP (XP never goes down). */
  level: OwnLevel | null;
  /** Every ledger id queued or shown in this tab, or reported shown by another. */
  shownIds: Set<number>;
  /** The welcome card was queued (or shown elsewhere) in this tab. */
  welcomeDone: boolean;
};

export const EMPTY_VIEW: ToasterView = { userId: null, visible: [], announcement: "", silent: [] };

export type LevelStore = ReturnType<typeof createLevelStore>;

export function createLevelStore() {
  const users = new Map<string, UserState>();
  const listeners = new Set<() => void>();
  let current: string | null = null;
  let queued: Toast[] = [];
  let visible: ShownToast[] = [];
  let silent: number[] = [];
  let announcement = "";
  let active = true;
  let view: ToasterView = EMPTY_VIEW;

  function userState(userId: string): UserState {
    let s = users.get(userId);
    if (!s) {
      s = { level: null, shownIds: new Set(), welcomeDone: false };
      users.set(userId, s);
    }
    return s;
  }

  function emit() {
    view = { userId: current, visible: [...visible], announcement, silent: [...silent] };
    for (const l of listeners) l();
  }

  /** Moves waiting cards on screen while the tab is visible. */
  function promote(): boolean {
    if (!active) return false;
    const appeared: ShownToast[] = [];
    while (visible.length < MAX_VISIBLE && queued.length > 0) {
      const next = { ...(queued.shift() as Toast), leaving: false };
      visible.push(next);
      appeared.push(next);
    }
    if (appeared.length === 0) return false;
    announcement = appeared.map((t) => (t.detail ? `${t.title}. ${t.detail}` : t.title)).join(". ");
    return true;
  }

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getView(): ToasterView {
      return view;
    },

    /** The viewer's newest level, or null before any snapshot arrived. */
    getLevel(userId: string): OwnLevel | null {
      return users.get(userId)?.level ?? null;
    },

    /** Merges one render's snapshot: the level (highest XP wins), the rows no
        card carried yet, and the welcome card once per tab. */
    publish(snapshot: LevelSnapshot): void {
      const s = userState(snapshot.userId);
      if (current !== snapshot.userId) {
        current = snapshot.userId;
        queued = [];
        visible = [];
        silent = [];
        announcement = "";
      }
      if (!s.level || snapshot.xp > s.level.xp) {
        s.level = { xp: snapshot.xp, level: snapshot.level };
      }
      const fresh = freshEvents(snapshot.unseen, s.shownIds);
      for (const e of fresh) s.shownIds.add(e.id);
      const welcome = snapshot.welcome && !s.welcomeDone;
      if (welcome) s.welcomeDone = true;
      if (fresh.length > 0 || welcome) {
        const batch = buildToasts(fresh, {
          userId: snapshot.userId,
          welcome,
          xp: snapshot.xp,
          checkedAt: snapshot.checkedAt,
        });
        queued.push(...batch.toasts);
        silent.push(...batch.silentIds);
      }
      promote();
      emit();
    },

    /** The tab became visible (true) or hidden (false). Hidden: nothing new shows. */
    setActive(isVisible: boolean): void {
      if (active === isVisible) return;
      active = isVisible;
      promote();
      emit();
    },

    /** Starts a card's exit (a 150 ms fade); `remove` takes it off screen. */
    dismiss(toastId: string): void {
      if (!visible.some((t) => t.id === toastId && !t.leaving)) return;
      visible = visible.map((t) => (t.id === toastId ? { ...t, leaving: true } : t));
      emit();
    },

    remove(toastId: string): void {
      const before = visible.length;
      visible = visible.filter((t) => t.id !== toastId);
      if (visible.length === before) return;
      promote();
      emit();
    },

    /** The toaster marked these silent rows seen. */
    clearSilent(ids: readonly number[]): void {
      const done = new Set(ids);
      const next = silent.filter((id) => !done.has(id));
      if (next.length === silent.length) return;
      silent = next;
      emit();
    },

    /** Another tab showed these rows (BroadcastChannel): never repeat them here. */
    markShownElsewhere(userId: string, ids: readonly number[], welcome: boolean): void {
      const s = userState(userId);
      for (const id of ids) s.shownIds.add(id);
      if (welcome) s.welcomeDone = true;
      if (userId !== current) return;
      // Only a waiting card whose rows the other tab showed, all of them —
      // never one this tab grouped differently (a duplicate is harmless, R12).
      const incoming = new Set(ids);
      const before = queued.length;
      queued = queued.filter(
        (t) =>
          !(t.welcome && welcome) &&
          !(t.eventIds.length > 0 && t.eventIds.every((id) => incoming.has(id))),
      );
      if (queued.length !== before) emit();
    },
  };
}

/** The tab's store. */
export const levelStore = createLevelStore();
