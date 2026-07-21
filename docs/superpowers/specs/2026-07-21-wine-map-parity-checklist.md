# Wine Map Tile Pilot — Parity Checklist

Run against production (`https://blindrapp.vercel.app`) after the Task 4
push. The tile map must match or beat the legacy map on every item before
promotion (spec §5, Application tests).

## Navigation parity

- [ ] `/knowledge/map` (no params) still shows the legacy map, unchanged.
- [ ] `/knowledge/map?map=tiles` loads the tile map focused on Bordeaux.
- [ ] Click path works: Bordeaux → an appellation (fill highlights, camera
      fits, details panel updates) → nested commune (e.g. Margaux via
      Haut-Médoc) → breadcrumb back up to France.
- [ ] Child pills ("Within Bordeaux:") select and focus the same way the
      legacy pills did.
- [ ] Manual zoom out to world level shows France (fill + label); manual
      zoom does NOT change the selection or the details panel.
- [ ] Zooming into Bordeaux reveals appellations at ~z7 and the nested
      communes at ~z9; Bordeaux's outline and label remain visible behind
      its appellations (parent-fade behavior).

## Deep links and URL state

- [ ] Selecting places rewrites `?place=` in the URL without a page reload,
      and `?map=tiles` is preserved.
- [ ] Opening `/knowledge/map?map=tiles&place=france.bordeaux.haut-medoc.margaux`
      directly restores the Margaux selection, breadcrumb, and camera.
- [ ] An unknown place key (`?map=tiles&place=nope`) shows the "isn't on the
      map yet" state and the map still renders.

## Article and fallback states

- [ ] Details panel shows description / climate / grape varieties / wine
      styles / key facts for Bordeaux and at least two appellations, matching
      the legacy panel's content.
- [ ] With DevTools network blocking of `tiles/manifest.json`, the page shows
      the "map tiles are unavailable" card with Retry, and breadcrumb /
      pills / details still work (text navigation survives tile failure).
- [ ] Attribution (Blindr, IGN/INAO) is visible on the map control.

## Mobile (real phone, not just responsive mode)

- [ ] Pan / pinch-zoom / tap-select all work on the tile map.
- [ ] The details panel is readable and the layout doesn't overflow.
- [ ] A deep link opened on the phone restores the right view.

## Sign-off

- Owner approval (date + note): ____________________
