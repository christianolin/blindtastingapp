"use client";

// The safety net around the tile map. Before it, nothing under src/app caught
// a render or effect error, so one throw from MapLibre (or a failed
// next/dynamic chunk after a deploy) replaced the WHOLE page — tree, details
// and all — with Next's "This page couldn't load". Now the map area alone
// falls back to the same card the manifest failure shows, and Retry remounts
// the map. Errors thrown inside MapLibre's own event listeners or animation
// frames never reach React and are not caught here; those paths guard
// themselves.
//
// Only relative imports: map-error-boundary.test.ts loads this file in vitest,
// which has no "@/" alias.
import { Component, type ErrorInfo, type ReactNode } from "react";

/** The map area's "no map" card: a failed manifest, or a crashed map. */
export function MapUnavailableCard({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 rounded-lg border text-center">
      <p className="text-sm text-muted-foreground">
        The map tiles are unavailable right now — navigation below still works.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        Retry map
      </button>
    </div>
  );
}

/** A code-split chunk that failed to load — typically a tab still running the
    previous deployment asking for a chunk the new one no longer serves.
    Webpack names it ChunkLoadError ("Loading chunk 123 failed."); Turbopack
    throws a plain Error ("Failed to load chunk /_next/static/…"). */
export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === "ChunkLoadError" ||
    /^Failed to load chunk /.test(error.message) ||
    /^Loading (CSS )?chunk \S+ failed/i.test(error.message)
  );
}

type Props = {
  /** Bumped by onRetry; a new value clears the error and renders children again. */
  resetKey: number;
  /** Remount the map (the explorer bumps resetKey and the map's own key). */
  onRetry: () => void;
  children: ReactNode;
};

type State = { error: Error | null; resetKey: number };

export class MapErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null, resetKey: props.resetKey };
  }

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  // A new resetKey is the Retry landing: clear the error so the children —
  // remounted under their own new key — get another try.
  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey === state.resetKey
      ? null
      : { error: null, resetKey: props.resetKey };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[wine-map] the map crashed; showing the Retry card", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    // React.lazy (which next/dynamic wraps) keeps a rejected import rejected,
    // so remounting would only rethrow the same chunk error; a page load is
    // what fetches the current deployment's chunks.
    return (
      <MapUnavailableCard
        onRetry={isChunkLoadError(error) ? () => window.location.reload() : this.props.onRetry}
      />
    );
  }
}
