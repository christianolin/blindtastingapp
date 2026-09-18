import { describe, expect, it } from "vitest";
import { safeNext } from "../safe-next";
import { acceptPath, confirmHashRedirect, inviteUrl, isCodeShape, landingPath, loginHref, normaliseCode, signupHref } from "./links";

const CODE = "NEB7K2QX4M";
describe("invite links (spec §3, D12, D13)", () => {
  it("paths", () => {
    expect(landingPath(CODE)).toBe("/invite/NEB7K2QX4M");
    expect(acceptPath(CODE)).toBe("/invite/NEB7K2QX4M/accept");
    expect(signupHref(CODE)).toBe("/signup?next=%2Finvite%2FNEB7K2QX4M%2Faccept");
    expect(loginHref(CODE)).toBe("/login?next=%2Finvite%2FNEB7K2QX4M%2Faccept");
  });
  it("every next survives safeNext unchanged", () => {
    for (const p of [landingPath(CODE), acceptPath(CODE)]) expect(safeNext(p)).toBe(p);
    expect(safeNext(new URL(signupHref(CODE), "https://x.test").searchParams.get("next"))).toBe(acceptPath(CODE));
  });
  it("absolute urls strip a trailing slash and keep the site", () => {
    expect(inviteUrl("https://blindr.example/", CODE)).toBe("https://blindr.example/invite/NEB7K2QX4M");
    expect(confirmHashRedirect("https://blindr.example", CODE)).toBe("https://blindr.example/auth/confirm-hash?next=/invite/NEB7K2QX4M/accept");
  });
  it("code normalisation and shape", () => {
    expect(normaliseCode("  neb7k2qx4m ")).toBe("NEB7K2QX4M");
    expect(isCodeShape("NEB7K2QX4M")).toBe(true);
    expect(isCodeShape("NEB7K2")).toBe(false); // a 6-character tasting code is not a platform code
    expect(isCodeShape("NEB7K2QX40")).toBe(false); // 0 is outside the alphabet
    expect(isCodeShape("../accept")).toBe(false);
  });
});
