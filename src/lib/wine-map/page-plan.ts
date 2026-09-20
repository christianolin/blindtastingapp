// How the map walks a table that is bigger than one PostgREST page.
//
// The grape-filter links (wine_place_grapes, 2 964 rows measured live
// 2026-09-20) used to be walked one page at a time, each page waiting for the
// one before it: three requests in series on every single map load, for a
// filter most visits never touch. On the production trace a Supabase round
// trip costs ~340 ms of network on top of ~20 ms of database time, so those
// two extra waits were ~0.7 s of the map's mount, competing with the tile
// fetches for the connection.
//
// Rows are a contiguous range, so a page after a short page is necessarily
// empty. That makes it safe to ask for several pages AT ONCE and stop at the
// first short one: the speculative pages past the end return `[]` and cost a
// small request, never a wrong answer. Four pages cover 4 000 rows, so the
// whole table arrives in one round trip today with room to grow — and if it
// ever outgrows that, round 1 simply asks for the next four.
//
// Pure (no Supabase import, no browser API) so the whole rule is unit-tested;
// ./grape-filter is the half that makes the requests.

/** PostgREST is configured with db-max-rows = 1000 and silently truncates a
    larger ask, so this is the server's limit rather than a tuning knob. */
export const GRAPE_LINK_PAGE_SIZE = 1000;

/** Pages requested concurrently per round. Four covers 4 000 rows. */
export const GRAPE_LINK_PARALLEL_PAGES = 4;

/**
 * The inclusive `[from, to]` ranges to request together for a given round,
 * counting from 0. Rounds tile the table with no gap and no overlap.
 */
export function pageRanges(
  round: number,
  pageSize: number = GRAPE_LINK_PAGE_SIZE,
  parallel: number = GRAPE_LINK_PARALLEL_PAGES,
): Array<[number, number]> {
  if (!Number.isInteger(round) || round < 0) {
    throw new Error(`pageRanges: round must be a non-negative integer, got ${round}`);
  }
  const ranges: Array<[number, number]> = [];
  for (let index = 0; index < parallel; index += 1) {
    const from = (round * parallel + index) * pageSize;
    ranges.push([from, from + pageSize - 1]);
  }
  return ranges;
}

/**
 * True once a round has seen the end of the table: any page that came back
 * with fewer rows than a full page is the last one with data, and everything
 * after it is empty. A round that returned no pages at all is also the last.
 */
export function roundIsLast(
  pageLengths: number[],
  pageSize: number = GRAPE_LINK_PAGE_SIZE,
): boolean {
  if (pageLengths.length === 0) return true;
  return pageLengths.some((length) => length < pageSize);
}
