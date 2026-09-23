// A small but realistic slice of the verified place catalogue, as the tree RPC
// returns it and as the tile pipeline writes it: two countries, three regions,
// Burgundy down to its climats. Shared by the selection-state and static-spec
// tests so both read the same parent links.
import { shardKeyFor } from "../shard";
import { buildWinePlaceTree } from "../tree";

export type FixturePlace = {
  id: string;
  key: string;
  name: string;
  kind: string;
  tier: number;
  parent_key: string | null;
  /** Tile-only: the classification property the fill ramp reads. */
  classification: string | null;
};

export const FIXTURE_PLACES: FixturePlace[] = [
  { id: "id-france", key: "france", name: "France", kind: "COUNTRY", tier: 0, parent_key: null, classification: null },
  { id: "id-bourgogne", key: "france.bourgogne", name: "Bourgogne", kind: "REGION", tier: 1, parent_key: "france", classification: null },
  { id: "id-cdn", key: "france.bourgogne.cote-de-nuits", name: "Côte de Nuits", kind: "SUBREGION", tier: 2, parent_key: "france.bourgogne", classification: null },
  { id: "id-vr", key: "france.bourgogne.cote-de-nuits.vosne-romanee", name: "Vosne-Romanée", kind: "APPELLATION", tier: 3, parent_key: "france.bourgogne.cote-de-nuits", classification: "communal" },
  { id: "id-lt", key: "france.bourgogne.cote-de-nuits.vosne-romanee.la-tache", name: "La Tâche", kind: "SITE", tier: 4, parent_key: "france.bourgogne.cote-de-nuits.vosne-romanee", classification: "grand_cru" },
  { id: "id-ls", key: "france.bourgogne.cote-de-nuits.vosne-romanee.les-suchots", name: "Les Suchots", kind: "SITE", tier: 4, parent_key: "france.bourgogne.cote-de-nuits.vosne-romanee", classification: "premier_cru" },
  { id: "id-gc", key: "france.bourgogne.cote-de-nuits.gevrey-chambertin", name: "Gevrey-Chambertin", kind: "APPELLATION", tier: 3, parent_key: "france.bourgogne.cote-de-nuits", classification: "communal" },
  { id: "id-cdb", key: "france.bourgogne.cote-de-beaune", name: "Côte de Beaune", kind: "SUBREGION", tier: 2, parent_key: "france.bourgogne", classification: null },
  { id: "id-meu", key: "france.bourgogne.cote-de-beaune.meursault", name: "Meursault", kind: "APPELLATION", tier: 3, parent_key: "france.bourgogne.cote-de-beaune", classification: "communal" },
  { id: "id-perrieres", key: "france.bourgogne.cote-de-beaune.meursault.les-perrieres", name: "Les Perrières", kind: "SITE", tier: 4, parent_key: "france.bourgogne.cote-de-beaune.meursault", classification: "premier_cru" },
  { id: "id-bordeaux", key: "france.bordeaux", name: "Bordeaux", kind: "REGION", tier: 1, parent_key: "france", classification: null },
  { id: "id-medoc", key: "france.bordeaux.medoc", name: "Médoc", kind: "SUBREGION", tier: 2, parent_key: "france.bordeaux", classification: null },
  { id: "id-italy", key: "italy", name: "Italia", kind: "COUNTRY", tier: 0, parent_key: null, classification: null },
  { id: "id-toscana", key: "italy.toscana", name: "Toscana", kind: "REGION", tier: 1, parent_key: "italy", classification: null },
  { id: "id-chianti", key: "italy.toscana.chianti", name: "Chianti", kind: "APPELLATION", tier: 2, parent_key: "italy.toscana", classification: null },
];

export const FIXTURE_TREE = buildWinePlaceTree(
  FIXTURE_PLACES.map((place) => ({
    id: place.id,
    key: place.key,
    name: place.name,
    kind: place.kind,
    tier: place.tier,
    parent_key: place.parent_key,
    has_children: FIXTURE_PLACES.some((other) => other.parent_key === place.key),
  })),
);

export function fixturePlace(key: string): FixturePlace {
  const place = FIXTURE_PLACES.find((p) => p.key === key);
  if (!place) throw new Error(`no fixture place ${key}`);
  return place;
}

/** A place's feature properties as scripts/wine-map-tiles/lib.mjs
    tileProperties writes them (the fields paint and filters read). */
export function tileProps(key: string): Record<string, unknown> {
  const place = fixturePlace(key);
  const parent = place.parent_key ? fixturePlace(place.parent_key) : null;
  return {
    id: place.id,
    key: place.key,
    name: place.name,
    tier: place.tier,
    parent_id: parent?.id ?? null,
    region: shardKeyFor(place.key) ?? place.key,
    classification: place.classification,
  };
}
