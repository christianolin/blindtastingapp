# US-3 tree review: what the promotes lock

Rendered by `scripts/usa-map/render-us3-notes.mjs` from `data/wine-map/usa-california-tree.json`. Keys lock at each batch's promote (spec §8.3). The tree decides (spec D7): a place nests in an AVA only when ≥ 99.5% of it measures inside, or ≥ 90% when UC Davis's `within` names that AVA. Each case below is where UC Davis names a container the tree does not nest the place in; it gets an `OVERLAPS` edge instead when more than 1% overlaps. Changing one needs a `parent_overrides` entry in `usa-tree-config.json` and re-committed tree reports before that batch's catalog renders.

## Core batch (86 places)

### Containers UC Davis names that the tree does not nest in

- El Dorado (`el-dorado`, keyed under united-states.california): UC Davis says within Sierra Foothills; OVERLAPS, 74.87% inside.
- Los Carneros (`north-coast.los-carneros`, keyed under north-coast): UC Davis says within Napa Valley; OVERLAPS, 40.17% inside.
- Los Carneros (`north-coast.los-carneros`, keyed under north-coast): UC Davis says within Sonoma Coast; OVERLAPS, 59.83% inside.
- Los Carneros (`north-coast.los-carneros`, keyed under north-coast): UC Davis says within Sonoma Valley; OVERLAPS, 59.83% inside.
- Mendocino Ridge (`north-coast.mendocino-ridge`, keyed under north-coast): UC Davis says within Mendocino; OVERLAPS, 4.49% inside.
- Russian River Valley (`north-coast.northern-sonoma.russian-river-valley`, keyed under north-coast.northern-sonoma): UC Davis says within Sonoma Coast; OVERLAPS, 87.95% inside.
- Chalk Hill (`north-coast.northern-sonoma.russian-river-valley.chalk-hill`, keyed under north-coast.northern-sonoma.russian-river-valley): UC Davis says within Sonoma Coast; OVERLAPS, 55.98% inside.
- Petaluma Gap (`north-coast.petaluma-gap`, keyed under north-coast): UC Davis says within Sonoma Coast; OVERLAPS, 66.44% inside.
- Pine Mountain-Cloverdale Peak (`north-coast.pine-mountain-cloverdale-peak`, keyed under north-coast): UC Davis says within Northern Sonoma; OVERLAPS, 32.72% inside.
- Rockpile (`north-coast.rockpile`, keyed under north-coast): UC Davis says within Northern Sonoma; OVERLAPS, 19.15% inside.
- Sonoma Valley (`north-coast.sonoma-valley`, keyed under north-coast): UC Davis says within Sonoma Coast; OVERLAPS, 39.65% inside.
- Bennett Valley (`north-coast.sonoma-valley.bennett-valley`, keyed under north-coast.sonoma-valley): UC Davis says within Sonoma Coast; OVERLAPS, 3.24% inside.
- Bennett Valley (`north-coast.sonoma-valley.bennett-valley`, keyed under north-coast.sonoma-valley): UC Davis says within Sonoma Mountain; under 1% overlap, no edge.
- Wild Horse Valley (`north-coast.wild-horse-valley`, keyed under north-coast): UC Davis says within Napa Valley; OVERLAPS, 34.03% inside.

### Nested by the legal record (90% to 99.5% inside)

- `central-coast.paso-robles.creston-district` in `central-coast.paso-robles`: 99.48% inside.
- `central-coast.paso-robles.paso-robles-highlands-district` in `central-coast.paso-robles`: 99.09% inside.
- `central-coast.paso-robles.san-miguel-district` in `central-coast.paso-robles`: 99.15% inside.
- `central-coast.paso-robles.santa-margarita-ranch` in `central-coast.paso-robles`: 99.43% inside.
- `central-coast.paso-robles.templeton-gap-district` in `central-coast.paso-robles`: 98.22% inside.
- `central-coast.san-francisco-bay` in `central-coast`: 96.61% inside.
- `central-coast.santa-maria-valley` in `central-coast`: 98.84% inside.
- `central-coast.santa-ynez-valley.sta-rita-hills` in `central-coast.santa-ynez-valley`: 95.70% inside.
- `north-coast.northern-sonoma.alexander-valley` in `north-coast.northern-sonoma`: 98.50% inside.
- `north-coast.sonoma-valley.bennett-valley` in `north-coast.sonoma-valley`: 97.30% inside.

### Edges this batch stores

