// The rule-1 guards' refusal (supabase/migrations/20260919213300_rule1_usage_and_main_photo.sql:
// catalog_wines_rule1_guard, catalog_wine_grapes_rule1_guard). Pure, so vitest can load it.
// Relative imports only (vitest has no `@/` alias).
import { attachNotice } from "../catalog-photos/strip";

/** The exact message both guards raise; rule1-guard.test.ts pins it to the migration file. */
export const UNREVEALED_GLASS_EDIT =
  "This wine is in one of your flights that hasn't been revealed yet. Change it after the reveal.";

/** The wine page's own photo line for the same case (attach_catalog_wine_photo's
    `unrevealed-glass`), shown when setCatalogWineImage is refused by the guard. */
export const UNREVEALED_GLASS_PHOTO: string = attachNotice("unrevealed-glass") ?? UNREVEALED_GLASS_EDIT;

/** The guards' refusal of the caller's own write: 42501 with exactly that message. RLS's own
    42501s ("new row violates row-level security policy …") are not this. */
export function isUnrevealedGlassRefusal(
  error: { code?: string | null; message?: string | null } | null | undefined,
): boolean {
  return error?.code === "42501" && error?.message === UNREVEALED_GLASS_EDIT;
}
