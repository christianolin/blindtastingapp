import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Levels spec L33: both cellar adds re-render the cellar layout's AppHeader,
// so the "+N XP" card shows at once (/cellar/new router.pushes inside that
// layout, and the add-wine sheet's merge card otherwise re-renders nothing
// until the sheet closes).
const source = readFileSync("src/app/cellar/new/actions.ts", "utf8").replace(/\r/g, "");

function body(name: string): string {
  const at = source.indexOf(`export async function ${name}(`);
  if (at < 0) throw new Error(`no ${name}`);
  const next = source.indexOf("\nexport ", at + 1);
  return source.slice(at, next < 0 ? undefined : next);
}

describe("cellar adds revalidate /cellar (L33)", () => {
  it("addCellarLot, after the lot is saved", () => {
    const b = body("addCellarLot");
    expect(b).toContain('revalidatePath("/cellar");');
    expect(b.indexOf('revalidatePath("/cellar");')).toBeGreaterThan(b.indexOf('rpc("add_cellar_lot"'));
  });
  it("increaseCellarLotQuantity, after the update", () => {
    const b = body("increaseCellarLotQuantity");
    expect(b).toContain('revalidatePath("/cellar");');
    expect(b.indexOf('revalidatePath("/cellar");')).toBeGreaterThan(b.indexOf("if (error) throw new Error(error.message);"));
  });
});
