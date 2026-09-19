import { describe, expect, it } from "vitest";
import { PASSWORD_SET_FLAG, SET_PASSWORD_PATH } from "./paths";
import {
  isPasswordGatedRequest,
  needsPassword,
  passwordStepRedirect,
  passwordStepTarget,
} from "./password-gate";

const INVITED = "2026-09-18T10:00:00Z";

describe("needsPassword", () => {
  it("is false with no user", () => {
    expect(needsPassword(null)).toBe(false);
    expect(needsPassword(undefined)).toBe(false);
  });

  it("is false for an account that was never invited", () => {
    expect(needsPassword({ invited_at: undefined, user_metadata: {} })).toBe(false);
    expect(needsPassword({ invited_at: null, user_metadata: {} })).toBe(false);
    expect(needsPassword({ invited_at: "", user_metadata: {} })).toBe(false);
  });

  it("is true for an invited account with no flag", () => {
    expect(needsPassword({ invited_at: INVITED, user_metadata: {} })).toBe(true);
    expect(needsPassword({ invited_at: INVITED, user_metadata: null })).toBe(true);
    expect(needsPassword({ invited_at: INVITED })).toBe(true);
  });

  it("is false once the flag is exactly true", () => {
    expect(
      needsPassword({ invited_at: INVITED, user_metadata: { [PASSWORD_SET_FLAG]: true } }),
    ).toBe(false);
  });

  it("does not count a flag that is only truthy", () => {
    for (const value of ["true", 1, "yes", {}, false, null]) {
      expect(
        needsPassword({ invited_at: INVITED, user_metadata: { [PASSWORD_SET_FLAG]: value } }),
        String(value),
      ).toBe(true);
    }
  });
});

describe("isPasswordGatedRequest", () => {
  it("gates ordinary page GETs and HEADs", () => {
    for (const path of [
      "/",
      "/overview",
      "/taste",
      "/tastings/abc",
      "/tastings/abc/play",
      "/j/ABCDEFGHJK",
      "/invite/ABCDEFGHJK",
      "/invite/ABCDEFGHJK/accept",
      "/u/123",
      "/profile/edit",
    ]) {
      expect(isPasswordGatedRequest("GET", path), path).toBe(true);
      expect(isPasswordGatedRequest("HEAD", path), path).toBe(true);
    }
  });

  it("accepts the method in any case", () => {
    expect(isPasswordGatedRequest("get", "/overview")).toBe(true);
    expect(isPasswordGatedRequest("head", "/overview")).toBe(true);
  });

  it("never gates a non-GET/HEAD request (server actions POST)", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
      expect(isPasswordGatedRequest(method, "/overview"), method).toBe(false);
      expect(isPasswordGatedRequest(method, "/tastings/abc"), method).toBe(false);
    }
  });

  it("never gates the auth routes, set-password included", () => {
    for (const path of [
      "/auth",
      SET_PASSWORD_PATH,
      "/auth/confirm",
      "/auth/confirm-hash",
      "/auth/callback",
    ]) {
      expect(isPasswordGatedRequest("GET", path), path).toBe(false);
    }
  });

  it("never gates login and signup, or anything under them", () => {
    for (const path of ["/login", "/login/forgot", "/signup", "/signup/anything"]) {
      expect(isPasswordGatedRequest("GET", path), path).toBe(false);
    }
  });

  it("matches the open prefixes by whole segment only", () => {
    for (const path of ["/authors", "/loginx", "/signups", "/apiary", "/_nextx"]) {
      expect(isPasswordGatedRequest("GET", path), path).toBe(true);
    }
  });

  it("never gates API and framework paths", () => {
    for (const path of ["/api", "/api/anything", "/_next/webpack-hmr", "/_next/data/x"]) {
      expect(isPasswordGatedRequest("GET", path), path).toBe(false);
    }
  });

  it("never gates a path whose last segment has a file extension", () => {
    for (const path of [
      "/tastings/abc/calendar.ics",
      "/tastings/abc/export.csv",
      "/robots.txt",
      "/manifest.webmanifest",
      "/icon.svg",
    ]) {
      expect(isPasswordGatedRequest("GET", path), path).toBe(false);
    }
  });

  it("does not read a dot elsewhere in the path as an extension", () => {
    expect(isPasswordGatedRequest("GET", "/a.b/tastings")).toBe(true);
    expect(isPasswordGatedRequest("GET", "/.well-known")).toBe(true);
    expect(isPasswordGatedRequest("GET", "/tastings/abc.")).toBe(true);
  });

  it("never gates generated metadata images", () => {
    for (const path of ["/apple-icon", "/icon", "/opengraph-image", "/twitter-image"]) {
      expect(isPasswordGatedRequest("GET", path), path).toBe(false);
    }
  });
});

describe("passwordStepTarget", () => {
  it("sends the request back to itself through next", () => {
    expect(passwordStepTarget("/tastings/abc", "")).toEqual({
      pathname: SET_PASSWORD_PATH,
      search: "?next=%2Ftastings%2Fabc",
    });
  });

  it("keeps the query string in next", () => {
    expect(passwordStepTarget("/invite/ABCDEFGHJK/accept", "?x=1&y=2")).toEqual({
      pathname: SET_PASSWORD_PATH,
      search: "?next=%2Finvite%2FABCDEFGHJK%2Faccept%3Fx%3D1%26y%3D2",
    });
  });

  it("drops a next that could leave the site", () => {
    expect(passwordStepTarget("//evil.example", "")).toEqual({
      pathname: SET_PASSWORD_PATH,
      search: "",
    });
    expect(passwordStepTarget("/\\evil.example", "")).toEqual({
      pathname: SET_PASSWORD_PATH,
      search: "",
    });
  });
});

describe("passwordStepRedirect", () => {
  const invited = { invited_at: INVITED, user_metadata: {} };

  it("redirects an invited account without a password on a gated page", () => {
    expect(
      passwordStepRedirect(invited, { method: "GET", pathname: "/overview", search: "" }),
    ).toEqual({ pathname: SET_PASSWORD_PATH, search: "?next=%2Foverview" });
  });

  it("leaves everyone else alone", () => {
    expect(
      passwordStepRedirect(null, { method: "GET", pathname: "/overview", search: "" }),
    ).toBeNull();
    expect(
      passwordStepRedirect(
        { invited_at: INVITED, user_metadata: { [PASSWORD_SET_FLAG]: true } },
        { method: "GET", pathname: "/overview", search: "" },
      ),
    ).toBeNull();
    expect(
      passwordStepRedirect(
        { invited_at: null, user_metadata: {} },
        { method: "GET", pathname: "/overview", search: "" },
      ),
    ).toBeNull();
  });

  it("leaves open paths and non-GET requests alone even for an invited account", () => {
    expect(
      passwordStepRedirect(invited, { method: "GET", pathname: SET_PASSWORD_PATH, search: "" }),
    ).toBeNull();
    expect(
      passwordStepRedirect(invited, { method: "POST", pathname: "/overview", search: "" }),
    ).toBeNull();
    expect(
      passwordStepRedirect(invited, {
        method: "GET",
        pathname: "/tastings/abc/calendar.ics",
        search: "",
      }),
    ).toBeNull();
  });
});
