"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AromaTerm, WineColour, WineStyle } from "@/lib/wset/types";
import {
  LABELS,
  APPEARANCE_INTENSITY_STOPS,
  INTENSITY_STOPS,
  DEVELOPMENT_STOPS,
  SWEETNESS_STOPS,
  LEVEL_STOPS,
  ALCOHOL_STOPS,
  FORTIFIED_ALCOHOL_STOPS,
  BODY_STOPS,
  FINISH_STOPS,
  HUES_BY_COLOUR,
} from "@/lib/wset/vocab";
import { EditableRange } from "@/components/wset/range-input";
import { AromaPicker } from "@/components/wset/aroma-picker";
import { updateArchetype } from "./actions";

export type ArchetypeProfile = {
  id: string;
  name: string;
  colour: WineColour;
  style: WineStyle;
  description: string | null;
  qualityLow: number | null;
  qualityHigh: number | null;
  sat: { [key: string]: [string, string] };
  noseTermIds: string[];
  palateTermIds: string[];
};

const COLOURS: WineColour[] = ["WHITE", "ORANGE", "ROSE", "RED"];
const STYLES: WineStyle[] = ["STILL", "SPARKLING", "SWEET", "FORTIFIED"];

function scalesFor(colour: WineColour, style: WineStyle) {
  return [
    { key: "appearanceIntensity", label: "Appearance intensity", stops: APPEARANCE_INTENSITY_STOPS },
    { key: "colourHue", label: "Colour", stops: HUES_BY_COLOUR[colour] },
    { key: "noseIntensity", label: "Nose intensity", stops: INTENSITY_STOPS },
    { key: "development", label: "Development", stops: DEVELOPMENT_STOPS },
    { key: "sweetness", label: "Sweetness", stops: SWEETNESS_STOPS },
    { key: "acidity", label: "Acidity", stops: LEVEL_STOPS },
    { key: "tannin", label: "Tannin", stops: LEVEL_STOPS },
    {
      key: "alcohol",
      label: "Alcohol",
      stops: style === "FORTIFIED" ? FORTIFIED_ALCOHOL_STOPS : ALCOHOL_STOPS,
    },
    { key: "body", label: "Body", stops: BODY_STOPS },
    { key: "flavourIntensity", label: "Flavour intensity", stops: INTENSITY_STOPS },
    { key: "finish", label: "Finish", stops: FINISH_STOPS },
  ] as const;
}

export function ArchetypeEditor({
  archetype,
  terms,
}: {
  archetype: ArchetypeProfile;
  terms: AromaTerm[];
}) {
  const router = useRouter();
  const [name, setName] = useState(archetype.name);
  const [colour, setColour] = useState<WineColour>(archetype.colour);
  const [style, setStyle] = useState<WineStyle>(archetype.style);
  const [description, setDescription] = useState(archetype.description ?? "");
  const [qLow, setQLow] = useState(archetype.qualityLow?.toString() ?? "");
  const [qHigh, setQHigh] = useState(archetype.qualityHigh?.toString() ?? "");
  const [sat, setSat] = useState<Record<string, [string, string]>>(archetype.sat ?? {});
  const [noseIds, setNoseIds] = useState<string[]>(archetype.noseTermIds);
  const [palateIds, setPalateIds] = useState<string[]>(archetype.palateTermIds);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const scales = scalesFor(colour, style);

  const setRange = (key: string, r: [string, string]) => {
    setSat((s) => ({ ...s, [key]: r }));
    setStatus("idle");
  };
  const clearRange = (key: string) =>
    setSat((s) => {
      const next = { ...s };
      delete next[key];
      return next;
    });
  const changeColour = (c: WineColour) => {
    setColour(c);
    setSat((s) => {
      const hue = s.colourHue;
      if (hue && !(HUES_BY_COLOUR[c] as string[]).includes(hue[0])) {
        const next = { ...s };
        delete next.colourHue;
        return next;
      }
      return s;
    });
  };

  const save = () =>
    startTransition(async () => {
      setError(null);
      const res = await updateArchetype(archetype.id, {
        name: name.trim(),
        colour,
        style,
        description: description.trim() || null,
        qualityLow: qLow ? Number(qLow) : null,
        qualityHigh: qHigh ? Number(qHigh) : null,
        sat,
        noseTermIds: noseIds,
        palateTermIds: palateIds,
      });
      if ("error" in res) {
        setStatus("error");
        setError(res.error);
      } else {
        setStatus("saved");
        router.refresh();
      }
    });

  return (
    <div className="mt-3 flex flex-col gap-4 border-t border-border pt-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Colour
            <select
              value={colour}
              onChange={(e) => changeColour(e.target.value as WineColour)}
              className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
            >
              {COLOURS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Style
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value as WineStyle)}
              className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
            >
              {STYLES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Description
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
        />
      </label>

      <div className="flex items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Quality from
          <input
            type="number"
            min={50}
            max={100}
            value={qLow}
            onChange={(e) => setQLow(e.target.value)}
            className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          to
          <input
            type="number"
            min={50}
            max={100}
            value={qHigh}
            onChange={(e) => setQHigh(e.target.value)}
            className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
          />
        </label>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-xs font-medium text-muted-foreground">
          Structured tasting ranges
        </p>
        {scales.map((sc) => (
          <div key={sc.key} className="rounded-md border border-border/60 p-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium">{sc.label}</span>
              {sat[sc.key] ? (
                <button
                  type="button"
                  onClick={() => clearRange(sc.key)}
                  className="text-[10px] text-muted-foreground underline"
                >
                  clear
                </button>
              ) : (
                <span className="text-[10px] text-muted-foreground">
                  not set — click to set
                </span>
              )}
            </div>
            <EditableRange
              stops={sc.stops}
              labels={LABELS}
              value={sat[sc.key] ?? null}
              onChange={(r) => setRange(sc.key, r)}
            />
          </div>
        ))}
      </div>

      <div className="rounded-md border border-border/60 p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          Nose — aroma characteristics
        </p>
        <AromaPicker terms={terms} selectedIds={noseIds} onChange={setNoseIds} colour={colour} />
      </div>
      <div className="rounded-md border border-border/60 p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          Palate — flavour characteristics
        </p>
        <AromaPicker
          terms={terms}
          selectedIds={palateIds}
          onChange={setPalateIds}
          colour={colour}
          copyFrom={{ label: "Copy from nose", ids: noseIds }}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {pending ? "Saving…" : status === "saved" ? "Saved ✓" : "Save profile"}
        </button>
        {error ? <span className="text-sm text-destructive">{error}</span> : null}
      </div>
    </div>
  );
}
