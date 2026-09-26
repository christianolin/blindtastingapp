// A mouse or trackpad: `(pointer: fine)` matches. The app's touch rule
// (src/components/ui/popover.tsx): a popup that takes focus as it opens on a
// phone pops the keyboard or yanks the page, so a sheet or popover moves focus
// in, and hands it back on close, only on a fine pointer. One copy for the
// tour sheet and the training room's candidates.
export function finePointer(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: fine)").matches
  );
}