| Type | Source | Target | Ratio |
|---|---|---|---|
| OVERLAPS | `el-dorado` | `sierra-foothills` | 74.87% |
| ALTERNATE_PARENT | `el-dorado.fair-play` | `sierra-foothills` | within |
| OVERLAPS | `north-coast.fountaingrove-district` | `north-coast.northern-sonoma` | 3.47% |
| OVERLAPS | `north-coast.los-carneros` | `north-coast.napa-valley` | 40.17% |
| OVERLAPS | `north-coast.los-carneros` | `north-coast.sonoma-coast` | 59.83% |
| OVERLAPS | `north-coast.los-carneros` | `north-coast.sonoma-valley` | 59.83% |
| OVERLAPS | `north-coast.mendocino-ridge` | `north-coast.mendocino` | 4.49% |
| OVERLAPS | `north-coast.mendocino.anderson-valley` | `north-coast.mendocino-ridge` | 6.27% |
| OVERLAPS | `north-coast.napa-valley.crystal-springs-of-napa-valley` | `north-coast.napa-valley.calistoga` | 1.26% |
| OVERLAPS | `north-coast.northern-sonoma` | `north-coast.sonoma-coast` | 38.09% |
| OVERLAPS | `north-coast.northern-sonoma.alexander-valley` | `north-coast.northern-sonoma.russian-river-valley` | 8.82% |
| OVERLAPS | `north-coast.northern-sonoma.russian-river-valley` | `north-coast.sonoma-coast` | 87.95% |
| OVERLAPS | `north-coast.northern-sonoma.russian-river-valley.chalk-hill` | `north-coast.sonoma-coast` | 55.98% |
| ALTERNATE_PARENT | `north-coast.northern-sonoma.russian-river-valley.green-valley-of-russian-river-valley` | `north-coast.sonoma-coast` | within |
| OVERLAPS | `north-coast.petaluma-gap` | `north-coast.sonoma-coast` | 66.44% |
| OVERLAPS | `north-coast.pine-mountain-cloverdale-peak` | `north-coast.northern-sonoma` | 32.72% |
| OVERLAPS | `north-coast.pine-mountain-cloverdale-peak` | `north-coast.northern-sonoma.alexander-valley` | 32.72% |
| OVERLAPS | `north-coast.rockpile` | `north-coast.northern-sonoma` | 19.15% |
| OVERLAPS | `north-coast.rockpile` | `north-coast.northern-sonoma.dry-creek-valley` | 19.13% |
| OVERLAPS | `north-coast.sonoma-valley` | `north-coast.sonoma-coast` | 39.65% |
| OVERLAPS | `north-coast.sonoma-valley.bennett-valley` | `north-coast.sonoma-coast` | 3.24% |
| OVERLAPS | `north-coast.sonoma-valley.sonoma-mountain` | `north-coast.sonoma-valley.bennett-valley` | 19.36% |
| OVERLAPS | `north-coast.wild-horse-valley` | `north-coast.napa-valley` | 34.03% |
| OVERLAPS | `sierra-foothills.california-shenandoah-valley` | `el-dorado` | 10.88% |

### Where the tree nests more than UC Davis's text says (information only)

- Gabilan Mountains: measured inside Central Coast.
- Monterey: UC Davis text not matched: Highlands, Santa Lucia.
- Santa Cruz Mountains: measured inside Central Coast, San Francisco Bay.
- Arroyo Grande Valley: measured inside San Luis Obispo Coast.
- Edna Valley: measured inside San Luis Obispo Coast.
- Crystal Springs of Napa Valley: measured inside Napa Valley, North Coast.
- Northern Sonoma: UC Davis text not matched: Dry Creek.
- Green Valley of Russian River Valley: measured inside Northern Sonoma; UC Davis text not matched: Northern Sonoma Valley.
- West Sonoma Coast: measured inside North Coast, Sonoma Coast; UC Davis text not matched: Sonoma Coast, North Coast.
- Fort Ross-Seaview: measured inside West Sonoma Coast.
- Wild Horse Valley: UC Davis text not matched: Green Valley, Solano County.

## Rest batch (64 places)

### Containers UC Davis names that the tree does not nest in

- Cole Ranch (`north-coast.cole-ranch`, keyed under north-coast): UC Davis says within Mendocino; OVERLAPS, 69.40% inside.
- High Valley (`north-coast.high-valley`, keyed under north-coast): UC Davis says within Clear Lake; OVERLAPS, 75.91% inside.

### Nested by the legal record (90% to 99.5% inside)

- `central-coast.san-francisco-bay.santa-clara-valley` in `central-coast.san-francisco-bay`: 98.20% inside.
- `north-coast.mendocino.mcdowell-valley` in `north-coast.mendocino`: 98.37% inside.
- `north-coast.mendocino.potter-valley` in `north-coast.mendocino`: 93.34% inside.
- `north-coast.suisun-valley` in `north-coast`: 92.08% inside.

### Edges this batch stores

| Type | Source | Target | Ratio |
|---|---|---|---|
| OVERLAPS | `contra-costa` | `central-coast` | 33.67% |
| OVERLAPS | `contra-costa` | `central-coast.san-francisco-bay` | 33.63% |
| OVERLAPS | `north-coast.cole-ranch` | `north-coast.mendocino` | 69.40% |
| OVERLAPS | `north-coast.high-valley` | `north-coast.clear-lake` | 75.91% |
| OVERLAPS | `north-coast.wild-horse-valley` | `north-coast.solano-county-green-valley` | 65.94% |

### Where the tree nests more than UC Davis's text says (information only)

- Ben Lomond Mountain: measured inside Central Coast, San Francisco Bay.
- Long Valley-Lake County: measured inside North Coast.

