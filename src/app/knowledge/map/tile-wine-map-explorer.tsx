"use client";

// react-hooks/refs is off for this file, which is exactly where it stood
// before 2026-09-30: the React Compiler lint used to bail out of
// TileWineMapExplorer on the old camera memo's `Math.max(...childZooms)`, and
// with it went every ref check in the component. The ref reads it now reports
// (the selection source and sheet snap read and written during render, the
// tree pickers' ref-backed callbacks) are deliberate and older than that memo;
// the React Compiler is not enabled in the build, so nothing is memoised
// behind them. Revisit them on their own, not as part of the size rule.
/* eslint-disable react-hooks/refs */

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import dynamic from "next/dynamic";
import {
  Layers,
  ListFilter,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  SlidersHorizontal,
  Sparkles,
  Thermometer,
  Wine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import {
  fetchWineMapManifest,
  type WineMapManifest,
} from "@/lib/wine-map/manifest";
import type { WinePlaceContext, WinePlaceGrape } from "@/lib/wine-map/context";
import type { StyleRow } from "@/lib/wine-map/place-styles";
import {
  clearWinePlaceCaches,
  loadArchetypesForPlace,
  loadGrapeOptions,
  loadPlaceGrapeLinks,
  loadPlaceStyles,
  loadWinePlaceContext,
  loadWinePlaceTree,
  peekArchetypesForPlace,
  peekPlaceStyles,
  peekWinePlaceContext,
  warmWinePlace,
} from "@/lib/wine-map/place-cache";
import { useWinePlacePrefetch } from "@/lib/wine-map/use-place-prefetch";
import type { WinePlaceTreeNode } from "@/lib/wine-map/tree";
import { englishName } from "@/lib/wine-map/localize-names";
import { deepLinkAction } from "@/lib/wine-map/deep-link";
import { currentRevealPx, placeRevealPx } from "@/lib/wine-map/reveal";
import { fallbackFromContext } from "@/lib/wine-map/selection-state";
import { areaSlugsByShard } from "@/lib/wine-map/shard-specs";
import {
  INITIAL_TREE_LOAD,
  treeFetchDelay,
  treeLoadReducer,
} from "@/lib/wine-map/tree-load";
import { MapErrorBoundary, MapUnavailableCard } from "./map-error-boundary";
import { WineMapTree } from "./wine-map-tree";
import { MapDetailControls } from "./map-detail-controls";
import { CountryChips } from "./country-chips";
import { useDetailMode } from "@/lib/wine-map/detail-mode";
import { detailStatus, selectionCueText } from "@/lib/wine-map/detail-status";
import { countryChips } from "@/lib/wine-map/country-chips";
import {
  bboxesForCountry,
  CHIP_FIT_ALL_SHARDS,
  chipMinZoom,
  countryCameraBox,
  cuePillClearPx,
  cuePillTextWidth,
  cueTopReservePx,
  selectionZooms,
  wrappedLineCount,
  type CameraRequest,
  type SheetPadding,
} from "@/lib/wine-map/camera-fit";
import {
  chipAfterReport,
  chipAfterUserMove,
  chipOnTap,
  type ChipFocus,
  type DetailReport,
} from "@/lib/wine-map/focus";
import { GrapeModal, KnowledgeSections } from "./knowledge-sections";
import { MAP_FOCUS_RING } from "./focus-ring";
import { ReferenceCombobox } from "@/components/reference-combobox";
import {
  grapeVisibleKeys,
  type GrapeOption,
} from "@/lib/wine-map/grape-filter";
import type { CameraTarget } from "./tile-wine-map";
import type { ArchetypeListItem } from "@/lib/wset/queries";
import { ArchetypeModal } from "@/components/wset/archetype-modal";
import { typicalWinesHeading } from "@/lib/training/copy";
import { PHONE_QUERY, useIsPhone } from "@/lib/use-is-phone";
import { useIsWide } from "@/lib/use-is-wide";
import { initialSidePanel, sidePanelReducer } from "@/lib/wine-map/side-panel";
import { detailsTopDue } from "@/lib/wine-map/details-scroll";
import {
  halfSnapHeightPx,
  initialSheet,
  sheetReducer,
  type SheetSnap,
} from "@/lib/wine-map/sheet-state";
import { MapBottomSheet } from "./map-bottom-sheet";
import { MapOptionsSheet } from "./map-options-sheet";

// maplibre-gl touches `window` on import — must never be server-rendered.
const TileWineMap = dynamic(
  () => import("./tile-wine-map").then((m) => m.TileWineMap),
  {
    ssr: false,
    // Fills the map wrapper at every width: the wrapper's height comes from
    // the page's flex chain (phones, and md+ since spec 2026-09-27).
    loading: () => (
      <div className="animate-pulse rounded-lg border bg-muted max-md:h-full max-md:min-h-0 md:h-full md:min-h-0" />
    ),
  },
);

const KIND_LABELS: Record<string, string> = {
  COUNTRY: "Country",
  MACRO_REGION: "Macro region",
  REGION: "Region",
  SUBREGION: "Subregion",
  APPELLATION: "Appellation",
  SITE: "Site",
  VINEYARD: "Vineyard",
};

// The wine-glass tint per wine colour, so a typical-wine pill reads at a glance
// as red / white / rosé / orange.
const WINE_COLOUR_HEX: Record<string, string> = {
  RED: "#8E1F3B",
  WHITE: "#B78E42",
  ROSE: "#D98A9E",
  ORANGE: "#C0692E",
};

// Label-language preference as an external store. useState + a localStorage
// lazy initializer produced a hydration mismatch: the tree and map render no
// labels server-side, but the Local/English toggle itself does, so a viewer who
// had chosen "local" hydrated with the opposite button highlighted. This is the
// case useSyncExternalStore exists for — the server snapshot is the default and
// the stored preference is adopted after hydration, with no setState in an
// effect. Reads/writes are guarded: with site data blocked the bare accessor
// throws SecurityError, which used to take the whole explorer down.
const LANG_STORAGE_KEY = "wine-map-lang";
const langListeners = new Set<() => void>();
// Fallback for profiles where localStorage throws (site data blocked, private
// windows). Without it readEnglish always answered "english" and the toggle was
// inert rather than merely non-persistent.
let langMemory: boolean | null = null;
function readEnglish() {
  try {
    return window.localStorage.getItem(LANG_STORAGE_KEY) !== "local";
  } catch {
    return langMemory ?? true;
  }
}
function subscribeLang(onChange: () => void) {
  langListeners.add(onChange);
  return () => {
    langListeners.delete(onChange);
  };
}
function writeEnglish(value: boolean) {
  langMemory = value;
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, value ? "en" : "local");
  } catch {
    // Preference just will not persist beyond this page view.
  }
  for (const listener of langListeners) listener();
}

// Ruling R1 (the 2026-09-25 phone plan): what a selection's camera leaves
// free at the bottom of the canvas. On a phone whose bottom sheet shows the
// selection at half, the sheet's height, so the fit lands the place in the
// part of the map the sheet leaves visible; otherwise nothing (a closed bar
// covers 56 px of map edge, a full sheet covers all of it, and a fit into
// nothing is no fit). Phone-ness is read imperatively, from the same query
// useIsPhone renders with, because this runs inside the camera target's memo
// and must not be one of its deps: the target is built once per selection.
function sheetCameraPadding(snap: SheetSnap): SheetPadding | undefined {
  if (snap !== "half" || typeof window === "undefined") return undefined;
  if (typeof window.matchMedia !== "function") return undefined;
  if (!window.matchMedia(PHONE_QUERY).matches) return undefined;
  return { bottom: halfSnapHeightPx(window.innerHeight) };
}

