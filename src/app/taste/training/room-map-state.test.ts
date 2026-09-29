import { describe, expect, it } from "vitest";
import { ROOM_MAP_START, roomMapReducer, trainingMapEnabled, type RoomMapState } from "./room-map-state";

// The List | Map choice and the map's failure state (training-room-map spec
// RM19, RM22).

const at = (s: Partial<RoomMapState>): RoomMapState => ({
  ...ROOM_MAP_START,
  ...s,
});

describe("roomMapReducer", () => {
  it("starts on List, healthy, at attempt 0", () => {
    expect(ROOM_MAP_START).toEqual({ view: "list", fault: null, attempt: 0 });
  });

  it("selects a view; the same view again is a no-op (same object)", () => {
    expect(roomMapReducer(ROOM_MAP_START, { type: "select", view: "map" })).toEqual(at({ view: "map" }));
    expect(roomMapReducer(ROOM_MAP_START, { type: "select", view: "list" })).toBe(ROOM_MAP_START);
  });

  it("a stopped map goes back to List with the fault; Try again remounts it on Map", () => {
    const stopped = roomMapReducer(at({ view: "map" }), { type: "stopped" });
    expect(stopped).toEqual({ view: "list", fault: "stopped", attempt: 0 });
    expect(roomMapReducer(stopped, { type: "retry" })).toEqual({
      view: "map",
      fault: null,
      attempt: 1,
    });
  });

  it("choosing Map again after it stopped is a retry too", () => {
    const stopped = at({ fault: "stopped" });
    expect(roomMapReducer(stopped, { type: "select", view: "map" })).toEqual({
      view: "map",
      fault: null,
      attempt: 1,
    });
  });

  it("a failed chunk sticks: Map shows the reload state, and nothing clears it", () => {
    const failed = roomMapReducer(ROOM_MAP_START, { type: "chunkFailed" });
    expect(failed).toEqual({ view: "list", fault: "reload", attempt: 0 });
    expect(roomMapReducer(failed, { type: "select", view: "map" })).toEqual({
      view: "map",
      fault: "reload",
      attempt: 0,
    });
    expect(roomMapReducer(failed, { type: "stopped" })).toBe(failed);
    expect(roomMapReducer(failed, { type: "retry" }).fault).toBe("reload");
    expect(roomMapReducer(failed, { type: "chunkFailed" })).toBe(failed);
  });
});

describe("trainingMapEnabled (the kill switch)", () => {
  it("is off only for '0'", () => {
    expect(trainingMapEnabled("0")).toBe(false);
    expect(trainingMapEnabled(undefined)).toBe(true);
    expect(trainingMapEnabled("")).toBe(true);
    expect(trainingMapEnabled("1")).toBe(true);
  });
});
