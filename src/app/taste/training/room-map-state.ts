// The candidates column's List | Map choice and the map's failure state
// (training-room-map spec RM19, RM22), as a pure reducer TrainingRoom owns.
// It lives in TrainingRoom, not the panel or the sheet, so it survives the
// phone sheet closing and reopening and a new session started without a
// reload, and resets with the page: every page visit starts on List. It is
// never written to browser storage — a remembered "Map" would make the map
// the default by stealth (training-room-map-imports.test.ts pins that).
//
// Plain module: no React, so vitest pins it.

export type CandidatesView = "list" | "map";

/** null: healthy. "stopped": a lost WebGL context or a map that could not
    start — back to List with a line and "Try the map again". "reload": its
    code could not load (a rejected import stays rejected), so only a page
    reload helps. */
export type MapFault = null | "stopped" | "reload";

export type RoomMapState = {
  view: CandidatesView;
  fault: MapFault;
  /** Bumped by every retry: the map remounts under a new key. */
  attempt: number;
};

export type RoomMapAction =
  { type: "select"; view: CandidatesView } | { type: "stopped" } | { type: "retry" } | { type: "chunkFailed" };

export const ROOM_MAP_START: RoomMapState = {
  view: "list",
  fault: null,
  attempt: 0,
};

export function roomMapReducer(state: RoomMapState, action: RoomMapAction): RoomMapState {
  switch (action.type) {
    case "select":
      if (action.view === state.view) return state;
      // Choosing Map again after it stopped is a retry.
      if (action.view === "map" && state.fault === "stopped") {
        return { view: "map", fault: null, attempt: state.attempt + 1 };
      }
      return { ...state, view: action.view };
    case "stopped":
      // A chunk that never loaded outranks a map that stopped.
      if (state.fault === "reload") return state;
      return { ...state, view: "list", fault: "stopped" };
    case "retry":
      if (state.fault === "reload") return { ...state, view: "map" };
      return { view: "map", fault: null, attempt: state.attempt + 1 };
    case "chunkFailed":
      return state.fault === "reload" ? state : { ...state, fault: "reload" };
  }
}

/** The build-time kill switch (RM19): NEXT_PUBLIC_TRAINING_MAP=0 hides the Map
    tab and the room is exactly R1. Unset, or any other value, means on. */
export function trainingMapEnabled(value: string | undefined): boolean {
  return value !== "0";
}

// Next inlines NEXT_PUBLIC_ variables at build time, so this reads the value
// the deployment was BUILT with: turning it off is an env change and a
// redeploy, not a code revert.
export const TRAINING_MAP_ENABLED = trainingMapEnabled(process.env.NEXT_PUBLIC_TRAINING_MAP);

/** What the panel and the sheet get from TrainingRoom; null when the switch is off. */
export type RoomMap = {
  state: RoomMapState;
  dispatch: (action: RoomMapAction) => void;
  /** Warm on intent (RM24): the map's code and the basemap style, once. */
  warm: () => void;
};
