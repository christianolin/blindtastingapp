"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Award, Grape, MapPin, Tags, Wine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import type { WinePlaceContext, WinePlaceGrape } from "@/lib/wine-map/context";

const STYLE_LABELS: Record<string, string> = {
  RED: "Red",
  WHITE: "White",
  ROSE: "Rosé",
  SPARKLING: "Sparkling",
  SWEET: "Sweet",
  FORTIFIED: "Fortified",
};

// Learning-first visual cues: one colour per wine style, and grape icons
// tinted by the grape's own colour.
const STYLE_COLORS: Record<string, string> = {
  RED: "#7E1B26",
  WHITE: "#B78E42",
  ROSE: "#D98A9E",
  SPARKLING: "#8FA3B8",
  SWEET: "#C08A2D",
  FORTIFIED: "#6B4430",
};

export function grapeIconColor(color: string | null) {
  if (color === "RED") return "#7E1B26";
  if (color === "WHITE") return "#B78E42";
  return "#8A8A85";
}

function SectionHeading({
  icon: Icon,
  children,
}: {
  icon: typeof Grape;
  children: ReactNode;
}) {
  return (
    <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <Icon className="size-3.5" />
      {children}
    </p>
  );
}

type GrapeProfile = {
  description: string | null;
  typical_aromas: string | null;
  typical_acidity: string | null;
  typical_tannin: string | null;
  typical_body: string | null;
  typical_alcohol: string | null;
  main_regions: string | null;
  skin_color: string | null;
};

