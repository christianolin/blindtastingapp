// Pre-flight for the owner's migration applier (spec 2026-09-29 D24).
//
// The applier runs a file inside its own BEGIN, and --dry rolls that back. A
// top-level begin;/commit; INSIDE the file commits partway through, so a "dry"
// rehearsal of such a file applies it for real. This finds every top-level
// transaction statement so the applier can refuse the file before it connects.
// Top level means outside comments (block comments nest, as in Postgres),
// quoted strings (E'' with backslash escapes), quoted identifiers, dollar-quoted
// bodies ($$ and $tag$) and SQL-standard BEGIN ATOMIC ... END function bodies.
const TX = /^(begin|start\s+transaction|commit|end|rollback|abort)\b/i;
const DOLLAR_TAG = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/;

function lineCount(text) {
  let n = 0;
  for (const ch of text) if (ch === "\n") n += 1;
  return n;
}

export function topLevelTransactionStatements(sql) {
  const found = [];
  let code = "";
  let startLine = 1;
  let line = 1;
  let inAtomic = false;
  let i = 0;
  const append = (text) => {
    if (!code.trim() && text.trim()) startLine = line;
    code += text;
  };
  const endStatement = () => {
    const text = code.trim().replace(/\s+/g, " ");
    code = "";
    if (!text) return;
    if (inAtomic) {
      if (/^end$/i.test(text)) inAtomic = false;
      return;
    }
    if (/\bbegin atomic\b/i.test(text) && !/\bbegin atomic end$/i.test(text)) {
      inAtomic = true;
      return;
    }
    if (TX.test(text)) {
      found.push({ line: startLine, statement: text.toLowerCase().split(" ").slice(0, 3).join(" ") });
    }
  };
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (ch === "-" && next === "-") {
      const end = sql.indexOf("\n", i);
      i = end === -1 ? sql.length : end;
      append(" ");
      continue;
    }
    if (ch === "/" && next === "*") {
      let depth = 1;
      let j = i + 2;
      while (j < sql.length && depth > 0) {
        if (sql[j] === "/" && sql[j + 1] === "*") { depth += 1; j += 2; }
        else if (sql[j] === "*" && sql[j + 1] === "/") { depth -= 1; j += 2; }
        else j += 1;
      }
      line += lineCount(sql.slice(i, j));
      i = j;
      append(" ");
      continue;
    }
    if (ch === "'") {
      const backslash = /(^|[^A-Za-z0-9_])[eE]$/.test(code);
      let j = i + 1;
      while (j < sql.length) {
        if (backslash && sql[j] === "\\") { j += 2; continue; }
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") { j += 2; continue; }
          j += 1;
          break;
        }
        j += 1;
      }
      line += lineCount(sql.slice(i, j));
      i = j;
      append("''");
      continue;
    }
    if (ch === '"') {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === '"') {
          if (sql[j + 1] === '"') { j += 2; continue; }
          j += 1;
          break;
        }
        j += 1;
      }
      line += lineCount(sql.slice(i, j));
      i = j;
      append('""');
      continue;
    }
    if (ch === "$" && !/[A-Za-z0-9_]$/.test(code)) {
      const m = DOLLAR_TAG.exec(sql.slice(i, i + 80));
      if (m) {
        const tag = m[0];
        const close = sql.indexOf(tag, i + tag.length);
        const j = close === -1 ? sql.length : close + tag.length;
        line += lineCount(sql.slice(i, j));
        i = j;
        append("$$$$");
        continue;
      }
    }
    if (ch === ";") {
      endStatement();
      i += 1;
      continue;
    }
    if (ch === "\n") line += 1;
    append(ch);
    i += 1;
  }
  endStatement();
  return found;
}
