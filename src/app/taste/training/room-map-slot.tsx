"use client";

// Where the likelihood map mounts, in the laptop column and the phone sheet
// alike (training-room-map spec RM11, RM22). TrainingMap is its own chunk,
// loaded through next/dynamic with ssr: false (MapLibre touches `window` on
// import) from the one loader the warm-up shares, and only rendered here —
// which the panel and the sheet render only while the Map view is open.
//
// Failures: a chunk that could not load (from the boundary, or a warm-up that
// already failed: fault "reload") shows "needs a page reload"; a render error
// shows "stopped" with a retry in place; a lost WebGL context or a map that
// could not start reports onStopped, and the room goes back to List (RM22).
// Each retry remounts the map under a new key (the reducer's attempt).
import dynamic from "next/dynamic";
import { MapErrorBoundary } from "@/app/knowledge/map/map-error-boundary";
import { MapFallback, MapLoading } from "./map-fallback";
import type { TrainingMapProps } from "./map-types";
import type { RoomMap } from "./room-map-state";
import { loadTrainingMap } from "./training-map-loader";

const TrainingMap = dynamic(() => loadTrainingMap().then((m) => m.TrainingMap), {
  ssr: false,
  loading: () => <MapLoading />,
});

export function RoomMapSlot({ roomMap, ...props }: { roomMap: RoomMap } & Omit<TrainingMapProps, "onStopped">) {
  const { state, dispatch } = roomMap;
  if (state.fault === "reload") return <MapFallback kind="reload" />;
  const retry = () => dispatch({ type: "retry" });
  return (
    <MapErrorBoundary
      resetKey={state.attempt}
      onRetry={retry}
      fallback={(_error, isChunk) =>
        isChunk ? <MapFallback kind="reload" /> : <MapFallback kind="stopped" onRetry={retry} />
      }
    >
      <TrainingMap key={state.attempt} {...props} onStopped={() => dispatch({ type: "stopped" })} />
    </MapErrorBoundary>
  );
}
