import { VisibilitySelect } from "@/components/sharing/visibility-select";
import { SHARING_COPY, type SharingAudience } from "@/lib/sharing/visibility";

// Owner-only control on /cellar: who may view the cellar, in the same words
// and through the same component as the Sharing card on /profile/edit
// (sharing-defaults spec 2026-09-27 S6, S18). VisibilitySelect keeps the rule
// this control introduced: a failed write snaps back and says what is stored.
export function CellarVisibilityControl({
  userId,
  current,
}: {
  userId: string;
  current: SharingAudience;
}) {
  return (
    <VisibilitySelect
      userId={userId}
      column="cellar_visibility"
      current={current}
      label={SHARING_COPY.cellarControlLabel}
      variant="inline"
    />
  );
}
