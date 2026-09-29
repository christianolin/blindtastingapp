import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Source rules for the likelihood map (training-room-map spec RM1, RM11,
// RM19, RM24, §11 "source tests"). vitest has no bundler, so these read the
// files: the map is its own chunk, imported from one place, mounted only in
// the Map view, and nothing about it reaches a tasting or the room's first load.

const HERE = fileURLToPath(new URL(".", import.meta.url));
const SRC = path.resolve(HERE, "../../..");
const read = (file: string) => readFileSync(path.join(HERE, file), "utf8");
const rel = (file: string) => path.relative(SRC, file).split(path.sep).join("/");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}
const ALL = walk(SRC).map((f) => ({
  file: rel(f),
  text: readFileSync(f, "utf8"),
}));
const isTest = (file: string) => /\.test\.tsx?$/.test(file);
const ROOM = "app/taste/training/";

/** Import specifiers of `text`: static `from "x"`, side-effect `import "x"` and dynamic `import("x")`,
    each with whether it is a type-only import. */
function imports(text: string): { spec: string; typeOnly: boolean }[] {
  const out: { spec: string; typeOnly: boolean }[] = [];
  for (const m of text.matchAll(/^\s*import\s+(type\s+)?[^;'"]*?from\s+["']([^"']+)["']/gm)) {
    out.push({ spec: m[2], typeOnly: Boolean(m[1]) });
  }
  for (const m of text.matchAll(/^\s*import\s+["']([^"']+)["']/gm)) out.push({ spec: m[1], typeOnly: false });
  for (const m of text.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) out.push({ spec: m[1], typeOnly: false });
  return out;
}
const importsMap = (spec: string) => /(^|\/)training-map$/.test(spec);
const importsMapView = (spec: string) => /(^|\/)map-view$/.test(spec);

describe("the likelihood map's chunk (RM11, RM24)", () => {
  it("./training-map is imported only by training-map-loader.ts", () => {
    const importers = ALL.filter(({ text }) => imports(text).some((i) => importsMap(i.spec))).map((f) => f.file);
    expect(importers).toEqual([`${ROOM}training-map-loader.ts`]);
    expect(read("training-map-loader.ts")).toMatch(
      /export const loadTrainingMap = \(\) => import\("\.\/training-map"\);/,
    );
  });

  it("loadTrainingMap is used by the dynamic(…, { ssr: false }) call and the warm-up, and nowhere else", () => {
    const users = ALL.filter(
      ({ file, text }) => !isTest(file) && !file.endsWith("training-map-loader.ts") && /\bloadTrainingMap\b/.test(text),
    ).map((f) => f.file);
    expect(users.sort()).toEqual([`${ROOM}room-map-slot.tsx`, `${ROOM}training-room.tsx`]);
    expect(read("room-map-slot.tsx")).toMatch(
      /dynamic\(\(\) => loadTrainingMap\(\)\.then\(\(m\) => m\.TrainingMap\), \{\s*ssr: false,/,
    );
    expect(read("training-room.tsx")).toMatch(/loadTrainingMap\(\)\.catch\(/);
  });

  it("TrainingMap is rendered only by the slot, and the slot only inside the Map view", () => {
    const renderers = ALL.filter(({ file, text }) => !isTest(file) && /<TrainingMap\b/.test(text)).map((f) => f.file);
    expect(renderers).toEqual([`${ROOM}room-map-slot.tsx`]);
    // The laptop column: only while Map is open, and only at lg+.
    expect(read("candidates-panel.tsx")).toMatch(/\{mapView && wide \? \(\s*<RoomMapSlot\b/);
    // The phone sheet: only in its map branch, below lg, and never on a short screen.
    const sheet = read("candidates-sheet.tsx");
    const branch = sheet.indexOf("if (!roomMap || !mapView) {");
    const elseAt = sheet.indexOf("} else {", branch);
    expect(branch).toBeGreaterThan(-1);
    expect(sheet.indexOf("<RoomMapSlot")).toBeGreaterThan(elseAt);
    expect(sheet).toMatch(/short \? \(\s*<MapUpright[\s\S]*?\) : !wide \? \(\s*<RoomMapSlot\b/);
  });

  it("no room file but training-map.tsx has a value import of maplibre-gl or react-map-gl", () => {
    const offenders = ALL.filter(({ file }) => file.startsWith(ROOM) && !file.endsWith("training-map.tsx"))
      .filter(({ text }) => imports(text).some((i) => !i.typeOnly && /^(maplibre-gl|react-map-gl)(\/|$)/.test(i.spec)))
      .map((f) => f.file);
    expect(offenders).toEqual([]);
  });

  it("no room file outside the chunk statically imports basemap or map-palette (the warm-up uses import())", () => {
    const CHUNK = [`${ROOM}training-map.tsx`];
    const offenders = ALL.filter(({ file }) => file.startsWith(ROOM) && !CHUNK.includes(file) && !isTest(file))
      .filter(({ text }) =>
        [...text.matchAll(/^\s*import\s+(?!type\b)[^;'"]*?from\s+["']([^"']+)["']/gm)].some((m) =>
          /\/wine-map\/(basemap|map-palette)$/.test(m[1]),
        ),
      )
      .map((f) => f.file);
    expect(offenders).toEqual([]);
    expect(read("training-room.tsx")).toMatch(/import\("@\/lib\/wine-map\/basemap"\)/);
  });
});

describe("the map stays in the training room (RM1)", () => {
  it("no non-test file outside src/app/taste/training/ imports training-map or map-view (map-view's own module aside)", () => {
    const offenders = ALL.filter(
      ({ file }) => !isTest(file) && !file.startsWith(ROOM) && !/^lib\/training\/map-view/.test(file),
    )
      .filter(({ text }) => imports(text).some((i) => importsMap(i.spec) || importsMapView(i.spec)))
      .map((f) => f.file);
    expect(offenders).toEqual([]);
  });

  it("map-view is imported only by training-map.tsx and its own test", () => {
    const importers = ALL.filter(({ text }) => imports(text).some((i) => importsMapView(i.spec))).map((f) => f.file);
    expect(importers.sort()).toEqual(["app/taste/training/training-map.tsx", "lib/training/map-view.test.ts"]);
  });
});

describe("the theme contract (RM21, CLAUDE.md: never pass a changing mapStyle)", () => {
  it("mapStyle is frozen at mount and passed once; a flip goes through setStyle with withWineLayers", () => {
    const map = read("training-map.tsx");
    expect(map).toMatch(/const \[mountStyle\] = useState<StyleSpecification \| string>\(/);
    expect(map.match(/mapStyle=/g)).toEqual(["mapStyle="]);
    expect(map).toContain("mapStyle={mountStyle}");
    expect(map).toMatch(/transformStyle: \(prev, incoming\) => \{[\s\S]*?withWineLayers\(prev, tuneBasemapStyle\(incoming\)\)/);
  });
});

describe("the List | Map choice is never stored (RM19)", () => {
  it("map-switch, room-map-state, training-room and training-map never touch browser storage", () => {
    for (const file of ["map-switch.tsx", "room-map-state.ts", "training-room.tsx", "training-map.tsx"]) {
      expect(read(file), file).not.toMatch(/localStorage|sessionStorage|safe-storage/);
    }
  });
});
