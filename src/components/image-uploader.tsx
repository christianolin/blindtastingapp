"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { WineGlassLoader } from "@/components/wine-glass-loader";
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
}: {
  name: string;
  bucket: string;
  folder: string;
  initialUrl?: string | null;
  label?: string;
  aspectClassName?: string;
  onChange?: (url: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(initialUrl ?? null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setPending(true);
    setError(null);

    const supabase = createClient();
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file);
    if (uploadError) {
      setError(uploadError.message);
      setPending(false);
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(bucket).getPublicUrl(path);

    setUrl(publicUrl);
    onChange?.(publicUrl);
    setPending(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name={name} value={url ?? ""} />
      {url ? (
        <div className={`overflow-hidden rounded-lg border border-border ${aspectClassName}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="size-full object-cover" />
        </div>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => inputRef.current?.click()}
        className="self-start"
      >
        {pending ? (
          <>
            <WineGlassLoader /> Uploading…
          </>
        ) : url ? (
          "Change photo"
        ) : (
          <>
            {/* Phones can take a new photo or pick an existing one; desktop
                only uploads. The file input (accept image/*, no capture) already
                offers both — this just labels it clearly. */}
            <span className="sm:hidden">Take or upload image</span>
            <span className="hidden sm:inline">Upload image</span>
          </>
        )}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
