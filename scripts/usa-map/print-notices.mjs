// Preload for the owner's applier: prints every Postgres NOTICE/WARNING the
// migration raises (the applier itself drops them), so a --dry run shows the
// refresh timing. Usage:
//   node --env-file=.env.local --import ./scripts/usa-map/print-notices.mjs "$APPLIER" <file> --dry
import { createRequire } from "node:module";
import path from "node:path";

const pg = createRequire(path.join(process.cwd(), "package.json"))("pg");
const connect = pg.Client.prototype.connect;
pg.Client.prototype.connect = function patchedConnect(...args) {
  this.on("notice", (n) => console.log(`${n.severity ?? "NOTICE"}: ${n.message}`));
  return connect.apply(this, args);
};
