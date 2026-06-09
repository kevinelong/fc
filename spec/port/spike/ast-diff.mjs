// ast-diff.mjs — Differential test for the parser port (Stage 2).
//
// Loads the golden AST (ast-golden.json, produced by dump-ast.mjs from the
// proven JS parser) and a candidate rust-ast.json (produced later by the Rust
// port). Diffs per file, prints the FIRST mismatching path per file, and a
// match/total tally. Exits non-zero on any mismatch (or missing rust file).
//
// ============================================================================
// SERIALIZATION CONTRACT
// ----------------------------------------------------------------------------
// Both ast-golden.json and rust-ast.json MUST follow this contract exactly so
// that a byte-for-byte (and structural) comparison is meaningful.
//
//  1. TOP LEVEL: a JSON object mapping "<filename.fc>" -> <program>, where
//     <program> is the array of top-level statement nodes returned by parse().
//     Files are emitted in this order: spec/corpus/*.fc sorted ascending by
//     filename, then examples/*.fc sorted ascending by filename. (Top-level
//     key order does not affect the structural diff, which is order-independent
//     for objects, but the Rust side SHOULD match it for clean byte diffs.)
//
//  2. OBJECT KEYS: recursively sorted in ascending (default JS string) order at
//     every nesting level. This makes output independent of insertion order.
//
//  3. lineNum STRIPPED: the `lineNum` key is removed from every node, at every
//     level, before serialization. Line numbers are trivially reproducible and
//     would only add noise to structural diffs. The Rust port MUST NOT emit a
//     `lineNum` key. (To re-enable, see the header note in dump-ast.mjs.)
//
//  4. ARRAYS: preserve their natural order (NOT sorted). Statement bodies,
//     argument lists, list literals, etc. are order-significant.
//
//  5. NULL: emitted as JSON `null` (e.g. `thenStmt: null` on a block `if`).
//     Rust must emit JSON null for these, not omit the key and not use a
//     placeholder. Absent-vs-null is a meaningful difference.
//
//  6. NUMBERS: JS numbers; integers print without a decimal point (1, not 1.0),
//     per JSON.stringify. Rust must serialize numeric literal values the same
//     way (integral values as integers).
//
//  7. STRINGS: standard JSON string escaping.
//
//  8. FORMATTING: 2-space pretty-print with a single trailing newline. (Only
//     relevant for an exact byte diff; the structural diff below ignores
//     whitespace.)
// ============================================================================

import fs from 'fs';
import path from 'path';

const here = import.meta.dirname;
const goldenPath = path.resolve(here, 'ast-golden.json');
const rustPath = path.resolve(here, 'rust-ast.json');

function load(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    return null;
  }
}

const golden = load(goldenPath);
if (!golden) {
  console.error(`Missing or unreadable golden file: ${goldenPath}`);
  console.error('Run dump-ast.mjs first.');
  process.exit(2);
}

const rust = load(rustPath);
if (!rust) {
  console.error(`Candidate rust-ast.json not found at ${rustPath}.`);
  console.error('Nothing to diff yet — produce it from the Rust port, then re-run.');
  process.exit(2);
}

// Return the first differing path between two canonical values, or null if
// they are structurally identical. Path is a dotted/indexed string.
function firstDiff(a, b, p = '') {
  if (a === b) return null;
  const ta = typeofTag(a), tb = typeofTag(b);
  if (ta !== tb) return `${p || '<root>'}: type ${ta} vs ${tb}`;

  if (ta === 'array') {
    if (a.length !== b.length) return `${p}.length: ${a.length} vs ${b.length}`;
    for (let i = 0; i < a.length; i++) {
      const d = firstDiff(a[i], b[i], `${p}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  if (ta === 'object') {
    const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
    const all = Array.from(new Set([...ka, ...kb])).sort();
    for (const k of all) {
      if (!(k in a)) return `${p}.${k}: missing on left (golden), present on right`;
      if (!(k in b)) return `${p}.${k}: present on left (golden), missing on right`;
      const d = firstDiff(a[k], b[k], `${p}.${k}`);
      if (d) return d;
    }
    return null;
  }
  // primitive (already known unequal)
  return `${p || '<root>'}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`;
}

function typeofTag(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

const files = Array.from(new Set([...Object.keys(golden), ...Object.keys(rust)])).sort();
let match = 0;
const total = files.length;
for (const f of files) {
  if (!(f in golden)) {
    console.log(`MISS ${f}: present in rust, absent in golden`);
    continue;
  }
  if (!(f in rust)) {
    console.log(`MISS ${f}: present in golden, absent in rust`);
    continue;
  }
  const d = firstDiff(golden[f], rust[f]);
  if (d === null) match++;
  else console.log(`DIFF ${f}: ${d}`);
}

console.log(`\nParser differential test: ${match}/${total} programs match`);
process.exit(match === total ? 0 : 1);
