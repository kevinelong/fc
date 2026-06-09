// dump-ast.mjs — Golden-AST oracle generator for the parser port (Stage 2).
//
// Runs the proven JS parse() over every spec/corpus/*.fc and examples/*.fc
// and writes ast-golden.json mapping "<file>" -> the parsed program.
//
// Output uses a CANONICAL serialization (see SERIALIZATION CONTRACT in
// ast-diff.mjs). Briefly:
//   - object keys recursively sorted ascending (stable, order-independent)
//   - the `lineNum` key is STRIPPED everywhere (trivially reproducible noise)
//   - arrays keep their order; null is emitted as JSON null
//   - 2-space pretty-print, trailing newline
//
// NOTE: to KEEP line numbers (e.g. for error-reporting parity later), delete
// the `if (k === 'lineNum') continue;` line in canonicalize() below. Doing so
// keeps lineNum in the sorted output; the Rust port would then also have to
// emit lineNum to stay byte-compatible.

import { parse } from '../../lang/fc-core.mjs';
import fs from 'fs';
import path from 'path';

const here = import.meta.dirname;

// Recursively rebuild a value with object keys sorted and lineNum stripped.
function canonicalize(v) {
  if (Array.isArray(v)) return v.map(canonicalize);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) {
      if (k === 'lineNum') continue; // strip line numbers (see header note)
      out[k] = canonicalize(v[k]);
    }
    return out;
  }
  return v; // string | number | boolean | null
}

// Replacer is redundant once canonicalize() runs, but kept so the contract is
// satisfied even if a non-canonicalized object ever sneaks through.
function sortReplacer(key, value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = value[k];
    return out;
  }
  return value;
}

// Collect .fc files: corpus then examples, each sorted by filename.
const dirs = [
  path.resolve(here, '../../corpus'),
  path.resolve(here, '../../../examples'),
];
const files = [];
for (const d of dirs) {
  for (const f of fs.readdirSync(d).filter((f) => f.endsWith('.fc')).sort()) {
    files.push([f, path.join(d, f)]);
  }
}

// Count nodes = every object that carries a `type` field (statements + exprs).
function countNodes(v) {
  let n = 0;
  if (Array.isArray(v)) for (const x of v) n += countNodes(x);
  else if (v && typeof v === 'object') {
    if (typeof v.type === 'string') n++;
    for (const k of Object.keys(v)) n += countNodes(v[k]);
  }
  return n;
}

const golden = {};
let nodeCount = 0;
for (const [name, full] of files) {
  const src = fs.readFileSync(full, 'utf8');
  const program = parse(src);
  golden[name] = canonicalize(program);
  nodeCount += countNodes(golden[name]);
}

const outPath = path.resolve(here, 'ast-golden.json');
fs.writeFileSync(outPath, JSON.stringify(golden, sortReplacer, 2) + '\n');

console.log(`Wrote ${outPath}`);
console.log(`program_count: ${files.length}`);
console.log(`node_count: ${nodeCount}`);
