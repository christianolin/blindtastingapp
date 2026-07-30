"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { parseCellarTrackerCsv } from "./parse-cellartracker";
import { importCellarCsv, type ImportSummary } from "./actions";

export function ImportForm() {
  const [csv, setCsv] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const parsed = csv.trim() ? parseCellarTrackerCsv(csv) : [];

  async function submit() {
    setError(null);
    setSummary(null);
    if (parsed.length === 0) {
      setError(
        "No rows found. Paste a CellarTracker CSV export including its header row.",
      );
      return;
    }
    setPending(true);
    try {
      setSummary(await importCellarCsv(parsed));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Export your cellar from CellarTracker as CSV and paste it below. Producer,
        wine, region, vintage, quantity, size, price and drink windows are mapped;
        name matching is best-effort and anything unmatched is created.
      </p>
      <Textarea
        value={csv}
        onChange={(e) => {
          setCsv(e.target.value);
          setSummary(null);
        }}
        placeholder="Paste CSV, including the header row…"
        rows={10}
        className="font-mono text-xs"
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {summary ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border p-4 text-sm">
          <p className="font-medium">
            Imported {summary.imported} · Failed {summary.failed}
          </p>
          {summary.errors.length > 0 ? (
            <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
              {summary.errors.slice(0, 10).map((e, i) => (
                <li key={i}>
                  Row {e.row}: {e.error}
                </li>
              ))}
            </ul>
          ) : null}
          <a
            href="/cellar"
            className="mt-1 text-xs underline underline-offset-4 hover:text-foreground"
          >
            Go to your cellar
          </a>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <Button
            type="button"
            onClick={submit}
            disabled={pending || parsed.length === 0}
          >
            {pending ? "Importing…" : "Import"}
          </Button>
          {parsed.length > 0 ? (
            <span className="text-sm text-muted-foreground">
              {parsed.length} row{parsed.length === 1 ? "" : "s"} ready
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
