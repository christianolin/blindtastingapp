"use client";

import { useRef, useState } from "react";
import { ImageUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import { ImageLightbox } from "@/components/image-lightbox";
import { createClient } from "@/lib/supabase/client";

// Uploads directly to a Storage bucket from the browser (like
// profile/edit/avatar-uploader.tsx) and exposes the resulting public URL as
// a hidden form field, so it composes into a plain <form action={...}>
// alongside uncontrolled inputs — no need to wire the parent form's state.
export function ImageUploader({
  name,
  bucket,
  folder,
  initialUrl,
  aspectClassName = "aspect-video",
  onChange,
  removable = false,
  onPendingChange,
}: {
  name: string;
  bucket: string;
  folder: string;
  initialUrl?: string | null;
  aspectClassName?: string;
  onChange?: (url: string | null) => void;
  /** Show a "Remove" button once a photo is set; it clears the field and
      calls onChange(null). The Storage object itself is left in place. */
  removable?: boolean;
  /** true when an upload starts, false once it settles (success or failure) —
      lets a parent hold off submitting until the URL actually exists. */
  onPendingChange?: (pending: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(initialUrl ?? null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset so picking the same file again (e.g. after Remove) still fires
    // a change event. The File object stays usable.
    e.target.value = "";
    if (!file) return;

    setPending(true);
    onPendingChange?.(true);
    setError(null);

    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file);
      if (uploadError) {
        setError(uploadError.message);
        return;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from(bucket).getPublicUrl(path);

      setUrl(publicUrl);
      onChange?.(publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload the image.");
    } finally {
      setPending(false);
      onPendingChange?.(false);
    }
  }

  function handleRemove() {
    setUrl(null);
    setError(null);
    onChange?.(null);
  }

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name={name} value={url ?? ""} />
      {url ? (
        <ImageLightbox
          src={url}
          className={`block overflow-hidden rounded-lg border border-border ${aspectClassName}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="size-full cursor-zoom-in object-cover" />
        </ImageLightbox>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => inputRef.current?.click()}
        >
          {pending ? (
            <>
              <WineGlassLoader /> Uploading…
            </>
          ) : (
            <>
              <ImageUp />
              {/* Phones can take a new photo or pick an existing one (accept
                  image/*, no capture); a PC only ever uploads — wording to match. */}
              <span className="sm:hidden">Take or choose image</span>
              <span className="hidden sm:inline">Upload image</span>
            </>
          )}
        </Button>
        {removable && url && !pending ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRemove}
            className="text-muted-foreground"
          >
            Remove
          </Button>
        ) : null}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
