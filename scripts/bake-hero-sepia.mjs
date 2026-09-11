// Bakes the redesign's photo treatment — CSS `filter: sepia(.24) saturate(.9)`
// — into public/hero/romanee-sepia.webp so the Overview band and the About
// hero can show the photo without a runtime CSS filter. A filter on a large
// image is re-rasterised as the page scrolls past it, which is what made the
// Overview page scroll chunkily; a pre-filtered file costs nothing at
// scroll time and looks identical. Re-run whenever romanee.webp changes:
//   node scripts/bake-hero-sepia.mjs
import sharp from "sharp";
import { statSync } from "node:fs";

const SRC = "public/hero/romanee.webp";
const OUT = "public/hero/romanee-sepia.webp";

// sepia(a) per the Filter Effects spec: the full-sepia matrix interpolated
// toward identity by (1 - a). saturate(.9) follows, as in the CSS order.
const a = 0.24;
const t = 1 - a;
const sepia = [
  [0.393 + 0.607 * t, 0.769 - 0.769 * t, 0.189 - 0.189 * t],
  [0.349 - 0.349 * t, 0.686 + 0.314 * t, 0.168 - 0.168 * t],
  [0.272 - 0.272 * t, 0.534 - 0.534 * t, 0.131 + 0.869 * t],
];

const meta = await sharp(SRC).metadata();
await sharp(SRC)
  .recomb(sepia)
  .modulate({ saturation: 0.9 })
  .webp({ quality: 82 })
  .toFile(OUT);
console.log(
  `${OUT}: ${meta.width}x${meta.height}, ${statSync(OUT).size} bytes (from ${statSync(SRC).size})`,
);
