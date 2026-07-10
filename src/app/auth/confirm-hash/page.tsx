"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Admin-generated links (invite, password recovery) redirect with tokens in
// the URL fragment (#access_token=...&refresh_token=...), not a `?code=`
// query param, and the fragment never reaches the server. @supabase/ssr's
// browser client also hardcodes flowType "pkce", so it does NOT auto-detect
// hash tokens the way a plain supabase-js client would — we have to parse
// the fragment ourselves and call setSession() explicitly.
function ConfirmHash() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function confirm() {
      const next = searchParams.get("next") ?? "/dashboard";
      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      if (!accessToken || !refreshToken) {
        setError("This link has expired. Please ask for a new one.");
        return;
      }

      const supabase = createClient();
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) {
        setError("This link has expired. Please ask for a new one.");
        return;
      }
      router.replace(next);
    }

    confirm();
  }, [router, searchParams]);

  return (
    <p className="text-sm text-muted-foreground">
      {error ?? "Confirming your invite…"}
    </p>
  );
}

export default function ConfirmHashPage() {
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">
            Confirming your invite…
          </p>
        }
      >
        <ConfirmHash />
      </Suspense>
    </div>
  );
}
