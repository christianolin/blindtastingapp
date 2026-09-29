"use client";

// The training room's own error boundary around its map (training-room-map
// spec RM22), deliberately not the explorer's MapErrorBoundary: that one
// carries the explorer's card and copy, and importing it cost the room's first
// load for code the room never shows (spec §12's budget). A chunk that could
// not load (isChunkLoadError) renders fallback(true), "needs a page reload",
// since a rejected import stays rejected; any other render error renders
// fallback(false), "stopped" with a retry. The slot keys it by the reducer's
// attempt, so a retry mounts a fresh boundary with no error.
//
// Only relative imports: room-map-boundary.test.ts loads it in vitest.
import { Component, type ErrorInfo, type ReactNode } from "react";
import { isChunkLoadError } from "../../../lib/chunk-load-error";

type Props = { fallback: (isChunk: boolean) => ReactNode; children: ReactNode };
type State = { failed: null | "chunk" | "render" };

export class RoomMapBoundary extends Component<Props, State> {
  state: State = { failed: null };

  static getDerivedStateFromError(error: unknown): State {
    return { failed: isChunkLoadError(error) ? "chunk" : "render" };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[training-map] the map crashed; showing the room's fallback", error, info.componentStack);
  }

  render() {
    const { failed } = this.state;
    return failed ? this.props.fallback(failed === "chunk") : this.props.children;
  }
}
