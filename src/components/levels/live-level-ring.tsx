"use client";

import { useSyncExternalStore, type ComponentProps } from "react";
import { levelStore } from "@/lib/levels/level-store";
import type { OwnLevel } from "@/lib/levels/types";
import { LevelRing } from "./level-ring";

const noLevel = () => null;

/**
 * The viewer's own level: the newest of the store (every AppHeader render
 * publishes into it) and the server's `initial`, by XP. Null when neither has
 * one — the caller then renders the bare avatar, never a false 0 %.
 */
export function useOwnLevel(userId: string, initial: OwnLevel | null): OwnLevel | null {
  const stored = useSyncExternalStore(
    levelStore.subscribe,
    () => levelStore.getLevel(userId),
    noLevel,
  );
  if (!stored) return initial;
  if (!initial) return stored;
  return stored.xp >= initial.xp ? stored : initial;
}

/** LevelRing for the viewer's own avatar, kept live by the store (spec §8.2). */
export function LiveLevelRing({
  userId,
  initial,
  children,
  ...ring
}: Omit<ComponentProps<typeof LevelRing>, "level" | "xp"> & {
  userId: string;
  initial: OwnLevel | null;
}) {
  const level = useOwnLevel(userId, initial);
  if (!level) return <>{children}</>;
  return (
    <LevelRing level={level.level} xp={level.xp} {...ring}>
      {children}
    </LevelRing>
  );
}
