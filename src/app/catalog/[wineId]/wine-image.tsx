"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImageUploader } from "@/components/image-uploader";
import { attachNotice, mayBecomeMainPhoto } from "@/lib/catalog-photos/strip";
import type { AttachPhotoResult } from "@/lib/catalog-photos/types";
import { attachCatalogWinePhoto } from "../photo-actions";
import { setCatalogWineImage } from "./actions";

// The shared bottle photo on the wine hub. Every upload joins the wine's
// photos (scan photos spec §8.4, D4) through `attachCatalogWinePhoto`; the
// creator or a curator (`canSetMain`, mirroring the "catalog update" policy)
// also makes it the main photo, as before. Anyone else's upload goes straight
// to the "More photos" strip and the main photo is left alone.
//
// The preview always shows the page's own main photo (`previewUploads` off):
// a creator's replace reaches it through the refresh, and nobody else's upload
// ever appears there.
export function WineImage({
  wineId,
  initialUrl,
  canSetMain,
}: {
  wineId: string;
  initialUrl: string | null;
  canSetMain: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);

  async function uploaded({ url, path }: { url: string; path: string }): Promise<void> {
    setError(null);
    setNotice(null);
    let attached: AttachPhotoResult;
    try {
      attached = await attachCatalogWinePhoto({ catalogWineId: wineId, imagePath: path, via: "upload" });
    } catch (e) {
      console.error("wine page: photo not attached", e instanceof Error ? e.message : typeof e);
      attached = { ok: false, status: "error" };
    }
    // Rule 1: the adder of a still-unrevealed glass of this wine never turns
    // it into the wine's public main photo either. Fail closed: only a status
    // the RPC returns after its unrevealed-glass check lets the main change.
    if (canSetMain && mayBecomeMainPhoto(attached.status)) {
      try {
        const result = await setCatalogWineImage(wineId, url);
        if ("error" in result) setError(result.error);
      } catch (e) {
        console.error("wine page: main photo not set", e instanceof Error ? e.message : typeof e);
        setError("Couldn't set the photo. Please try again.");
      }
    } else {
      const text = attachNotice(attached.status);
      setNotice(text === null ? null : { text, ok: attached.ok });
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <ImageUploader
        name="catalog_image"
        bucket="wine-images"
        folder={`catalog/${wineId}`}
        initialUrl={initialUrl}
        aspectClassName="aspect-[3/4] max-w-40"
        previewUploads={false}
        onUpload={uploaded}
      />
      {notice ? (
        <p
          className={notice.ok ? "text-sm text-muted-foreground" : "text-sm text-destructive"}
          role="status"
        >
          {notice.text}
        </p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