// The frame a phone's pick keeps free at the top for the zoom-in pill over the
// map (below), so the pill never covers the place it lands on (fix round
// 2026-10-01, review V7: it covered the top of Northern Rhône). Which text
// the pill will show is known only after the landing ("the" or "all the"
// subregions), and the language can change, so the longest text it could
// show is measured: "all the", in the local and the English name, in the
// pill's own font (12 px, its 237 px line on a 375 px phone), wrapped as the
// browser wraps it (camera-fit.ts wrappedLineCount). Read imperatively, like
// sheetCameraPadding, inside the camera target's memo; 0 lines off a phone.
let cueMeasure: CanvasRenderingContext2D | null | undefined;
function phoneCueLines(names: readonly string[]): number {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return 0;
  if (!window.matchMedia(PHONE_QUERY).matches) return 0;
  try {
    if (cueMeasure === undefined) cueMeasure = document.createElement("canvas").getContext("2d");
    const context = cueMeasure;
    // No 2D canvas to measure with: assume the usual two lines.
    if (!context) return 2;
    const style = window.getComputedStyle(document.body);
    context.font = `${style.fontWeight} 12px ${style.fontFamily}`;
    const space = context.measureText(" ").width;
    const width = cuePillTextWidth(window.innerWidth);
    let lines = 0;
    for (const name of names) {
      const words = (selectionCueText({ name, drawn: 1, hidden: 1 }) ?? "").split(" ").filter(Boolean);
      lines = Math.max(
        lines,
        wrappedLineCount(words.map((word) => context.measureText(word).width), space, width),
      );
    }
    return lines;
  } catch {
    return 2;
  }
}

