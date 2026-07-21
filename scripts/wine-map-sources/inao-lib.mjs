// INAO parcel-source adapter library (namespace IGN_INAO_AOC_VITICOLES).
// Pure denomination/paging helpers are unit-testable without network or
// credentials; storage access mirrors scripts/wine-map-tiles/lib.mjs but
// binds the private wine-map-sources bucket.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "../wine-map-tiles/lib.mjs";

export const WFS_BASE = "https://data.geopf.fr/wfs/ows";
export const PARCEL_LAYER = "AOC-VITICOLES:aire_parcellaire";
export const SOURCE_NAMESPACE = "IGN_INAO_AOC_VITICOLES";
export const RAW_BUCKET = "wine-map-sources";
export const MEMBERSHIP_FILE = "data/wine-map/inao-denomination-membership.json";
export const PAGE_SIZE = 5000;
export const WFS_LICENCE = "Licence Ouverte Etalab";

// denom is a comma-separated combination of every denomination the parcel
// belongs to; separator commas carry no trailing space, while comma+space
// occurs inside denomination names ("Côtes de Bourg, Bourg et Bourgeais").
export function splitDenominations(combo) {
  return String(combo ?? "")
    .split(/,(?! )/)
    .map((name) => name.trim())
    .filter(Boolean);
}

export function parcelMatches(comboString, denomination) {
  return splitDenominations(comboString).includes(denomination);
}

export async function loadMembership() {
  const fileUrl = new URL(`../../${MEMBERSHIP_FILE}`, import.meta.url);
  const parsed = JSON.parse(await readFile(fileUrl, "utf8"));
  return new Map(Object.entries(parsed.membership));
}

export function assertKnownDenominations(names, membership) {
  const unknown = names.filter((name) => !membership.has(name));
  assert.equal(
    unknown.length,
    0,
    `Unknown denominations: ${unknown.join(" | ")}`,
  );
}

// LIKE bounds the server-side transfer (equality would undercount ~35x —
// see the Phase 3 spec); exact membership happens client-side. Single
// quotes double inside CQL string literals.
export function wfsPageUrl(denomination, startIndex) {
  const literal = denomination.replaceAll("'", "''");
  const params = new URLSearchParams({
    SERVICE: "WFS",
    VERSION: "2.0.0",
    REQUEST: "GetFeature",
    TYPENAMES: PARCEL_LAYER,
    outputFormat: "application/json",
    count: String(PAGE_SIZE),
    startIndex: String(startIndex),
    sortBy: "gml_id",
    cql_filter: `denom LIKE '%${literal}%'`,
  });
  return `${WFS_BASE}?${params.toString()}`;
}

export function rawObjectPath(revision, slug, filename) {
  return `${SOURCE_NAMESPACE}/${revision}/${slug}/${filename}`;
}

function cleanSecret(value) {
  return value?.trim().replace(/^["']|["']$/g, "").trim();
}

function rawBucket() {
  const serviceRoleKey = cleanSecret(process.env.SUPABASE_SERVICE_ROLE_KEY);
  assert.ok(serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY is required");
  return createClient(SUPABASE_URL, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage.from(RAW_BUCKET);
}

export async function uploadRawObject(objectPath, body, contentType = "application/json") {
  const { error } = await rawBucket().upload(objectPath, body, {
    contentType,
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw new Error(`Upload ${objectPath} failed: ${error.message}`);
}
