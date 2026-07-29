"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImageUploader } from "@/components/image-uploader";
import { setCatalogWineImage } from "./actions";

// The shared bottle photo on the wine hub — uploads to storage, then persists the
// URL to the catalog wine (creator/curator only).
export function WineImage({
  wineId,
  initialUrl,
}: {
  wineId: string;
  initialUrl: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <ImageUploader
        name="catalog_image"
        bucket="wine-images"
        folder={`catalog/${wineId}`}
        initialUrl={initialUrl}
        label="Add a bottle photo"
        aspectClassName="aspect-[3/4] max-w-40"
        onChange={async (url) => {
          setError(null);
          const result = await setCatalogWineImage(wineId, url);
          if ("error" in result) setError(result.error);
          else router.refresh();
        }}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
