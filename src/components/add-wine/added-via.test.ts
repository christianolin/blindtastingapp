import { expect, it } from "vitest";
import { emptyDraft } from "../../lib/wine-identity/complete";
import { addedVia } from "./added-via";

it.each([
  [{ kind: "catalog", catalogWineId: "c", via: "scan" }, "SCAN"],
  [{ kind: "catalog", catalogWineId: "c", via: "search" }, "CATALOG"],
  [{ kind: "lot", lotId: "l", consume: true }, "CELLAR"],
  [{ kind: "identity", draft: emptyDraft(), via: "scan", readId: null }, "SCAN"],
  [{ kind: "identity", draft: emptyDraft(), via: "byhand", readId: null }, "BY_HAND"],
  [{ kind: "incomplete", draft: emptyDraft(), via: "scan" }, "SCAN"],
  [{ kind: "incomplete", draft: emptyDraft(), via: "byhand" }, "BY_HAND"],
  [{ kind: "unidentified", draft: emptyDraft() }, "BY_HAND"],
  [{ kind: "plusOne", lotId: "l" }, null],
] as const)("%j → %s", (source, via) => expect(addedVia(source)).toBe(via));
