import { describe, expect, it } from "vitest";
import { detectCanScan, forcedCanScan } from "./use-can-scan";

const mm = (coarse: boolean) => () => ({ matches: coarse });
const devices = (kinds: string[], extra: Record<string, unknown> = {}) =>
  ({ enumerateDevices: async () => kinds.map((kind) => ({ kind })), getUserMedia: async () => ({}), ...extra }) as unknown as MediaDevices;

describe("detectCanScan (D5)", () => {
  it("coarse pointer + a videoinput", async () => expect(await detectCanScan({ matchMedia: mm(true), mediaDevices: devices(["audioinput", "videoinput"]) })).toBe(true));
  it("coarse pointer, no videoinput", async () => expect(await detectCanScan({ matchMedia: mm(true), mediaDevices: devices(["audioinput"]) })).toBe(false));
  it("fine pointer", async () => expect(await detectCanScan({ matchMedia: mm(false), mediaDevices: devices(["videoinput"]) })).toBe(false));
  it("no enumerateDevices → getUserMedia presence", async () =>
    expect(await detectCanScan({ matchMedia: mm(true), mediaDevices: { getUserMedia: async () => ({}) } as unknown as MediaDevices })).toBe(true));
  it("enumerateDevices throws → getUserMedia presence", async () =>
    expect(await detectCanScan({ matchMedia: mm(true), mediaDevices: devices([], { enumerateDevices: async () => { throw new Error("denied"); } }) })).toBe(true));
  it("no mediaDevices", async () => expect(await detectCanScan({ matchMedia: mm(true), mediaDevices: undefined })).toBe(false));
});

it("forcedCanScan only outside production", () => {
  expect(forcedCanScan({ NODE_ENV: "development", NEXT_PUBLIC_FORCE_CAN_SCAN: "1" })).toBe(true);
  expect(forcedCanScan({ NODE_ENV: "production", NEXT_PUBLIC_FORCE_CAN_SCAN: "1" })).toBe(false);
  expect(forcedCanScan({ NODE_ENV: "development" })).toBe(false);
});
