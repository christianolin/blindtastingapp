import { describe, expect, it } from "vitest";
import { FIRST_NAME_REQUIRED, fullName } from "./full-name";

describe("fullName", () => {
  it("joins first and last name with one space", () => {
    expect(fullName("Christian", "Olin")).toBe("Christian Olin");
  });

  it("leaves the last name out when it is empty or blank", () => {
    expect(fullName("Anna", "")).toBe("Anna");
    expect(fullName("Anna", "   ")).toBe("Anna");
  });

  it("trims and collapses inner whitespace", () => {
    expect(fullName("  Anna  Marie ", "  de   la Cruz ")).toBe("Anna Marie de la Cruz");
  });

  it("is empty when both are blank", () => {
    expect(fullName("", " ")).toBe("");
  });
});

describe("FIRST_NAME_REQUIRED", () => {
  it("is the refusal copy", () => {
    expect(FIRST_NAME_REQUIRED).toBe("Please enter your first name.");
  });
});
