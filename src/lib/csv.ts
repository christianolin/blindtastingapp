// CSV for "Export the flight" (S13; spec §11.3 item 17): RFC 4180 fields and
// rows, plus a formula-injection guard. Wine, producer and contributor names
// are typed in by people, so a cell such as `=HYPERLINK(…)` must never reach a
// spreadsheet as a formula. The route (`flight-csv.ts`, BT-R4) builds the
// rows; this module only writes them. Pure: no imports.

export type CsvCell = string | number | null | undefined;

// A spreadsheet evaluates a cell that starts with `=`, `+`, `-` or `@`; tab and
// carriage return are the other two starts OWASP's CSV-injection guidance
// lists. Such a string cell gets a `'` prefix, which the spreadsheet shows as
// text. The `-` sits last in the class so it is literal.
const FORMULA_START = /^[=+@\t\r-]/;
// RFC 4180: a field holding a comma, a double quote, CR or LF is quoted.
const NEEDS_QUOTES = /[",\r\n]/;

function csvField(cell: CsvCell): string {
  if (cell == null) return "";
  // Numbers are ours (glass numbers, points), never prefixed: -2 stays -2.
  // A non-finite number is a bug upstream and exports as an empty cell.
  if (typeof cell === "number") return Number.isFinite(cell) ? String(cell) : "";
  const guarded = FORMULA_START.test(cell) ? `'${cell}` : cell;
  return NEEDS_QUOTES.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

/** One record, without its line ending. Null and undefined are empty fields. */
export function csvRow(cells: readonly CsvCell[]): string {
  return cells.map(csvField).join(",");
}

/** Every record ends with CRLF, the last one included. */
export function csvDocument(rows: readonly (readonly CsvCell[])[]): string {
  return rows.map((row) => `${csvRow(row)}\r\n`).join("");
}
