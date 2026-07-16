import { PageLoader } from "@/components/wine-glass-loader";

// Closest loading boundary for the whole tasting section — the lobby page
// plus the nested play/results/wines-new segments (none of which define
// their own loading.tsx), so the shared sidebar layout stays put while any
// of them stream in.
export default function Loading() {
  return <PageLoader label="Decanting…" />;
}
