// A code-split chunk that failed to load — typically a tab still running the
// previous deployment asking for a chunk the new one no longer serves.
// Webpack names it ChunkLoadError ("Loading chunk 123 failed."); Turbopack
// throws a plain Error ("Failed to load chunk /_next/static/…"). Only a page
// load fixes one: React.lazy (which next/dynamic wraps) keeps a rejected
// import rejected. The training room's copy of the explorer's own test
// (src/app/knowledge/map/map-error-boundary.tsx's isChunkLoadError), so the
// room's map can tell a failed chunk without pulling the explorer's boundary
// and card into the room's first load (training-room-map spec §12), and
// without touching that collaborator-edited file. chunk-load-error.test.ts
// pins that the two agree. No imports: vitest loads it as is.
export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === "ChunkLoadError" ||
    /^Failed to load chunk /.test(error.message) ||
    /^Loading (CSS )?chunk \S+ failed/i.test(error.message)
  );
}
