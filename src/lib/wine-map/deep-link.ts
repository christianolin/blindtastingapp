/**
 * Decides how the map explorer should react to the `?place=` prop coming from
 * the server component.
 *
 * Extracted as a pure function because the inline version of this rule shipped
 * broken twice, in two different ways, and both times it looked right when read
 * (see deep-link.test.ts). It is three variables and one decision, so it is
 * cheap to pin down exactly.
 *
 * The invariant that matters: `initialPlaceKey` is a SERVER-COMPONENT prop, and
 * selecting a place only calls `history.replaceState` — deliberately, to avoid a
 * server round-trip. So the prop CANNOT move in response to a selection. Any
 * rule that compares the prop against something a selection changes will
 * therefore fire on every selection and undo it.
 *
 * The only sound signal is "the prop changed since the last render", which means
 * a real navigation happened.
 */
export type DeepLinkState = {
  /** `?place=` as rendered by the server component. */
  initialPlaceKey: string | null;
  /** The last `initialPlaceKey` this component acted on. */
  lastInitialKey: string | null;
  /** What is selected right now. */
  selectedKey: string | null;
};

export type DeepLinkAction = {
  /** Advance the watermark to this value. */
  nextWatermark: string;
  /** Select this key, or null to leave the selection alone. */
  select: string | null;
};

/** `null` = do nothing at all. */
export function deepLinkAction({
  initialPlaceKey,
  lastInitialKey,
  selectedKey,
}: DeepLinkState): DeepLinkAction | null {
  if (!initialPlaceKey) return null;
  // Prop unchanged => no navigation happened => never touch the selection.
  if (initialPlaceKey === lastInitialKey) return null;
  return {
    nextWatermark: initialPlaceKey,
    // A navigation to what is already selected still advances the watermark,
    // but must not restart the context fetch or re-fly the camera.
    select: initialPlaceKey === selectedKey ? null : initialPlaceKey,
  };
}
