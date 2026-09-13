import { describe, expect, it } from "vitest";
import { csvDocument, csvRow } from "./csv";

describe("csv (RFC 4180 and the formula guard)", () => {
  it("quotes only when needed", () => {
    expect(csvRow(["a", "b", 3, null])).toBe("a,b,3,");
    expect(csvRow(["a,b"])).toBe('"a,b"');
    expect(csvRow(['He said "hi"'])).toBe('"He said ""hi"""');
    expect(csvRow(["line1\nline2"])).toBe('"line1\nline2"');
  });
  it("neutralises formula starts in strings, never in numbers", () => {
    expect(csvRow(["=SUM(A1)", "+1", "-2", "@cmd", -2])).toBe("'=SUM(A1),'+1,'-2,'@cmd,-2");
    expect(csvRow(["=a,b"])).toBe("\"'=a,b\"");
  });
  it("a document ends every row with CRLF", () => {
    expect(csvDocument([["glass", "revealed"], [1, "yes"]])).toBe("glass,revealed\r\n1,yes\r\n");
  });
  it("also guards tab and carriage-return starts; a non-finite number exports empty", () => {
    expect(csvRow(["\t=cmd", "\r=cmd"])).toBe("'\t=cmd,\"'\r=cmd\"");
    expect(csvRow([Number.NaN, Number.NEGATIVE_INFINITY, undefined])).toBe(",,");
    expect(csvDocument([])).toBe("");
  });
});
