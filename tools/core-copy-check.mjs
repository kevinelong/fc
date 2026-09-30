#!/usr/bin/env node
// core-copy-check.mjs — the JS core exists in three places and must stay one program:
//   * index.html            (the browser's JS fallback engine — the source of truth)
//   * spec/lang/fc-core.mjs (the headless oracle, "EXTRACTED from index.html")
//   * spec/port/spike/fc-core-record.mjs (the same core + a recording ctx)
//
// The spike README claims the extracted core is "byte-verified equal to the browser",
// but nothing checked it, and the copies had already drifted (in comments, and once in
// a whole language feature). This compares them declaration by declaration: every
// top-level `function x(...)` / `class X` in two copies must have identical CODE —
// comments and blank lines stripped, line endings normalised — so editing a comment is
// allowed, editing behaviour is not.
//
//   node tools/core-copy-check.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = path.join(ROOT, 'index.html');
const CORE = path.join(ROOT, 'spec', 'lang', 'fc-core.mjs');
const RECORD = path.join(ROOT, 'spec', 'port', 'spike', 'fc-core-record.mjs');

const DECL = /^(?:export\s+)?(?:async\s+)?(?:function\s+([A-Za-z_$][\w$]*)|class\s+([A-Za-z_$][\w$]*))/;

// Top-level declarations all start at column 0 in this codebase, so the next such line
// bounds the previous one — no brace counting (strings full of `{` would fool that).
function declarations(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const marks = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(DECL);
    if (m && /^[A-Za-z]/.test(lines[i]) === true || (m && lines[i].startsWith('export'))) marks.push([i, m[1] || m[2]]);
  }
  const out = new Map();
  for (const [start, name] of marks) {
    // a top-level declaration ends at the next `}` in column 0 (the style throughout
    // this file); one-liners balance on their own line
    let end = start + 1;
    const opens = (lines[start].match(/{/g) || []).length, closes = (lines[start].match(/}/g) || []).length;
    if (opens !== closes) {
      let j = start + 1;
      while (j < lines.length && lines[j] !== '}') j++;
      end = Math.min(j + 1, lines.length);
    }
    if (!out.has(name)) out.set(name, lines.slice(start, end).join('\n'));
  }
  return out;
}

// statement code only: comments gone, and ALL whitespace collapsed — the generated
// copies reformat long statements onto one line, which is not a behaviour difference
const codeOnly = src => src.split('\n')
  .map(l => l.replace(/\/\/.*$/, ''))
  .join('\n')
  .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))   // \u2026 == the character
  .replace(/\s+/g, '');

// Declarations that are *deliberately* different, with the reason. Everything else must
// match; this list is the only place a difference is allowed to live.
const KNOWN = new Map([
  ['resolveColor', 'the app remaps colours for colourblind-safe display (presentation)'],
  ['drawSprite', 'the app paints through that remap; the oracle draws raw pixels'],
  ['drawText', 'the record core records a text op instead of painting the font'],
]);

const htmlDecls = declarations(fs.readFileSync(HTML, 'utf8'));
let bad = 0;
for (const [label, file] of [['fc-core.mjs', CORE], ['fc-core-record.mjs', RECORD]]) {
  const other = declarations(fs.readFileSync(file, 'utf8'));
  let checked = 0;
  for (const [name, src] of other) {
    const inHtml = htmlDecls.get(name);
    if (!inHtml) continue;                    // a .mjs-only helper or stub: not shared
    checked++;
    if (KNOWN.has(name)) continue;               // deliberate, documented difference
    if (codeOnly(inHtml) !== codeOnly(src)) {
      bad++;
      console.log(`DRIFT ${label}: ${name} differs from index.html`);
      const a = codeOnly(inHtml), b = codeOnly(src);
      let k = 0; while (k < a.length && k < b.length && a[k] === b[k]) k++;
      console.log(`  first difference at character ${k} (of ${a.length} vs ${b.length})`);
      console.log(`    index.html        : ${JSON.stringify(a.slice(Math.max(0, k - 40), k + 60))}`);
      console.log(`    ${label}: ${JSON.stringify(b.slice(Math.max(0, k - 40), k + 60))}`);
    }
  }
  console.log(`  ${label}: ${checked - KNOWN.size} shared declarations compared (${KNOWN.size} known presentation differences skipped)`);
}
if (bad) { console.log(`core-copy-check: ${bad} DRIFTED declaration(s)`); process.exit(1); }
console.log('core-copy-check: OK — every shared declaration is identical code');
