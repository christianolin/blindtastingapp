"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { RevealMode, TimingMode } from "@/lib/supabase/database.types";
import { Button } from "@/components/ui/button";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImageUploader } from "@/components/image-uploader";
import { createTasting, type CreateTastingFormState } from "./actions";
import { InviteField } from "./invite-field";
import { Users, Wine, Workflow, Trophy, Image as ImageIcon, EyeOff } from "lucide-react";

const TIMING_MODE_ITEMS = {
  LIVE: "Live",
  ASYNC: "Self-paced",
};

const WINE_SOURCE_ITEMS = {
  HOST_PROVIDES: "Organizer selects the wines",
  PARTICIPANT_CONTRIBUTED: "Everyone brings wines",
};

const FLOW_ITEMS = {
  GUIDED: "Guided",
  FREE: "Free",
};

const LEADERBOARD_REVEAL_ITEMS = {
  PER_ATTRIBUTE: "After each attribute",
  PER_WINE: "After the full wine",
};

const ASYNC_REVEAL_ITEMS = {
  AFTER_ALL: "After everyone has guessed that wine",
  IMMEDIATE: "Immediately after you submit your own guess",
};

export function NewTastingForm({
  friends,
  userId,
  reveal,
}: {
  friends: { id: string; display_name: string; email: string }[];
  userId: string;
  reveal: RevealMode;
}) {
  const [state, formAction, pending] = useActionState<
    CreateTastingFormState,
    FormData
  >(createTasting, null);
  const [timing, setTiming] = useState<TimingMode>("LIVE");

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Tasting name</Label>
        <Input id="name" name="name" required autoFocus />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Description (optional)</Label>
        <Textarea
          id="description"
          name="description"
          placeholder="What's the theme? Any tasting notes for the group?"
          rows={3}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="scheduled_at">Date &amp; time (optional)</Label>
        <Input id="scheduled_at" name="scheduled_at" type="datetime-local" />
        <p className="text-xs text-muted-foreground">
          When the group will taste. Leave blank for an open-ended self-paced
          tasting.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label className="flex items-center gap-1.5">
          <ImageIcon className="size-3.5 text-muted-foreground" /> Cover photo (optional)
        </Label>
        <ImageUploader
          name="image_url"
          bucket="tasting-images"
          folder={userId}
          label="Add a cover photo"
        />
        <p className="text-xs text-muted-foreground">JPG, PNG up to 5MB.</p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="timing_mode" className="flex items-center gap-1.5">
          <Users className="size-3.5 text-muted-foreground" /> Format
        </Label>
        <Select
          name="timing_mode"
          items={TIMING_MODE_ITEMS}
          value={timing}
          onValueChange={(v) => setTiming(v as TimingMode)}
          required
        >
          <SelectTrigger id="timing_mode" className="w-full">
            <SelectValue placeholder="Choose a format" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="LIVE">{TIMING_MODE_ITEMS.LIVE}</SelectItem>
            <SelectItem value="ASYNC">
              {TIMING_MODE_ITEMS.ASYNC}
            </SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {timing === "LIVE"
            ? "Everyone tastes together in one sitting."
            : "Open for days — people taste whenever they can."}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="wine_source" className="flex items-center gap-1.5">
          <Wine className="size-3.5 text-muted-foreground" /> Wines
        </Label>
        <Select
          name="wine_source"
          items={WINE_SOURCE_ITEMS}
          defaultValue="HOST_PROVIDES"
          required
        >
          <SelectTrigger id="wine_source" className="w-full">
            <SelectValue placeholder="Who provides the wines?" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="HOST_PROVIDES">
              {WINE_SOURCE_ITEMS.HOST_PROVIDES}
            </SelectItem>
            <SelectItem value="PARTICIPANT_CONTRIBUTED">
              {WINE_SOURCE_ITEMS.PARTICIPANT_CONTRIBUTED}
            </SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Everyone brings wines: each person adds a bottle only they know, and
          even you as organizer can&apos;t see it until reveal.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2">
          <span className="flex items-center gap-1.5 text-sm">
            <EyeOff className="size-3.5 text-muted-foreground" />
            <span>
              <span className="text-muted-foreground">Mode</span>{" "}
              <span className="font-medium">
                {reveal === "BLIND" ? "Blind" : "Semi-blind"}
              </span>
            </span>
          </span>
          <Link
            href="/taste"
            className="rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Change
          </Link>
        </div>
        <p className="text-xs text-muted-foreground">
          {reveal === "BLIND"
            ? "Nothing is known ahead of time — guess each wine from scratch."
            : "The full wine list is shown up front; match each glass to a wine."}
        </p>
        <input type="hidden" name="reveal_mode" value={reveal} />
      </div>

      {reveal === "BLIND" ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="flow" className="flex items-center gap-1.5">
            <Workflow className="size-3.5 text-muted-foreground" /> Flow
          </Label>
          <Select name="flow" items={FLOW_ITEMS} defaultValue="GUIDED" required>
            <SelectTrigger id="flow" className="w-full">
              <SelectValue placeholder="Choose a flow" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="GUIDED">{FLOW_ITEMS.GUIDED}</SelectItem>
              <SelectItem value="FREE">{FLOW_ITEMS.FREE}</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Guided: everyone tastes the same wine together, one at a time.
            Free: people guess any wine in any order.
          </p>
        </div>
      ) : null}

      {reveal === "BLIND" ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="leaderboard_reveal" className="flex items-center gap-1.5">
            <Trophy className="size-3.5 text-muted-foreground" /> Leaderboard
          </Label>
          <Select
            name="leaderboard_reveal"
            items={LEADERBOARD_REVEAL_ITEMS}
            defaultValue="PER_ATTRIBUTE"
            required
          >
            <SelectTrigger id="leaderboard_reveal" className="w-full">
              <SelectValue placeholder="When to move the leaderboard" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PER_ATTRIBUTE">
                {LEADERBOARD_REVEAL_ITEMS.PER_ATTRIBUTE}
              </SelectItem>
              <SelectItem value="PER_WINE">
                {LEADERBOARD_REVEAL_ITEMS.PER_WINE}
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            When the standings move during a progressive reveal — after every
            attribute, or only once the whole wine is revealed.
          </p>
        </div>
      ) : null}

      {timing === "ASYNC" ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="async_reveal_policy">When to show results</Label>
          <Select
            name="async_reveal_policy"
            items={ASYNC_REVEAL_ITEMS}
            defaultValue="AFTER_ALL"
            required
          >
            <SelectTrigger id="async_reveal_policy" className="w-full">
              <SelectValue placeholder="When to show results" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="AFTER_ALL">
                {ASYNC_REVEAL_ITEMS.AFTER_ALL}
              </SelectItem>
              <SelectItem value="IMMEDIATE">
                {ASYNC_REVEAL_ITEMS.IMMEDIATE}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <InviteField friends={friends} />

      {state?.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}

      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <Link
          href="/taste"
          className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          Cancel
        </Link>
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <WineGlassLoader /> Creating…
            </>
          ) : (
            "Create tasting"
          )}
        </Button>
      </div>
    </form>
  );
}
