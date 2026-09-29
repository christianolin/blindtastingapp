// The ONE import site of ./training-map (training-room-map spec RM11, RM24):
// the map slot's React.lazy and TrainingRoom's warm-up both call this, so the
// bundler emits one chunk and a warmed import is the module the lazy
// component later resolves to. MapLibre touches `window`
// on import, so nothing may import ./training-map statically
// (training-room-map-imports.test.ts pins both rules).
export const loadTrainingMap = () => import("./training-map");