// Clicking a grape never navigates away: global profile (Grape Library
// data) + the local block for the selected place, in a dialog.
function GrapeModal({
  grape,
  onClose,
}: {
  grape: WinePlaceGrape;
  onClose: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [profile, setProfile] = useState<GrapeProfile | null | "loading">(
    "loading",
  );
  useEffect(() => {
    let cancelled = false;
    supabase
      .from("grapes")
      .select(
        "description, typical_aromas, typical_acidity, typical_tannin, typical_body, typical_alcohol, main_regions, skin_color",
      )
      .eq("id", grape.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setProfile(data ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, grape.id]);

  const facts: [string, string | null][] =
    profile !== "loading" && profile
      ? [
          ["Skin colour", profile.skin_color],
          ["Aromas", profile.typical_aromas],
          ["Acidity", profile.typical_acidity],
          ["Tannin", profile.typical_tannin],
          ["Body", profile.typical_body],
          ["Alcohol", profile.typical_alcohol],
          ["Main regions", profile.main_regions],
        ]
      : [];

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Grape
              className="size-5"
              style={{ color: grapeIconColor(grape.color) }}
            />
            {grape.name}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={grape.role === "PRINCIPAL" ? "default" : "outline"}>
            {grape.role === "PRINCIPAL" ? "Principal" : "Accessory"}
          </Badge>
          {!grape.permitted ? <Badge variant="outline">Not permitted</Badge> : null}
          {grape.share_pct != null ? (
            <Badge variant="secondary">~{grape.share_pct}% of vineyard</Badge>
          ) : null}
        </div>
        {grape.share_pct != null ? (
          <div>
            <div className="mb-1 flex justify-between text-xs text-muted-foreground">
              <span>Share of vineyard here</span>
              <span className="tabular-nums">~{grape.share_pct}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, Math.max(0, grape.share_pct))}%`,
                  backgroundColor: grapeIconColor(grape.color),
                }}
              />
            </div>
          </div>
        ) : null}
        {grape.local_note ? (
          <p className="text-sm text-muted-foreground">{grape.local_note}</p>
        ) : null}
        {profile === "loading" ? (
          <p className="text-sm text-muted-foreground">Loading profile…</p>
        ) : profile?.description ? (
          <p className="text-sm text-muted-foreground">{profile.description}</p>
        ) : null}
        {facts.some(([, value]) => value) ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {facts
              .filter(([, value]) => value)
              .map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
          </dl>
        ) : null}
        <Link
          href="/knowledge/grapes"
          className="text-sm text-muted-foreground underline underline-offset-4"
        >
          Browse in Grape Library
        </Link>
      </DialogContent>
    </Dialog>
  );
}

// The scannable knowledge sections under the place overview. Every section
// hides itself until content exists (all V1 content seeds as DRAFT and only
// shows once the owner publishes it).
export function KnowledgeSections({
  context,
  onSelect,
}: {
  context: WinePlaceContext;
  onSelect: (key: string) => void;
}) {
  const [openGrape, setOpenGrape] = useState<WinePlaceGrape | null>(null);
  const { grapes, styles, designations, nearby, dual_labels: dualLabels } =
    context;

  const chipButton =
    "underline underline-offset-4 hover:text-foreground";

  return (
    <>
      {styles.length > 0 ? (
        <div>
          <SectionHeading icon={Wine}>Wine styles</SectionHeading>
          <div className="flex flex-wrap gap-1.5">
            {styles.map((s) => (
              <span
                key={s.style}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-2.5 py-1 text-xs font-medium"
              >
                <Wine
                  className="size-3.5"
                  style={{ color: STYLE_COLORS[s.style] ?? "#8A8A85" }}
                />
                {STYLE_LABELS[s.style] ?? s.style}
              </span>
            ))}
          </div>
          {styles
            .filter((s) => s.note)
            .map((s) => (
              <p key={s.style} className="mt-1 text-xs text-muted-foreground">
                {STYLE_LABELS[s.style] ?? s.style}: {s.note}
              </p>
            ))}
        </div>
      ) : null}
      {grapes.length > 0 ? (
        <div>
          <SectionHeading icon={Grape}>Grapes</SectionHeading>
          <div className="flex flex-col gap-1.5">
            {grapes.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setOpenGrape(g)}
                className="w-full rounded-lg border border-border/70 px-2.5 py-2 text-left transition-colors hover:bg-muted/60"
              >
                <span className="flex items-center gap-2">
                  <Grape
                    className="size-4 shrink-0"
                    style={{ color: grapeIconColor(g.color) }}
                  />
                  <span className="text-sm font-medium">{g.name}</span>
                  {g.role === "ACCESSORY" ? (
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      accessory
                    </span>
                  ) : null}
                  {g.share_pct != null ? (
                    <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                      ~{g.share_pct}%
                    </span>
                  ) : null}
                </span>
                {g.share_pct != null ? (
                  <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${Math.min(100, Math.max(0, g.share_pct))}%`,
                        backgroundColor: grapeIconColor(g.color),
                      }}
                    />
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {designations.length > 0 ? (
        <div>
          <SectionHeading icon={Award}>Designations</SectionHeading>
          <div className="flex flex-col gap-1.5 text-sm">
            {designations.map((d) => (
              <div key={d.key}>
                <span className="font-medium">{d.name}</span>
                <span className="text-muted-foreground"> — {d.description}</span>
                {d.local_note ? (
                  <span className="text-muted-foreground"> {d.local_note}</span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {dualLabels.length > 0 ? (
        <div>
          <SectionHeading icon={Tags}>Labelling</SectionHeading>
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            {dualLabels.map((d) => (
              <li key={`${d.key}-${d.direction}`}>
                {d.direction === "MAY_BE_SOLD_AS" ? (
                  <>
                    Wines here may also be sold as{" "}
                    <button
                      type="button"
                      className={chipButton}
                      onClick={() => onSelect(d.key)}
                    >
                      {d.name}
                    </button>
                    .
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className={chipButton}
                      onClick={() => onSelect(d.key)}
                    >
                      {d.name}
                    </button>{" "}
                    may also be sold under this name.
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {nearby.length > 0 ? (
        <div>
          <SectionHeading icon={MapPin}>Nearby</SectionHeading>
          <div className="flex flex-wrap gap-1.5">
            {nearby.map((n) => (
              <button
                key={n.key}
                type="button"
                onClick={() => onSelect(n.key)}
                className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"
              >
                {n.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {openGrape ? (
        <GrapeModal grape={openGrape} onClose={() => setOpenGrape(null)} />
      ) : null}
    </>
  );
}
