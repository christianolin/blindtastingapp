import { describe, expect, it } from "vitest";
import {
  FORGOT_PASSWORD_PATH,
  PASSWORD_SET_FLAG,
  RESET_NEXT,
  SET_PASSWORD_PATH,
  hasPasswordFlag,
  setPasswordHref,
} from "./paths";

describe("auth paths", () => {
  it("names the two pages", () => {
    expect(SET_PASSWORD_PATH).toBe("/auth/set-password");
    expect(FORGOT_PASSWORD_PATH).toBe("/login/forgot");
  });

  it("builds the setup href with an encoded next", () => {
    expect(setPasswordHref("/overview")).toBe("/auth/set-password?next=%2Foverview");
    expect(setPasswordHref("/invite/ABCDEFGHJK?x=1")).toBe(
      "/auth/set-password?next=%2Finvite%2FABCDEFGHJK%3Fx%3D1",
    );
  });

  it("drops an unsafe or missing next", () => {
    expect(setPasswordHref(null)).toBe("/auth/set-password");
    expect(setPasswordHref("https://evil.example")).toBe("/auth/set-password");
    expect(setPasswordHref("//evil.example")).toBe("/auth/set-password");
  });

  it("never nests the set-password page as its own next", () => {
    expect(setPasswordHref("/auth/set-password?next=%2Foverview")).toBe("/auth/set-password");
  });

  it("builds the reset href", () => {
    expect(setPasswordHref(null, "reset")).toBe("/auth/set-password?reason=reset");
    expect(RESET_NEXT).toBe("/auth/set-password?reason=reset");
  });

  it("reads the password flag strictly", () => {
    expect(PASSWORD_SET_FLAG).toBe("password_set");
    expect(hasPasswordFlag({ password_set: true })).toBe(true);
    expect(hasPasswordFlag({ password_set: "true" })).toBe(false);
    expect(hasPasswordFlag({})).toBe(false);
    expect(hasPasswordFlag(null)).toBe(false);
    expect(hasPasswordFlag(undefined)).toBe(false);
  });
});
