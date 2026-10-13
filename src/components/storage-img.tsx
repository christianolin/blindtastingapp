"use client";

import { useState, type ImgHTMLAttributes } from "react";
import { getImageProps } from "next/image";
import { isOptimizableStorageUrl } from "@/lib/images/storage-src";

type StorageImgProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "srcSet" | "width" | "height"> & {
  src: string;
  /**
   * The widest the image is ever DRAWN, in CSS pixels. The optimizer serves
   * this width at 1x and twice it at 2x — never the stored original.
   */
  renderWidth: number;
};

/**
 * A drop-in <img> for photos stored in Supabase Storage (wine photos, scans,
 * avatars, tasting covers). Same element, same classes and layout as before;
 * only the source changes: a Storage URL is served through Next's image
 * optimizer at the size it is drawn (see src/lib/images/storage-src.ts for
 * why — Supabase egress). Anything else (a blob: preview, a local file) is
 * passed through untouched.
 *
 * If the optimized image fails to load (e.g. the host's image-optimization
 * quota is spent), the element falls back once to the original URL, so a
 * photo never disappears because of the optimizer.
 */
export function StorageImg({ src, renderWidth, alt = "", onError, ...rest }: StorageImgProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const optimize =
    failedSrc !== src && isOptimizableStorageUrl(src, process.env.NEXT_PUBLIC_SUPABASE_URL);

  let imgSrc = src;
  let srcSet: string | undefined;
  if (optimize) {
    const { props } = getImageProps({ src, alt, width: renderWidth, height: renderWidth });
    imgSrc = props.src;
    srcSet = props.srcSet;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...rest}
      // A new src string must not reuse a previous image's srcSet.
      key={imgSrc}
      src={imgSrc}
      srcSet={srcSet}
      alt={alt}
      onError={(e) => {
        if (optimize) setFailedSrc(src);
        onError?.(e);
      }}
    />
  );
}
