import { describe, expect, it } from "vitest";
import {
  isOptimizableStorageUrl,
  storageRemotePatterns,
  supabaseHostname,
} from "./storage-src";

const SUPABASE = "https://abcxyz.supabase.co";
const obj = (bucket: string, path = "u1/photo.jpg") =>
  `${SUPABASE}/storage/v1/object/public/${bucket}/${path}`;

describe("isOptimizableStorageUrl", () => {
  it("accepts public objects in the three photo buckets", () => {
    expect(isOptimizableStorageUrl(obj("wine-images", "catalog/w1/a.jpg"), SUPABASE)).toBe(true);
    expect(isOptimizableStorageUrl(obj("tasting-images"), SUPABASE)).toBe(true);
    // An avatar's ?t= cache-buster stays allowed.
    expect(isOptimizableStorageUrl(`${obj("avatars", "u1/avatar.png")}?t=1700000000000`, SUPABASE)).toBe(true);
  });

  it("leaves everything else alone", () => {
    expect(isOptimizableStorageUrl(null, SUPABASE)).toBe(false);
    expect(isOptimizableStorageUrl("", SUPABASE)).toBe(false);
    expect(isOptimizableStorageUrl("blob:https://app/123", SUPABASE)).toBe(false);
    expect(isOptimizableStorageUrl("data:image/png;base64,AAAA", SUPABASE)).toBe(false);
    expect(isOptimizableStorageUrl("/hero/romanee-sepia.webp", SUPABASE)).toBe(false);
    // Another bucket (map tiles), another host, http, a port, a signed URL.
    expect(isOptimizableStorageUrl(obj("wine-map-tiles", "tiles/manifest.json"), SUPABASE)).toBe(false);
    expect(isOptimizableStorageUrl(obj("wine-images").replace("abcxyz", "other"), SUPABASE)).toBe(false);
    expect(isOptimizableStorageUrl(obj("wine-images").replace("https:", "http:"), SUPABASE)).toBe(false);
    expect(isOptimizableStorageUrl(obj("wine-images").replace(".co/", ".co:8443/"), SUPABASE)).toBe(false);
    expect(
      isOptimizableStorageUrl(`${SUPABASE}/storage/v1/object/sign/wine-images/a.jpg?token=x`, SUPABASE),
    ).toBe(false);
    // A bucket whose name merely starts with an allowed one.
    expect(isOptimizableStorageUrl(obj("avatars-old"), SUPABASE)).toBe(false);
  });

  it("is off when the Supabase URL is unset or not https", () => {
    expect(isOptimizableStorageUrl(obj("wine-images"), undefined)).toBe(false);
    expect(isOptimizableStorageUrl(obj("wine-images"), "not a url")).toBe(false);
    expect(supabaseHostname("http://localhost:54321")).toBeNull();
  });
});

describe("storageRemotePatterns", () => {
  it("allows exactly the three buckets on the project host", () => {
    expect(storageRemotePatterns(SUPABASE).map((p) => [p.hostname, p.pathname])).toEqual([
      ["abcxyz.supabase.co", "/storage/v1/object/public/wine-images/**"],
      ["abcxyz.supabase.co", "/storage/v1/object/public/avatars/**"],
      ["abcxyz.supabase.co", "/storage/v1/object/public/tasting-images/**"],
    ]);
    expect(storageRemotePatterns(undefined)).toEqual([]);
  });
});
