"use client";

// Where the likelihood map mounts, in the laptop column and the phone sheet
// alike (training-room-map spec RM11, RM22). TrainingMap is its own chunk,
// loaded through React.lazy from the one loader the warm-up shares, under a
// Suspense showing the map box's placeholder, and only rendered here — which
// the panel and the sheet render only while the Map view is open. React.lazy,
// not next/dynamic (which wraps it): next/dynamic's own runtime alone cost the
// room's first load ~1.5 KB gzip of the 3 KB budget (spec §12). It needs no
// `ssr: false` either: the view starts on List on the server and on every
// page visit (RM19), so the map is never rendered, and its chunk (MapLibre
// touches `window` on import) never imported, outside the browser.
//
// Failures: a chunk that could not load (from the room's own boundary, from a
// warm-up that already failed, or MapLibre's own lazy chunk rejecting inside
// the map: fault "reload") shows "needs a page reload"; a render error shows
// "stopped" with a retry in place; a lost WebGL context or a map that could
// not start reports onStopped, and the room goes back to List (RM22). Each
// retry remounts the boundary and the map under a new key (the reducer's
// attempt).
import { Suspense, lazy } from "react";
import { isChunkLoadError } from "@/lib/chunk-load-error";
import { MapFallback, MapLoading } from "./map-fallback";
import type { TrainingMapProps } from "./map-types";
import { RoomMapBoundary } from "./room-map-boundary";
import type { RoomMap } from "./room-map-state";
import { loadTrainingMap } from "./training-map-loader";

const TrainingMap = lazy(() => loadTrainingMap().then((m) => ({ default: m.TrainingMap })));

export function RoomMapSlot({ roomMap, ...props }: { roomMap: RoomMap } & Omit<TrainingMapProps, "onStopped">) {
  const { state, dispatch } = roomMap;
  if (state.fault === "reload") return <MapFallback kind="reload" />;
  return (
    // Keyed by the reducer's attempt: a retry remounts the boundary (clearing
    // its error) and the map under it.
    <RoomMapBoundary
      key={state.attempt}
      fallback={(isChunk) =>
        isChunk ? (
          <MapFallback kind="reload" />
        ) : (
          <MapFallback kind="stopped" onAction={() => dispatch({ type: "retry" })} />
        )
      }
    >
      <Suspense fallback={<MapLoading />}>
        <TrainingMap
          {...props}
          onStopped={(error) => dispatch({ type: isChunkLoadError(error) ? "chunkFailed" : "stopped" })}
        />
      </Suspense>
    </RoomMapBoundary>
  );
}