export function TileWineMapExplorer({
  initialPlaceKey,
}: {
  initialPlaceKey: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [manifest, setManifest] = useState<WineMapManifest | null>(null);
  const [manifestError, setManifestError] = useState<string | null>(null);
  // Default to no selection — the map opens on the whole wine world (all
  // regions from the world archive) rather than diving straight into one
  // region. A deep link (?place=) still selects its place.
  const [selectedKey, setSelectedKey] = useState<string | null>(initialPlaceKey);
  const [context, setContext] = useState<WinePlaceContext | null>(null);
  const [contextState, setContextState] = useState<
    "loading" | "ready" | "missing" | "error"
  >("loading");
  const [tree, setTree] = useState<WinePlaceTreeNode[] | null>(null);
  // Loading, ready or failed, kept apart from `tree` itself (null both while
  // loading and after a failure). A failure used to set tree=[], which the
  // tree card and every map prop derived from the tree could not tell from
  // "still loading", and nothing on screen said anything had gone wrong.
  const [treeLoad, dispatchTree] = useReducer(treeLoadReducer, INITIAL_TREE_LOAD);
  // Label language for the map + tree: English exonyms (Italia->Italy,
  // Toscana->Tuscany) from the curated dictionary by default, or native local
  // names when the viewer has explicitly chosen "local". Persisted per browser.
  // Must start at the SERVER value and only adopt the stored preference after
  // mount. The tree and map render no labels server-side, but the Local/English
  // toggle itself does, so reading localStorage during the first client render
  // made a viewer who had chosen "local" hydrate with the opposite button
  // highlighted. localStorage is also wrapped: in a profile with site data
  // blocked the bare getter throws SecurityError and took the explorer down.
  const english = useSyncExternalStore(subscribeLang, readEnglish, () => true);
  const chooseLang = (value: boolean) => writeEnglish(value);

  // Map detail (spec 2026-09-23 §7). One country by default and All countries
  // one tap away, remembered per browser. It is never in the URL, so a shared
  // ?place= link cannot put a phone into All. `fellBack` means this page was
  // put back in One country after All went wrong (lib/wine-map/detail-mode).
  const {
    mode: detail,
    fellBack,
    setMode: setDetail,
    dropToOne,
    confirmHealthy,
  } = useDetailMode();
  // What the map says it is showing, reported on change.
  const [report, setReport] = useState<DetailReport>(() => ({
    focusCountry: null,
    depthCountries: [],
    countriesInView: [],
    pastDepthZoom: false,
    selectionFamily: null,
  }));
  // A tapped country chip: focus without selection. The next real selection
  // clears it, and so does its country leaving the view after being on it.
  // A chip whose country never came on screen (its flight was interrupted, or
  // never started) is dropped at the viewer's next own camera move.
  const [chipFocus, setChipFocus] = useState<ChipFocus | null>(null);
  // A chip's camera move. The nonce lets the same chip fly again.
  const [cameraRequest, setCameraRequest] = useState<CameraRequest | null>(null);
  const handleDetailReport = useCallback((next: DetailReport) => {
    setReport(next);
    setChipFocus((prev) => chipAfterReport(prev, next.countriesInView));
  }, []);
  // Stable, so passing it never re-renders the map.
  const handleUserMoveStart = useCallback(() => {
    setChipFocus((prev) => chipAfterUserMove(prev));
  }, []);

  // One request per attempt: the first at once, the single automatic retry
  // after TREE_AUTO_RETRY_MS, a manual Retry at once. The place cache never
  // keeps a rejected tree (mount-cache.test.ts pins that), so every attempt
  // really goes back to the server.
  const treeLoading = treeLoad.state === "loading";
  const treeAttempt = treeLoad.attempt;
  useEffect(() => {
    if (!treeLoading) return;
    let cancelled = false;
    const start = () => {
      loadWinePlaceTree(supabase).then(
        (roots) => {
          if (cancelled) return;
          setTree(roots);
          dispatchTree({ type: "resolved" });
        },
        () => {
          // The map and details still work without the tree; the tree card
          // says so, with a Retry, once the automatic retry has failed too.
          if (!cancelled) dispatchTree({ type: "rejected" });
        },
      );
    };
    const delay = treeFetchDelay(treeAttempt);
    const timer = delay > 0 ? window.setTimeout(start, delay) : null;
    if (timer === null) start();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [supabase, treeLoading, treeAttempt]);

  // Map filters (grape today; styles/designations will share the plumbing):
  // one selected grape becomes a visible-key set via wine_place_grapes +
  // nearest-ancestor inheritance, and the map hides every other polygon.
  const [grapeOptions, setGrapeOptions] = useState<GrapeOption[]>([]);
  const [grapeLinks, setGrapeLinks] = useState<Map<string, Set<string>> | null>(
    null,
  );
  const [grapeFilterId, setGrapeFilterId] = useState("");
  useEffect(() => {
    let cancelled = false;
    Promise.all([loadGrapeOptions(supabase), loadPlaceGrapeLinks(supabase)])
      .then(([options, links]) => {
        if (cancelled) return;
        setGrapeOptions(options);
        setGrapeLinks(links);
      })
      .catch(() => {
        // The filter control simply stays disabled; the map is unaffected.
      });
    return () => {
      cancelled = true;
    };
  }, [supabase]);
  const visibleKeys = useMemo(
    () =>
      grapeFilterId && tree && grapeLinks
        ? grapeVisibleKeys(tree, grapeLinks, grapeFilterId)
        : null,
    [grapeFilterId, tree, grapeLinks],
  );

  // Tile shards are keyed by canonical_key segment 1 (a region slug), which
  // carries no country. The tree roots are the countries and their children the
  // regions, so it gives us shard -> country for free — no tile rebuild needed
  // to let the map show subregion depth one country at a time.
  const shardCountries = useMemo(() => {
    const byShard: Record<string, string> = {};
    for (const country of tree ?? []) {
      const countrySlug = country.key.split(".")[0];
      for (const region of country.children ?? []) {
        const shard = region.key.split(".")[1];
        if (shard) byShard[shard] = countrySlug;
      }
    }
    return byShard;
  }, [tree]);

  // Each shard's own area slugs, for that shard's fixed fill palette — built
  // once from the same tree, so the colour table never depends on what the
  // viewport has happened to scan, and a shard's colour expression carries only
  // its own areas. Empty until the tree lands (region hues only, as before).
  const slugsByShard = useMemo(() => areaSlugsByShard(tree ?? []), [tree]);

  // Expanded ("full view") keeps the tree and details visible but
  // collapsible; Escape exits. It is the same element and the same inner
  // chain as the locked page; only the root turns fixed (spec 2026-09-27 M13).
  const [expanded, setExpanded] = useState(false);
  // xl's two side cards (spec 2026-09-27 §5.2). A collapsed card stays
  // mounted (xl:hidden), so the tree keeps its search, expansion and scroll.
  const [treeOpen, setTreeOpen] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(true);
  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => {
      // An Escape something else already handled is not ours: the tree
      // search clearing its query (it marks the event), or a Base UI popover
      // or dialog (it stops the event before it reaches the window).
      if (event.key !== "Escape" || event.defaultPrevented) return;
      setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  // md-xl's side column (spec 2026-09-27 §5.3, M9/M10): Explore or Details in
  // one grid cell of a fixed size, open or collapsed to a 36 px strip. Pure
  // state in lib/wine-map/side-panel; never persisted, never in the URL. A
  // load with ?place= starts on Details. A selection only ever switches the
  // tab, so it never resizes the map.
  const [side, dispatchSide] = useReducer(
    sidePanelReducer,
    initialPlaceKey,
    initialSidePanel,
  );
  // xl and up. Only picks the Details card's DOM slot (after the map from xl,
  // before it below, so DOM order stays visual order) and which of the tree's
  // two collapse states is its `active`. Layout is CSS alone, so the first
  // paint is right at every width; the server snapshot is true.
  const isWide = useIsWide();
  const treeCardId = useId();
  const detailsCardId = useId();

  // Focus hand-offs (spec 2026-09-27 §5.2, §5.3): a control that hides itself
  // hands focus to its counterpart, which may only exist after the next
  // commit. The handler names the target here; the effect below focuses it
  // once that commit is on screen, and clears it. Nothing is ever pending on
  // the first mount, so a load never steals focus.
  const collapseTreeRef = useRef<HTMLButtonElement | null>(null);
  const showTreeRef = useRef<HTMLButtonElement | null>(null);
  const collapseDetailsRef = useRef<HTMLButtonElement | null>(null);
  const showDetailsRef = useRef<HTMLButtonElement | null>(null);
  const hidePanelRef = useRef<HTMLButtonElement | null>(null);
  const showPanelRef = useRef<HTMLButtonElement | null>(null);
  const detailsTabRef = useRef<HTMLButtonElement | null>(null);
  const pendingFocusRef = useRef<RefObject<HTMLButtonElement | null> | null>(null);
  useEffect(() => {
    const target = pendingFocusRef.current;
    if (!target) return;
    pendingFocusRef.current = null;
    target.current?.focus();
  });
  const toggleTree = (open: boolean) => {
    setTreeOpen(open);
    pendingFocusRef.current = open ? collapseTreeRef : showTreeRef;
  };
  const toggleDetails = (open: boolean) => {
    setDetailsOpen(open);
    pendingFocusRef.current = open ? collapseDetailsRef : showDetailsRef;
  };
  const toggleSide = () => {
    dispatchSide({ type: "toggle" });
    pendingFocusRef.current = side.open ? showPanelRef : hidePanelRef;
  };

  // The Details body scrolls inside its own card (xl and md-xl alike) and
  // starts at the top for every new place, as the phone sheet's does. A place
  // picked while the card is collapsed (display:none, nothing to scroll) is
  // reset when the card is shown again, once per place, so a plain collapse
  // and reopen of the same place keeps its scroll (lib/wine-map/
  // details-scroll). A layout effect, so a reopened card never paints one
  // frame at the offset the browser restored. A remounted card (the slot
  // move at xl) already starts at the top.
  const detailsScrollRef = useRef<HTMLDivElement | null>(null);
  const detailsShown = isWide ? detailsOpen : side.open;
  const detailsTopForRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!detailsTopDue(detailsShown, selectedKey, detailsTopForRef.current)) return;
    detailsTopForRef.current = selectedKey;
    detailsScrollRef.current?.scrollTo({ top: 0 });
  }, [selectedKey, detailsShown]);

  // Phones (below md; spec 2026-09-25) get one fixed screen: a toolbar row,
  // the map filling the rest, and a bottom sheet holding the hierarchy and the
  // details. `max-md:` classes shape it; `isPhone` only decides which elements
  // exist. An element phones must not have is replaced by null IN PLACE, so
  // the map's parent chain is the same at every width and crossing md (a
  // rotated phone) never remounts MapLibre; it also carries `max-md:hidden`,
  // because the server snapshot is false and SSR renders the md+ elements. The
  // tree and the details each render in exactly one place. From md (spec
  // 2026-09-27) the same holds: md:, xl: and the map-lock:/map-scroll:
  // variants shape the layout, every max-md: utility stays as it was, and a
  // new md+ element is null in place on phones and carries a hiding class.
  const isPhone = useIsPhone();
  // The sheet's snap and tab (lib/wine-map/sheet-state). Never persisted and
  // never in the URL: a load with ?place= starts on Details at half.
  const [sheet, dispatchSheet] = useReducer(
    sheetReducer,
    initialPlaceKey,
    initialSheet,
  );
  // Ruling R1: the snap the sheet shows the current selection at, written with
  // the selection (as selectSourceRef is) and read once, when that selection's
  // camera target is built: half for a tree pick or a deep link, which open
  // Details at half, otherwise the snap at the time (a Nearby chip inside
  // Details swaps the content in place). Never a render value, so a sheet
  // moved or a viewport rotated afterwards never rebuilds the target and
  // re-flies the camera. It starts where the sheet starts.
  const selectSnapRef = useRef<SheetSnap>(sheet.snap);
  // The phone's Map options sheet: the One|All switch and its status line.
  const [optionsOpen, setOptionsOpen] = useState(false);
  // Full view is lg-only and Map options phone-only. A viewport that crosses
  // md leaves whichever it can no longer show (Full view below md would have
  // no way out). Adjusted during render, like the deep link below.
  if (isPhone && expanded) setExpanded(false);
  if (!isPhone && optionsOpen) setOptionsOpen(false);

  // Manifest loading is retriggered by bumping manifestAttempt from event
  // handlers; the effect body only starts async work so no setState runs
  // synchronously inside it (react-hooks/set-state-in-effect).
  const [manifestAttempt, setManifestAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetchWineMapManifest()
      .then((loaded) => {
        if (!cancelled) setManifest(loaded);
      })
      .catch((error: Error) => {
        if (!cancelled) setManifestError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [manifestAttempt]);
  const retryManifest = useCallback(() => {
    setManifestError(null);
    setManifestAttempt((attempt) => attempt + 1);
  }, []);
  // Bumped by the error boundary's Retry: a new key remounts TileWineMap from
  // scratch (a fresh MapLibre instance) and clears the boundary's error.
  const [mapKey, setMapKey] = useState(0);
  // The size rule's threshold (lib/wine-map/reveal.ts): ?revealPx= or the
  // knob, read ONCE per visit, when the explorer mounts, and handed to the
  // map's filters and to the selection camera alike, so the two agree. A
  // client-side navigation back to the map mounts a new explorer and reads
  // the URL again (review 2026-09-30: a module-level cache did not).
  const [revealPx] = useState(currentRevealPx);
  const remountMap = useCallback(() => setMapKey((key) => key + 1), []);

  // The three selection requests all go through the per-key cache
  // (@/lib/wine-map/place-cache), so clicking back to a place already visited
  // makes NO request at all. Each effect keeps its own `cancelled` guard
  // exactly as before: the cache only changes whether a request goes out, never
  // which response is allowed to win.
  useEffect(() => {
    if (!selectedKey) return;
    let cancelled = false;
    loadWinePlaceContext(supabase, selectedKey)
      .then((ctx) => {
        if (cancelled) return;
        setContext(ctx);
        setContextState(ctx ? "ready" : "missing");
      })
      .catch(() => {
        if (!cancelled) setContextState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, selectedKey]);

  // "A typical wine from here" — the archetypes hung off this place. Tagged
  // with the key they belong to so a stale set never flashes under a newly
  // selected place while the next fetch is in flight.
  const [archetypeData, setArchetypeData] = useState<{
    key: string;
    rows: ArchetypeListItem[];
  } | null>(null);
  const [openArchetype, setOpenArchetype] = useState<ArchetypeListItem | null>(
    null,
  );
  // The grape whose dialog is open, held here rather than in
  // KnowledgeSections for the same reason as openArchetype: the Details card
  // moves between two row slots when the window crosses xl (a browser zoom
  // step is enough), which remounts everything inside it.
  const [openGrape, setOpenGrape] = useState<WinePlaceGrape | null>(null);
  useEffect(() => {
    if (!selectedKey) return;
    let cancelled = false;
    loadArchetypesForPlace(supabase, selectedKey)
      .then((rows) => {
        if (!cancelled) setArchetypeData({ key: selectedKey, rows });
      })
      .catch(() => {
        if (!cancelled) setArchetypeData({ key: selectedKey, rows: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, selectedKey]);
  const archetypes =
    archetypeData && archetypeData.key === selectedKey ? archetypeData.rows : [];

  // Wine styles carry a colour dimension the context RPC does not return
  // ("White sparkling" / "Rosé sparkling"), so they stay their own request —
  // but keyed by the canonical key, it can start WITH the context RPC instead
  // of ~400 ms behind it, which is where it used to sit when KnowledgeSections
  // owned the fetch. Key-tagged for the same reason the archetypes are.
  const [styleData, setStyleData] = useState<{
    key: string;
    rows: StyleRow[];
  } | null>(null);
  useEffect(() => {
    if (!selectedKey) return;
    let cancelled = false;
    loadPlaceStyles(supabase, selectedKey)
      .then((rows) => {
        if (!cancelled) setStyleData({ key: selectedKey, rows });
      })
      .catch(() => {
        if (!cancelled) setStyleData({ key: selectedKey, rows: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, selectedKey]);
  const styleRows =
    styleData && styleData.key === selectedKey ? styleData.rows : [];

  // A cache hit applied SYNCHRONOUSLY with the selection. Without this a
  // revisit still commits one "Loading…" frame, because a resolved promise
  // lands in a microtask after the commit. The cached values are the same
  // object references the effects will resolve to, so React bails out of the
  // second pass rather than rendering twice.
  const applyCachedSelection = useCallback((key: string) => {
    const cachedContext = peekWinePlaceContext(key);
    if (cachedContext) {
      setContext(cachedContext);
      setContextState("ready");
    } else {
      setContextState("loading");
    }
    const cachedArchetypes = peekArchetypesForPlace(key);
    if (cachedArchetypes) setArchetypeData({ key, rows: cachedArchetypes });
    const cachedStyles = peekPlaceStyles(key);
    if (cachedStyles) setStyleData({ key, rows: cachedStyles });
  }, []);

  // Nothing cached here is per-user — every policy behind the place catalogue
  // is content-level and get_wine_place_context is SECURITY INVOKER over the
  // same tables, so two signed-in viewers get identical payloads. This is the
  // guard against a future policy that IS per-user: swapping accounts empties
  // the maps rather than serving the previous account's reads.
  useEffect(() => {
    let currentUserId: string | null | undefined;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUserId = session?.user.id ?? null;
      if (currentUserId === undefined) {
        currentUserId = nextUserId;
        return;
      }
      if (nextUserId !== currentUserId) {
        currentUserId = nextUserId;
        clearWinePlaceCaches();
      }
    });
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  // Hovering or focusing a place row for a moment warms its details, so the
  // click that follows renders from cache. Desktop only — the rule refuses
  // every call on a coarse/hoverless pointer.
  const prefetch = useWinePlacePrefetch(supabase, selectedKey);

  // Selection updates the URL in place (shareable deep links) while
  // preserving any other params — including ?map=tiles during the opt-in
  // phase — without a Next navigation round-trip.
  // Rides along into cameraTarget: map taps never move the camera, only
  // tree/search/details navigation flies (deep links keep the "ui" default).
  const selectSourceRef = useRef<"map" | "ui">("ui");
  const select = useCallback(
    (key: string, source: "map" | "ui" = "ui") => {
      // Same-key selection must be a no-op: the context effect only re-runs
      // when selectedKey changes, so setting "loading" here would never
      // resolve. The early return comes FIRST — writing the source ref before
      // it let a map tap on an already-pending tree selection flip that
      // selection's source to "map", which cancels its fly-to with no later
      // commit able to recover it.
      if (key === selectedKey) return;
      selectSourceRef.current = source;
      // The sheet as it is now; pickFromTree and the deep link, which open
      // Details at half, overwrite this after calling here (ruling R1).
      selectSnapRef.current = sheet.snap;
      setChipFocus(null);
      applyCachedSelection(key);
      // Start the three requests here rather than leaving them to the effects
      // below, which React only flushes after this commit has painted the map
      // as well as the panel. The effects then join the in-flight request
      // instead of making a second one.
      warmWinePlace(supabase, key);
      setSelectedKey(key);
      const params = new URLSearchParams(window.location.search);
      params.set("place", key);
      window.history.replaceState(null, "", `?${params.toString()}`);
    },
    [applyCachedSelection, selectedKey, sheet.snap, supabase],
  );

  // Phones (spec D4): a tap on the map that selects a place, and a pick in the
  // Explore tree, open Details at half. The sheet opens even when select()
  // returns early (the place was already selected): the tap asked to read it.
  // Nearby and Labelling chips inside Details call plain select() and swap the
  // content in place. The ?debugPerf=1 probe's scripted selections use the
  // "map" source too, so a probe run on a phone opens Details like a real tap.
  const selectFromMap = useCallback(
    (key: string, source: "map" | "ui" = "ui") => {
      select(key, source);
      if (source === "map") dispatchSheet({ type: "mapTap" });
    },
    [select],
  );
  const pickFromTree = useCallback(
    (key: string) => {
      select(key);
      // This pick's camera fits the place above the half sheet (ruling R1).
      selectSnapRef.current = "half";
      dispatchSheet({ type: "treePick" });
    },
    [select],
  );

  // md and up (spec 2026-09-27 §5.3): every selection, a map tap, a tree
  // pick, a Nearby or Labelling chip, shows Details in the md-xl side column.
  // It never opens a collapsed column (M10); the strip names the place
  // instead. The camera path is select()'s, untouched.
  const selectDesktop = useCallback(
    (key: string, source: "map" | "ui" = "ui") => {
      select(key, source);
      dispatchSide({ type: "select" });
    },
    [select],
  );
  // The md+ tree's pick. Below xl it shows Details in the tree's own cell,
  // hiding the tree the pick came from, so focus goes to the Details switch
  // instead of falling to body.
  const selectFromDesktopTree = useCallback(
    (key: string) => {
      selectDesktop(key);
      if (!isWide) pendingFocusRef.current = detailsTabRef;
    },
    [selectDesktop, isWide],
  );

  // Respond to a new ?place from a SAME-route navigation (e.g. the global search
  // while already on the map): the map page re-renders with a new
  // initialPlaceKey, so select it. Guarded so the initial mount (selectedKey
  // already equals initialPlaceKey) and same-key pushes are no-ops.
  //
  // Adjusted during render rather than in an effect. This is state derived from
  // a prop, which is React's documented case for the pattern, and it avoids the
  // extra commit-then-rerender pass an effect would cost. No history write is
  // needed on this path either: the router has ALREADY put the new key in the
  // URL, so select()'s replaceState would only rewrite what is there.
  // This fires ONLY when the prop CHANGES between renders, which is the only
  // real signal that a navigation happened. Nothing else may move the
  // watermark.
  //
  // Two previous attempts both broke every click, because both made the
  // watermark diverge from the prop while the prop cannot move on its own —
  // select() uses history.replaceState, which deliberately avoids a server
  // round-trip, so initialPlaceKey keeps whatever the last real navigation
  // rendered:
  //   - Comparing the prop against selectedKey: any selection differs from the
  //     prop, so it fired and set the selection straight back.
  //   - Advancing the watermark inside select(): the watermark then differed
  //     from the prop, so it fired and set the selection straight back.
  // Both reverted the selection during the same render pass, for every blob on
  // the map, whenever the page had been loaded with a ?place= (i.e. after any
  // refresh, since select() writes one into the URL).
  //
  // Known limitation, deliberately accepted: re-navigating to the SAME ?place=
  // after selecting something else does not re-select it, because the prop is
  // unchanged and is therefore indistinguishable from no navigation at all.
  // That is a rare no-op; the alternatives above are a map you cannot click.
  const [lastInitialKey, setLastInitialKey] = useState(initialPlaceKey);
  const deepLink = deepLinkAction({ initialPlaceKey, lastInitialKey, selectedKey });
  if (deepLink) {
    setLastInitialKey(deepLink.nextWatermark);
    if (deepLink.select) {
      // Navigation-driven selection flies the camera, exactly as select() does
      // for tree/search clicks; only map taps hold it still.
      selectSourceRef.current = "ui";
      // Phones: the sheet opens Details at half for it (below), so its camera
      // fits the place above the half sheet (ruling R1).
      selectSnapRef.current = "half";
      applyCachedSelection(deepLink.select);
      setSelectedKey(deepLink.select);
      setChipFocus(null);
      // Phones: a link to a place opens its details (spec D4). The camera
      // flies as before; the sheet lies over the map and never resizes it.
      dispatchSheet({ type: "deepLink" });
      // md-xl: the side column shows Details for it, open or not (M10).
      dispatchSide({ type: "select" });
    }
  }

  // Drill-down camera: selecting a place zooms far enough that ALL its
  // children's catalogue zooms are reached (deepest child + headroom). Leaf
  // places instead zoom to their own footprint — bbox fitting decides, with
  // a generous cap — so tiny appellations (Pomerol) fill the view rather
  // than showing the whole parent region. Either way the landing is where
  // the place itself is drawn: past its own tile zoom and, below region
  // level, past the zoom the size rule reveals it at (selectionZooms,
  // lib/wine-map/camera-fit.ts; reveal.ts). The rule counts only where the
  // manifest says the place's shard carries it (placeRevealPx), exactly as
  // the map's filters do; elsewhere, and before the manifest is here (the map
  // is not mounted then), the camera is the one from before the rule.
  // Below country level, with the rule on, a fit a hair under a whole zoom
  // lands on it (owner, 2026-10-01; camera-fit.ts selectionLanding), and on a
  // phone a place with subregions keeps the zoom-in pill's strip free above
  // it (phoneCueLines): the fit's frame grows by what a two-line pill needs
  // (reserveTop), and a rounded landing's box stays below the pill whatever
  // its lines (topClear; review 2026-10-01: a one-line pill reserved nothing,
  // and Abruzzo's rounded box rose under it).
  const cameraTarget = useMemo<CameraTarget | null>(() => {
    if (!context?.boundary) return null;
    const px = manifest ? placeRevealPx(manifest.shards, context.place.key, revealPx) : 0;
    const { minZoom, maxZoom } = selectionZooms({
      tier: context.place.tier,
      minZoom: context.place.min_zoom,
      childMinZooms: context.children.map((c) => c.min_zoom),
      bbox: context.boundary.bbox,
      revealPx: px,
    });
    const belowCountry = px > 0 && context.place.tier >= 1;
    // Phones with the sheet at half (ruling R1): the fit leaves the sheet's
    // height free at the bottom, so the place lands in the visible half.
    const sheet = sheetCameraPadding(selectSnapRef.current);
    const cueLines =
      belowCountry && context.children.length > 0
        ? phoneCueLines([context.place.name, englishName(context.place.name)])
        : 0;
    const reserveTop = cueTopReservePx(cueLines);
    return {
      bbox: context.boundary.bbox,
      placeKey: context.place.key,
      minZoom,
      maxZoom,
      source: selectSourceRef.current,
      padding:
        cueLines > 0
          ? {
              bottom: sheet?.bottom ?? 0,
              ...(reserveTop > 0 ? { reserveTop } : {}),
              topClear: cuePillClearPx(cueLines),
            }
          : sheet,
      wholeZoom: belowCountry,
    };
  }, [context, revealPx, manifest]);

  // The map's selection emphasis while the tree is missing (loading, failed,
  // or older than the tiles): the context's children and parent — and only
  // once the context describes the current selection, not the previous one.
  const selectionFallback = useMemo(
    () => fallbackFromContext(context, selectedKey),
    [context, selectedKey],
  );

  // The tree's countries, in the label language's order, with per-country
  // counts while a grape filter is on.
  const chips = useMemo(
    () => countryChips(tree ?? [], { english, visibleKeys }),
    [tree, english, visibleKeys],
  );
  // One country: focus the country (no selection), and fly only if it is off
  // screen or the map is below shard zoom. TileWineMap judges that at apply
  // time from its live zoom. All countries: every country already has
  // subregions, so a chip is a plain jump and always flies.
  const chooseChip = useCallback(
    (country: string) => {
      if (detail === "one") {
        setChipFocus((prev) => chipOnTap(prev, country, report.countriesInView));
      }
      const bbox = manifest
        ? countryCameraBox(bboxesForCountry(manifest.shards, shardCountries, country), {
            keepAll: CHIP_FIT_ALL_SHARDS.has(country),
          })
        : null;
      if (!bbox) return;
      setCameraRequest((prev) => ({
        bbox,
        minZoom: chipMinZoom(country),
        nonce: (prev?.nonce ?? 0) + 1,
        stayIfVisible: detail === "one" ? country : null,
      }));
    },
    [detail, manifest, report.countriesInView, shardCountries],
  );
  // The selection cue: the selected place, when the map's last scan found
  // descendants of it in view that only the size rule still hides.
  const selectionCue = useMemo(() => {
    const family = report.selectionFamily;
    if (!family || family.hidden === 0 || family.key !== selectedKey) return null;
    if (!context || context.place.key !== family.key) return null;
    return {
      name: english ? englishName(context.place.name) : context.place.name,
      drawn: family.drawn,
      hidden: family.hidden,
    };
  }, [report.selectionFamily, selectedKey, context, english]);
  const focusName = useMemo(() => {
    const root = report.focusCountry
      ? (tree ?? []).find((node) => node.key === report.focusCountry)
      : undefined;
    if (!root) return null;
    return english ? englishName(root.name) : root.name;
  }, [report.focusCountry, tree, english]);
  // "Subregions shown" is claimed only once they are drawn, meaning the map's
  // scan saw tier >= 2 features of the focus country on screen.
  const depthShown =
    report.focusCountry !== null && report.depthCountries.includes(report.focusCountry);
  const detailLine = detailStatus({
    tree: treeLoad.state,
    detail,
    fellBack,
    focusName,
    depthVisible: depthShown,
    otherCountriesInView: report.countriesInView.some(
      (country) => country !== report.focusCountry,
    ),
    // Past NEIGHBOUR_MIN_ZOOM with nothing drawn, "zoom in" is no longer
    // honest advice (controller ruling R3); the map judges it from the same
    // idle scan that measured depth.
    pastDepthZoom: report.pastDepthZoom,
    selection: selectionCue,
  });
  const markedChip = detail === "one" && depthShown ? report.focusCountry : null;
  // A phone's status line lives in the Map options sheet, closed by default,
  // so the selection cue is also shown over the map there (review
  // 2026-09-30: a Napa Valley pick landed with none of its AVAs drawn and
  // nothing on screen said to zoom in). Same text, and only while the sheet
  // is closed, so there is one role="status" region at a time.
  const phoneCue = isPhone && !optionsOpen ? selectionCueText(selectionCue) : null;

  const article =
    context?.article && context.article.editorial_status !== "PLACEHOLDER"
      ? context.article
      : null;

  // The phone sheet bar's label: the place whose details are showing. A
  // selection whose details failed or are missing is labelled "Details", the
  // tab that says so, never "Explore the map" as if nothing were selected.
  // md+ reuses it, set vertically, on the collapsed Details strip (xl) and the
  // collapsed side column's strip (md-xl), while a place is selected.
  const sheetTitle =
    context && context.place.key === selectedKey
      ? english
        ? englishName(context.place.name)
        : context.place.name
      : selectedKey
        ? contextState === "loading"
          ? "Loading…"
          : "Details"
        : "Explore the map";

  // The hierarchy's body. The md+ tree card and the phone sheet's Explore tab
  // both render it, and only one of them exists at a time. `active` is false
  // while the tree is out of sight (the phone sheet elsewhere, the xl card or
  // the md-xl column collapsed), so the selected row is revealed again each
  // time it is shown. `rootsCollapsed` is the phone's: countries start
  // collapsed like a menu. `clearSearchOnEscape` is the md+ card's: its
  // search box's Escape clears the query before Full view sees it (M13); the
  // phone sheet's tree keeps its search box exactly as it was.
  const renderTree = (
    onPick: (key: string) => void,
    options: {
      active: boolean;
      rootsCollapsed?: boolean;
      clearSearchOnEscape?: boolean;
    },
  ) =>
    treeLoad.state === "failed" ? (
      <div
        role="alert"
        className="flex h-full flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border text-center"
      >
        <p className="text-sm text-muted-foreground">
          Couldn&apos;t load the place list.
        </p>
        <button
          type="button"
          onClick={() => dispatchTree({ type: "retry" })}
          className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground max-md:min-h-11"
        >
          Retry
        </button>
      </div>
    ) : tree === null ? (
      <div className="h-full animate-pulse rounded-md bg-muted" />
    ) : (
      <WineMapTree
        roots={tree}
        selectedKey={selectedKey}
        onSelect={onPick}
        filterKeys={visibleKeys}
        english={english}
        onPrefetch={prefetch}
        active={options.active}
        rootsCollapsed={options.rootsCollapsed === true}
        clearSearchOnEscape={options.clearSearchOnEscape === true}
      />
    );

  // The place details. The md+ details card and the phone sheet's Details tab
  // both render this same body, and only one of them exists at a time.
  const detailsBody = !selectedKey ? (
    <p className="text-sm text-muted-foreground">
      Pick a region on the map or in the hierarchy to explore it.
    </p>
  ) : contextState === "loading" ? (
    <p className="text-sm text-muted-foreground">Loading…</p>
  ) : contextState === "error" ? (
    <p className="text-sm text-muted-foreground">
      Details are unavailable right now. Try another place or reload.
    </p>
  ) : contextState === "missing" || !context ? (
    <p className="text-sm text-muted-foreground">
      That place isn&apos;t on the map yet.
    </p>
  ) : (
    <>
      <div>
        <Badge variant="secondary" className="mb-1.5">
          {KIND_LABELS[context.place.kind] ?? context.place.kind}
        </Badge>
        <h2 className="font-heading text-xl font-semibold">
          {english ? englishName(context.place.name) : context.place.name}
        </h2>
      </div>
      {archetypes.length > 0 ? (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Wine className="size-3.5" />
            {typicalWinesHeading(archetypes.length)}
          </p>
          <div className="flex flex-col gap-1.5">
            {archetypes.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setOpenArchetype(a)}
                className="flex items-center justify-between gap-2 rounded-lg border border-border/70 px-2.5 py-2 text-left text-sm font-medium transition-colors hover:bg-muted/60"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Wine
                    className="size-4 shrink-0"
                    style={{ color: WINE_COLOUR_HEX[a.colour] ?? "#8A8A85" }}
                  />
                  <span className="truncate">{a.name}</span>
                </span>
                <span className="text-muted-foreground">→</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {article ? (
        <>
          {article.description ? (
            <p className="text-sm text-muted-foreground">
              {article.description}
            </p>
          ) : null}
          <dl className="flex flex-col gap-2 text-sm">
            {article.climate ? (
              <div className="flex gap-2">
                <Thermometer className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">
                    Climate
                  </dt>
                  <dd>{article.climate}</dd>
                </div>
              </div>
            ) : null}
            {article.soils ? (
              <div className="flex gap-2">
                <Layers className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">
                    Soils
                  </dt>
                  <dd>{article.soils}</dd>
                </div>
              </div>
            ) : null}
            {article.grape_varieties && context.grapes.length === 0 ? (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">
                  Main grape varieties
                </dt>
                <dd>{article.grape_varieties}</dd>
              </div>
            ) : null}
            {article.wine_styles && context.styles.length === 0 ? (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">
                  Wine styles
                </dt>
                <dd>{article.wine_styles}</dd>
              </div>
            ) : null}
          </dl>
          {article.key_facts.length > 0 ? (
            <div>
              <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Sparkles className="size-3.5" />
                Key facts
              </p>
              <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                {article.key_facts.map((fact, i) => (
                  <li key={i}>{fact}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Profile being curated — check back soon.
        </p>
      )}
      <KnowledgeSections
        context={context}
        onSelect={isPhone ? select : selectDesktop}
        onOpenGrape={setOpenGrape}
        styleRows={styleRows}
        onPrefetch={prefetch}
      />
    </>
  );

  // The md+ Details card, built once and placed in exactly one of two row
  // slots (spec 2026-09-27 M14): slot 4, before the map, below xl, where it
  // shares the side column's cell with the tree; slot 6, after the map, from
  // xl, where it is the right-hand column. DOM order is then visual order at
  // every width. Crossing xl moves it, which remounts this subtree alone (its
  // scroll starts at the top again); the map's slot never moves, so MapLibre
  // is unaffected. Phones: the details live in the bottom sheet's Details tab
  // (isPhone), and the SSR paint hides the card (max-md:hidden).
  const detailsCard = isPhone ? null : (
    <Card
      id={detailsCardId}
      role="region"
      aria-label="Details"
      className={cn(
        "max-md:hidden md:col-start-1 md:row-start-2 md:min-h-0 xl:order-3 xl:w-72 xl:shrink-0 2xl:w-80",
        // xl: collapsed to its strip (slot 7), still mounted.
        !detailsOpen && "xl:hidden",
        // md-xl: the Explore tab is showing in the shared cell. Invisible
        // keeps the box and its scroll, but it is not painted, not
        // hit-testable and not in the tab order.
        side.tab !== "details" && "max-xl:invisible",
        // md-xl: the side column is collapsed to its strip (slot 1).
        !side.open && "max-xl:hidden",
      )}
    >
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
        {/* xl only: at md-xl the side column's switch names the card. */}
        <div className="hidden items-center justify-between xl:flex">
          <span className="text-xs font-medium text-muted-foreground">
            Details
          </span>
          <button
            ref={collapseDetailsRef}
            type="button"
            aria-label="Collapse details"
            onClick={() => toggleDetails(false)}
            className={cn(
              "inline-flex size-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground md:pointer-fine:size-8",
              MAP_FOCUS_RING,
            )}
          >
            <PanelRightClose className="size-4" />
          </button>
        </div>
        {/* The body scrolls inside the card, under the pinned header, and
            goes back to its top for every new place (detailsScrollRef). */}
        <div
          ref={detailsScrollRef}
          className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto"
        >
          {detailsBody}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div
      className={
        expanded
          ? // Full view (lg+): the same element and the same inner chain as
            // the locked page, fixed over the whole window, so it only hides
            // the sidebar and the top bar (spec 2026-09-27 M13).
            "fixed inset-0 z-50 flex flex-col overflow-y-auto bg-background p-4"
          : // The screen under the header, on phones and md+ (map-lock).
            // Relative on phones, so the bottom sheet sits inside it;
            // flex-1 min-h-0 carries the page's definite height on down to
            // the map (the height chain: spec 2026-09-25 D3, spec 2026-09-27
            // M1). A short md+ window (map-scroll) leaves it content-sized.
            "flex flex-col gap-4 max-md:relative max-md:min-h-0 max-md:flex-1 max-md:gap-0 max-md:overflow-hidden map-lock:min-h-0 map-lock:flex-1"
      }
    >
      {/* The row: one class string in both modes.
          - Phones: a column holding the map card alone.
          - md-xl: a grid. The side column (18rem, or 2.25rem collapsed) is
            the tab strip over the Explore/Details cell; the map card spans
            both rows beside it.
          - xl: a flex row of three full-height columns, tree, map, Details,
            nothing sticky.
          Its height is the flex chain's (map-lock:), or a fixed 420 px in a
          short window (map-scroll:), so every panel has a definite height and
          scrolls inside itself, and nothing grows the page. Seven fixed
          slots, each its element or null, so the map's React parent chain is
          the same at every width and crossing md or xl never remounts
          MapLibre. No panel's width or the map's size is ever animated. */}
      <div
        className={cn(
          "flex flex-col gap-4 max-md:min-h-0 max-md:flex-1 max-md:gap-0 md:grid md:gap-x-4 md:gap-y-2 md:grid-rows-[auto_minmax(0,1fr)] xl:flex xl:flex-row xl:items-stretch map-lock:min-h-0 map-lock:flex-1 map-scroll:h-[26.25rem]",
          side.open
            ? "md:grid-cols-[18rem_minmax(0,1fr)]"
            : // Collapsed: the Show panel strip's column, 44 px wide on a
              // coarse pointer (an iPad) so the strip is a real target.
              "md:grid-cols-[2.25rem_minmax(0,1fr)] md:pointer-coarse:grid-cols-[2.75rem_minmax(0,1fr)]",
        )}
      >
        {/* Slot 1 (md-xl): the side column's head. Open: the Explore |
            Details switch (the phone sheet's words) and Hide panel. Collapsed:
            one full-height Show panel strip naming the selected place. */}
        {isPhone ? null : (
          <div
            className={cn(
              "max-md:hidden md:col-start-1 md:row-start-1 md:flex md:items-center md:gap-1 xl:hidden",
              !side.open && "md:row-span-2 md:items-stretch",
            )}
          >
            {side.open ? (
              <>
                <div className="flex shrink-0 items-center rounded-md border border-border p-0.5 text-xs">
                  {(
                    [
                      { tab: "explore", label: "Explore", controls: treeCardId },
                      { tab: "details", label: "Details", controls: detailsCardId },
                    ] as const
                  ).map((option) => {
                    const pressed = side.tab === option.tab;
                    return (
                      <button
                        key={option.tab}
                        ref={option.tab === "details" ? detailsTabRef : undefined}
                        type="button"
                        aria-pressed={pressed}
                        aria-controls={option.controls}
                        onClick={() => dispatchSide({ type: "tab", tab: option.tab })}
                        className={cn(
                          "min-h-11 rounded px-2 py-1 transition-colors md:pointer-fine:min-h-0",
                          MAP_FOCUS_RING,
                          // Shape as well as colour, like the Map detail
                          // radios: bordeaux on the dark card is only 1.3:1.
                          // Windows high contrast (forced colours) drops
                          // both the fill and the ring (a box-shadow), so
                          // the pressed one is also underlined there: an
                          // underline, not an outline, so it can never be
                          // mistaken for the focus ring.
                          pressed
                            ? "bg-primary font-semibold text-primary-foreground ring-2 ring-inset ring-foreground forced-colors:underline forced-colors:decoration-2 forced-colors:underline-offset-4"
                            : "font-medium text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                <button
                  ref={hidePanelRef}
                  type="button"
                  aria-label="Hide panel"
                  onClick={toggleSide}
                  className={cn(
                    "ml-auto inline-flex size-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground md:pointer-fine:size-8",
                    MAP_FOCUS_RING,
                  )}
                >
                  <PanelLeftClose className="size-4" />
                </button>
              </>
            ) : (
              // Its accessible name carries the place it shows, the only
              // visible text on it, so a speech-input user who says that
              // name finds it (WCAG 2.5.3). 44 px wide on a coarse pointer,
              // as its grid column is.
              <button
                ref={showPanelRef}
                type="button"
                aria-label={selectedKey ? `Show panel, ${sheetTitle}` : "Show panel"}
                onClick={toggleSide}
                className={cn(
                  "flex h-full w-9 flex-col items-center gap-2 rounded-lg border border-border py-2 text-muted-foreground hover:text-foreground pointer-coarse:w-11",
                  MAP_FOCUS_RING,
                )}
              >
                <PanelLeftOpen className="size-4 shrink-0" />
                {selectedKey ? (
                  <span
                    aria-hidden
                    className="min-h-0 flex-1 truncate text-xs [writing-mode:vertical-rl]"
                  >
                    {sheetTitle}
                  </span>
                ) : null}
              </button>
            )}
          </div>
        )}

        {/* Slot 2: the tree card, at every md+ width. xl: the left-hand
            column, collapsed to its strip (slot 3) but still mounted, so its
            search, expansion and scroll survive. md-xl: the Explore tab of
            the side column, sharing its cell with the Details card (slot 4).
            Phones: the tree lives in the bottom sheet's Explore tab. */}
        {isPhone ? null : (
          <Card
            id={treeCardId}
            role="region"
            aria-label="Explorer"
            className={cn(
              "order-3 max-md:hidden md:col-start-1 md:row-start-2 md:min-h-0 xl:order-1 xl:w-60 xl:shrink-0 2xl:w-[280px]",
              !treeOpen && "xl:hidden",
              side.tab !== "explore" && "max-xl:invisible",
              !side.open && "max-xl:hidden",
            )}
          >
            <CardContent className="flex min-h-0 flex-1 flex-col">
              {/* xl only: at md-xl the side column's switch names the card. */}
              <div className="mb-2 flex items-center justify-between max-xl:hidden">
                <span className="text-xs font-medium text-muted-foreground">
                  Explorer
                </span>
                <button
                  ref={collapseTreeRef}
                  type="button"
                  aria-label="Collapse hierarchy"
                  onClick={() => toggleTree(false)}
                  className={cn(
                    "inline-flex size-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground md:pointer-fine:size-8",
                    MAP_FOCUS_RING,
                  )}
                >
                  <PanelLeftClose className="size-4" />
                </button>
              </div>
              {/* The tree's own <ul> is the scroller; its search box and
                  level buttons stay pinned above it. */}
              <div className="min-h-0 flex-1">
                {renderTree(selectFromDesktopTree, {
                  active: isWide ? treeOpen : side.open,
                  clearSearchOnEscape: true,
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Slot 3 (xl): the collapsed tree's full-height 36 px strip (44 px
            on a coarse pointer). */}
        {isPhone || treeOpen ? null : (
          <button
            ref={showTreeRef}
            type="button"
            aria-label="Show hierarchy"
            onClick={() => toggleTree(true)}
            className={cn(
              "order-3 hidden rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground xl:order-1 xl:flex xl:w-9 xl:items-start xl:justify-center xl:pointer-coarse:w-11",
              MAP_FOCUS_RING,
            )}
          >
            <PanelLeftOpen className="size-4" />
          </button>
        )}

        {/* Slot 4 (md-xl): the Details card, before the map. */}
        {isWide ? null : detailsCard}

        {/* Slot 5: the map column. Phones and md+ alike lose the card chrome
            (spec 2026-09-27 M5); TileWineMap keeps its own border. md-xl: the
            grid's second column, spanning both rows. overflow-visible from md
            keeps the combobox's focus ring and the radios' outline from being
            clipped at the column's edge; min-w-0 and min-h-0 still give the
            item its zero minimum size. */}
        <Card className="order-1 min-w-0 flex-1 overflow-hidden max-md:min-h-0 max-md:gap-0 max-md:rounded-none max-md:bg-transparent max-md:py-0 max-md:ring-0 md:col-start-2 md:row-start-1 md:row-span-2 md:min-h-0 md:gap-0 md:overflow-visible md:rounded-none md:bg-transparent md:py-0 md:ring-0 xl:order-2">
          <CardContent className="pt-4 max-md:flex max-md:min-h-0 max-md:flex-1 max-md:flex-col max-md:px-0 max-md:pt-0 md:flex md:min-h-0 md:flex-1 md:flex-col md:px-0 md:pt-0">
            {/* Map filters: pick a grape and only places using it stay on
                the map (France's outline remains as context). More filter
                kinds will join this bar. */}
            {/* Phones: this row is the whole toolbar (spec D2): one line of
                44 px targets, the grape Filter, Local|English, Map options.
                md+: one 32 px line that never wraps (spec 2026-09-27 M6),
                because the canvas below is flex-sized and any row that grows
                would resize the map. The grape combobox gives up width
                first; the badge and Local|English never shrink. */}
            <div className="mb-2 flex flex-wrap items-center gap-2 max-md:mb-0 max-md:shrink-0 max-md:flex-nowrap max-md:px-3 max-md:py-1.5 md:h-8 md:shrink-0 md:flex-nowrap">
              <ListFilter aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground max-md:sr-only md:sr-only">
                Filter
              </span>
              <div className="w-64 max-w-full max-md:w-auto max-md:min-w-0 max-md:flex-1 md:min-w-0">
                <ReferenceCombobox
                  formFieldName="map_grape_filter"
                  options={grapeOptions}
                  value={grapeFilterId}
                  onValueChange={setGrapeFilterId}
                  placeholder={
                    grapeOptions.length === 0
                      ? "Loading grapes…"
                      : isPhone
                        ? "Grape"
                        : "Grape — only places using it"
                  }
                  disabled={grapeOptions.length === 0}
                  allowClear
                  triggerClassName={isPhone ? "h-11" : undefined}
                />
              </div>
              {/* Phones keep the toolbar to one line; the map itself shows
                  what the filter keeps. */}
              {visibleKeys && !isPhone ? (
                <Badge variant="secondary" className="shrink-0">
                  {visibleKeys.length} place{visibleKeys.length === 1 ? "" : "s"}
                </Badge>
              ) : null}
              {/* Label language: native local names vs English exonyms
                  (Italia->Italy, Toscana->Tuscany), across the map + tree. */}
              <div className="ml-auto flex items-center rounded-md border border-border p-0.5 text-xs max-md:shrink-0 md:shrink-0">
                <button
                  type="button"
                  onClick={() => chooseLang(false)}
                  aria-pressed={!english}
                  className={cn(
                    "rounded px-2 py-1 font-medium transition-colors max-md:min-h-11",
                    !english
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Local
                </button>
                <button
                  type="button"
                  onClick={() => chooseLang(true)}
                  aria-pressed={english}
                  className={cn(
                    "rounded px-2 py-1 font-medium transition-colors max-md:min-h-11",
                    english
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  English
                </button>
              </div>
              {isPhone ? (
                <Button
                  type="button"
                  variant="outline"
                  size="icon-lg"
                  aria-label="Map options"
                  aria-haspopup="dialog"
                  aria-expanded={optionsOpen}
                  onClick={() => setOptionsOpen(true)}
                  className="size-11 shrink-0"
                >
                  <SlidersHorizontal />
                </Button>
              ) : null}
            </div>
            {/* Map detail (spec 2026-09-23 §7.1): the One | All switch with its
                status line, then the country chips. Both rows hold a fixed
                height from first paint (the status at most two lines), so
                the map below never moves when the status text or the chip
                list changes. */}
            {/* Phones: no chips, and the switch with its status line lives in
                the Map options sheet (one role="status" region, never two). */}
            {isPhone ? null : (
              <div className="mb-2 flex shrink-0 flex-col gap-2 max-md:hidden">
                <MapDetailControls
                  mode={detail}
                  onModeChange={setDetail}
                  status={detailLine}
                  onRetry={() => dispatchTree({ type: "retry" })}
                />
                <CountryChips
                  chips={chips}
                  markedKey={markedChip}
                  loading={treeLoad.state === "loading"}
                  onChoose={chooseChip}
                />
              </div>
            )}
            {/* The map: the rest of the column, at every width and in both
                modes. A definite height from the page's flex chain, never a
                percentage of an indefinite parent (the "map collapsed to
                zero" trap) and never a calc. */}
            <div className="relative max-md:h-auto max-md:min-h-0 max-md:flex-1 md:min-h-0 md:flex-1">
            {phoneCue ? (
              // Between the zoom buttons (top left) and the expand button
              // (top right); never takes a tap from the map. Mounted only
              // while there is a cue (fix round 2026-10-01): an empty
              // always-there layer over the canvas changed how the whole
              // page composited on a phone, so phone screenshots stopped
              // matching production even with the rule off. A pick that may
              // show it keeps its strip free (phoneCueLines; camera-fit.ts
              // CUE_PILL mirrors these classes).
              <div
                role="status"
                className="pointer-events-none absolute inset-x-14 top-2 z-10 flex justify-center"
              >
                <span className="rounded-full border border-border bg-background/90 px-3 py-1 text-center text-xs leading-snug text-foreground shadow-sm backdrop-blur-sm">
                  {phoneCue}
                </span>
              </div>
            ) : null}
            {manifest ? (
              // Any render or effect error inside the map (or a failed
              // next/dynamic chunk after a deploy) lands here instead of
              // replacing the whole page.
              <MapErrorBoundary resetKey={mapKey} onRetry={remountMap}>
                <TileWineMap
                  key={mapKey}
                  manifest={manifest}
                  selectedKey={selectedKey}
                  tree={tree}
                  selectionFallback={selectionFallback}
                  selectedContextKey={context?.place.key ?? null}
                  cameraTarget={cameraTarget}
                  onSelect={isPhone ? selectFromMap : selectDesktop}
                  visibleKeys={visibleKeys}
                  shardCountries={shardCountries}
                  areaSlugsByShard={slugsByShard}
                  expanded={expanded}
                  onToggleExpanded={() => setExpanded((value) => !value)}
                  detail={detail}
                  chipCountry={chipFocus?.country ?? null}
                  cameraRequest={cameraRequest}
                  onDetailReport={handleDetailReport}
                  onUserMoveStart={handleUserMoveStart}
                  onContextLost={dropToOne}
                  onHealthy={confirmHealthy}
                  english={english}
                  revealPx={revealPx}
                />
              </MapErrorBoundary>
            ) : manifestError ? (
              <MapUnavailableCard onRetry={retryManifest} />
            ) : (
              <div className="h-full animate-pulse rounded-lg border bg-muted" />
            )}
            </div>
          </CardContent>
        </Card>

        {/* Slot 6 (xl): the Details card, after the map. */}
        {isWide ? detailsCard : null}

        {/* Slot 7 (xl): the collapsed Details card's full-height 36 px strip
            (44 px on a coarse pointer), naming the selected place so the
            selection stays in sight. That name is its only visible text, so
            it is in the accessible name too (WCAG 2.5.3). */}
        {isPhone || detailsOpen ? null : (
          <button
            ref={showDetailsRef}
            type="button"
            aria-label={selectedKey ? `Show details, ${sheetTitle}` : "Show details"}
            onClick={() => toggleDetails(true)}
            className={cn(
              "order-2 hidden rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground xl:order-3 xl:flex xl:w-9 xl:flex-col xl:items-center xl:gap-2 xl:pointer-coarse:w-11",
              MAP_FOCUS_RING,
            )}
          >
            <PanelRightOpen className="size-4 shrink-0" />
            {selectedKey ? (
              <span
                aria-hidden
                className="min-h-0 flex-1 truncate text-xs [writing-mode:vertical-rl]"
              >
                {sheetTitle}
              </span>
            ) : null}
          </button>
        )}
      </div>
      {isPhone ? (
        <MapBottomSheet
          sheet={sheet}
          onEvent={dispatchSheet}
          title={sheetTitle}
          detailsKey={selectedKey}
          explore={
            <div className="h-full">
              {renderTree(pickFromTree, {
                active: sheet.snap !== "closed" && sheet.tab === "explore",
                rootsCollapsed: true,
              })}
            </div>
          }
          details={detailsBody}
        />
      ) : null}
      {isPhone ? (
        <MapOptionsSheet
          open={optionsOpen}
          onOpenChange={setOptionsOpen}
          mode={detail}
          onModeChange={setDetail}
          status={detailLine}
          onRetry={() => dispatchTree({ type: "retry" })}
        />
      ) : null}
      {openArchetype ? (
        <ArchetypeModal
          id={openArchetype.id}
          name={openArchetype.name}
          onClose={() => setOpenArchetype(null)}
        />
      ) : null}
      {openGrape ? (
        <GrapeModal grape={openGrape} onClose={() => setOpenGrape(null)} />
      ) : null}
    </div>
  );
}
