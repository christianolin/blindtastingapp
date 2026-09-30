# US-4 tree review: what the promote locks

Rendered by `scripts/usa-map/render-us4-notes.mjs` from the Washington, Oregon and New York tree reports. Keys lock at the promote (spec §8.3). An AVA is keyed under its map state, the legal (TTB) state holding most of its land, unless the owner overrode it (D6); it nests in an AVA of the same state when ≥ 99.5% of it measures inside, or ≥ 90% when UC Davis's `within` names that AVA, or by a `parent_overrides` entry citing the legal record (D7, spec §26). Changing any placement needs a config entry and re-committed tree reports before the catalog renders.

## Cross-state AVAs (TTB lists more than one state)

| AVA | Keyed | TTB states | Measured land shares | State edges | Wave |
|---|---|---|---|---|---|
| Columbia Gorge | `oregon.columbia-gorge` (override) | OR, WA | OR 65.20%, WA 34.80% | washington | US-4 |
| Columbia Valley | `washington.columbia-valley` (dominant) | OR, WA | OR 22.40%, WA 77.60% | oregon | US-2 |
| Walla Walla Valley | `washington.columbia-valley.walla-walla-valley` (dominant) | OR, WA | OR 31.01%, WA 68.99% | oregon | US-4 |

## Edges this wave stores

| Type | Source | Target | Basis | Figure |
|---|---|---|---|---|
| ALTERNATE_PARENT | `oregon.columbia-gorge` | `washington` | state_share | 34.80% of its land |
| ALTERNATE_PARENT | `oregon.the-rocks-district-of-milton-freewater` | `washington.columbia-valley` | within | wholly inside |
| ALTERNATE_PARENT | `oregon.the-rocks-district-of-milton-freewater` | `washington.columbia-valley.walla-walla-valley` | within | wholly inside |
| ALTERNATE_PARENT | `washington.columbia-valley.walla-walla-valley` | `oregon` | state_share | 31.01% of its land |

## The legal record over the outlines (usa-tree-config.json)

- Candy Mountain keyed under `washington.columbia-valley.yakima-valley` (override, 89.31% measured inside): T.D. TTB-163 (Federal Register document 2020-18741, published 2020-09-25, effective 2020-10-26) established the Candy Mountain AVA while "expanding the boundary of the existing 1,093-square mile Yakima Valley viticultural area by approximately 72 acres in order to avoid a partial overlap with the newly established Candy Mountain viticultural area"; TTB determined that "the Candy Mountain AVA will remain part of both the established Columbia Valley AVA and the Yakima Valley AVA". The UC Davis Yakima Valley outline (valid from 2020-10-26) still leaves about 11% of the Candy Mountain outline outside it (89.31% measured inside, under the 90% legal-record arm).
- Candy Mountain and Goose Gap: no containment and no edge (legal exclusion, 1.34% measured inside): The Goose Gap final rule (T.D. TTB-170, Federal Register document 2021-14047, published 2021-07-01, effective 2021-08-02): the Goose Gap AVA "lies entirely within the established Yakima Valley (27 CFR 9.69) and Columbia Valley (27 CFR 9.74) AVAs and does not overlap any other existing or proposed AVA." Candy Mountain was established in 2020, before it.

## Nested by the legal record (90% to 99.5% inside)

- `oregon.southern-oregon.umpqua-valley` in `oregon.southern-oregon`: 98.27% inside.
- `oregon.southern-oregon.umpqua-valley.elkton-oregon` in `oregon.southern-oregon.umpqua-valley`: 99.06% inside.
- `oregon.willamette-valley.chehalem-mountains.laurelwood-district` in `oregon.willamette-valley.chehalem-mountains`: 99.36% inside.
- `oregon.willamette-valley.lower-long-tom` in `oregon.willamette-valley`: 99.32% inside.
- `oregon.willamette-valley.mcminnville` in `oregon.willamette-valley`: 98.09% inside.
- `washington.columbia-valley.lake-chelan` in `washington.columbia-valley`: 95.72% inside.
- `washington.columbia-valley.yakima-valley.rattlesnake-hills` in `washington.columbia-valley.yakima-valley`: 99.45% inside.

## Overlaps with a place's own ancestor (no edge stored)

- Red Hill Douglas County, Oregon in Southern Oregon: 67.75% measured inside.
- Candy Mountain in Yakima Valley: 89.31% measured inside.

## State shares that are map artifacts (withheld: no edge, no say in the map state)

The Natural Earth 1:50m state line runs several km off the Columbia River, so it measures Oregon land inside Washington-only AVAs. The promote's containment check buffers the state outlines by 0.05° and passes them.

- Horse Heaven Hills: OR 2.35% (TTB lists WA).
- The Burn of Columbia Valley: OR 38.21% (TTB lists WA).

## Not in this wave

- Lake Erie: dominant state OH is outside wave 1 (NY 17.54%, OH 75.30%, PA 7.16%).
- Snake River Valley: dominant state ID is outside wave 1 (ID 70.10%, OR 29.90%).
- Lewis-Clark Valley: dominant state ID is outside wave 1 (ID 68.29%, WA 31.71%).
- Beverly, Washington (WA; 27 CFR 9.297; established 2024-10-29): no UC Davis outline yet (US-5).
- Columbia Hills (WA; 27 CFR 9.301; established 2026-08-17): no UC Davis outline yet (US-5).

## UC Davis text the tree does not follow (information only)

- Southern Oregon (`oregon.southern-oregon`): UC Davis says it contains Red Hill Douglas County, Oregon.
- Red Hill Douglas County, Oregon (`oregon.southern-oregon.umpqua-valley.red-hill-douglas-county-oregon`): UC Davis says within Southern Oregon.
- Candy Mountain (`washington.columbia-valley.yakima-valley.candy-mountain`): UC Davis says within Yakima Valley.
