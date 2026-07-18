# Interactive Wine Map Design

## Overview
Replaces the static schematic SVG wine map in the Knowledge section (`/knowledge/map`) with a fully interactive, polygon-based geographic map using MapLibre GL JS and React Map GL.

## Architecture & Data Flow
1. **Database Schema:** 
   - Add a `boundary_geojson` (JSONB) column to the existing `wine_map_nodes` table.
   - The query in `src/app/knowledge/map/page.tsx` will fetch this new column alongside existing node data.
   - We will seed a placeholder GeoJSON migration for the existing Bordeaux nodes so the map works immediately.

2. **Dependencies:**
   - `maplibre-gl`
   - `react-map-gl`
   - `@turf/bbox` (useful for calculating bounding boxes of GeoJSON shapes to auto-fit the map).

## Component Design
1. **`WineMapExplorer` (Updated)**
   - Retains current state management (`countryId`, `regionId`, `focusedId`).
   - Replaces the `REGION_LAYOUTS` SVG block with the new `InteractiveWineMap` component.

2. **`InteractiveWineMap` (New Component)**
   - Implements a MapLibre viewer using `react-map-gl`.
   - Converts the passed `wine_map_nodes` with `boundary_geojson` into MapLibre `<Source>` components.
   - Renders `<Layer>` elements to paint the polygons.
   - **Interaction:** Clicking a polygon triggers the same `setFocusedId` state update as clicking the buttons.
   - **Highlighting:** The `focusedId` node is highlighted visually (e.g., thicker stroke or filled with the brand's gold color).
   - **Auto-fit:** When a node is selected, the map smoothly flies/fits bounds to that node's GeoJSON bounding box.

## Base Map
We will use an open-source, free Vector Tile style JSON (e.g., standard MapLibre generic basemap or similar un-keyed source) to provide a clean background without requiring a commercial API key.

## Error Handling & Fallbacks
- Nodes without `boundary_geojson` will gracefully fall back to the text-list view (as it currently works for unmapped regions).
- Map failure will render a fallback message or the plain list.

## Testing
- Ensure the map cleanly mounts without hydration errors in Next.js (often requires strict client-side rendering or lazy-loading the map).
- Verify click interactions update the right-hand details pane.
- Verify that clicking a pill in the text list centers the map on the corresponding polygon.