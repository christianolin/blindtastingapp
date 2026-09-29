// Arguments for gen-place-profiles-migration.mjs, pure so they can be tested.
//
// REPO used to be hard-coded to one machine (C:/Users/Birchenz/blindtastingapp).
// It is now BLINDR_REPO, else the directory the script runs from, so it works
// on either machine unchanged. --source picks the data file (spec 2026-09-29
// D20: US content lives in its own place-profiles-usa.json, so one person's
// generated migration never applies the other's content). --bare leaves out
// begin;/commit; (D24): the owner's applier owns the transaction, and a commit
// inside the file would commit a --dry rehearsal partway. The default output is
// unchanged.
export const DEFAULT_SOURCE = "data/wine-map/place-profiles.json";

export function genArgs(argv, env = process.env, cwd = process.cwd()) {
  const arg = (flag, fallback) => {
    const i = argv.indexOf(flag);
    if (i === -1) return fallback;
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`${flag} needs a value`);
    return value;
  };
  return {
    repo: env.BLINDR_REPO ?? cwd,
    source: arg("--source", DEFAULT_SOURCE),
    write: argv.includes("--write"),
    bare: argv.includes("--bare"),
    version: arg("--version", "20260915110000"),
    name: arg("--name", "place_profiles_iberia"),
  };
}

export function transactionLines(bare) {
  return bare
    ? {
        open: ["-- No begin;/commit;: the applier owns the transaction (--bare, spec 2026-09-29 D24).", ""],
        close: [],
      }
    : { open: ["begin;", ""], close: ["commit;"] };
}
