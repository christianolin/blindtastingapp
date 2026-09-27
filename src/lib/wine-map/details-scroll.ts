// The md+ Details body goes back to its top for every new place (spec
// 2026-09-27 M7), including a place selected while the card was collapsed
// (xl's Collapse details, or md-xl's Hide panel). A collapsed card is
// display:none, so it has no layout box and scrolling it does nothing; when
// the box comes back, Chrome and Safari restore the offset it had before. So
// the reset waits until the card is shown, and it runs once per place: a plain
// collapse and reopen of the same place keeps the reader where they were.

/** Whether the Details body should be sent back to its top now: the card is
    shown and its body has not yet been reset for the selected place.
    `resetFor` is the place the last reset ran for (null before any). */
export function detailsTopDue(
  shown: boolean,
  selectedKey: string | null,
  resetFor: string | null,
): boolean {
  return shown && selectedKey !== resetFor;
}
