#!/usr/bin/env node
// reference-check — the command reference must document every verb, and its examples must run.
//
// docs/index.html is the page every user is sent to for "how do I…?", and nothing tested it: the
// learn page got a guard (tools/learn-recipes-check.mjs) because its recipes are copy-paste
// material, and the reference is the same thing at a larger scale — plus it is what makes a verb
// discoverable at all. The definition of "a verb the language knows" is LINT_VERBS in index.html
// (the safety net's vocabulary, drift-checked against the healer), so:
//
//   1. every verb in LINT_VERBS must appear in the reference page, and
//   2. every example on the page must parse, run, and stay quiet (five stepped frames, so the
//      bodies of `to update` / `to draw` really execute).
//
//   node tools/reference-check.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse, Runtime, __step, __bindRT } from '../spec/port/spike/fc-core-record.mjs';
import { NON_VERBS } from '../spec/heal/healer.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = fs.readFileSync(path.join(ROOT, 'docs', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const arr = page.match(/const COMMANDS = (\[[\s\S]*?\n\]);/);
if (!arr) { console.error('could not find the COMMANDS array in docs/index.html'); process.exit(2); }
const commands = new Function('return ' + arr[1])();

const verbSrc = app.match(/const LINT_VERBS = (\[[\s\S]*?\]);/);
if (!verbSrc) { console.error('could not find LINT_VERBS in index.html'); process.exit(2); }
const verbs = new Function('return ' + verbSrc[1])();

let bad = 0;
const failures = [];

// ---- 2. every documented example runs ---------------------------------------
for (const entry of commands) {
  const [category, name, , code] = entry;
  if (typeof code !== 'string' || !code.trim()) continue;      // a few entries are prose-only
  const rt = new Runtime(); rt.reset(); __bindRT(rt);
  let threw = null;
  try {
    rt.exec(parse(code));
    for (let i = 0; i < 5; i++) __step();
  } catch (e) { threw = e.message; }
  const errs = (rt.errors || []).slice(0, 2);
  if (threw || errs.length) {
    bad++;
    failures.push(`  FAIL  ${category} / ${name}${threw ? ' — threw: ' + threw : ' — ' + JSON.stringify(errs)}`);
  }
}
const examples = commands.filter(e => typeof e[3] === 'string' && e[3].trim()).length;

// ---- 1. every implemented verb is documented *in an example* -----------------
// Matching the page's prose would be too weak: "walk with the arrows" appears in a description
// while the `walk` verb itself went undocumented. So the verbs are matched against the example
// *code* on the page, which is the thing a reader can copy.
//
// Eight words in the healer's vocabulary are deliberately not documented, because neither engine
// implements them as statements — they fall through the parser to a bare call and do nothing
// (checked by parsing them: the node type is `call`). Documenting a verb that does nothing would
// be worse than the silence, so they are pinned with their reason instead of being quietly absent.
// The list and the reasons live in `spec/heal/healer.mjs` `NON_VERBS` (one source, so the guard
// and the healer cannot drift), and `spec/heal/eval.mjs` fails if one is dropped from LINT_VERBS —
// dropping one is not free, because heal() would then start rewriting it (e.g. `set` -> `pset`).
const NOT_IMPLEMENTED = NON_VERBS;
const snippetText = commands.map(e => (typeof e[3] === 'string' ? e[3] : '')).join('\n');
const missing = verbs.filter(v => !NOT_IMPLEMENTED.has(v)
  && !new RegExp('\\b' + v + '\\b', 'i').test(snippetText));
const pinned = verbs.filter(v => NOT_IMPLEMENTED.has(v));

if (failures.length) console.log(failures.join('\n'));
if (missing.length) {
  bad++;
  console.log(`  FAIL  undocumented verbs (${missing.length}): ${missing.join(', ')}`);
}
if (pinned.length) {
  console.log(`\nPinned — in LINT_VERBS but not implemented as statements (${pinned.length}):`);
  for (const v of pinned) console.log(`  • ${v} — ${NOT_IMPLEMENTED.get(v)}`);
}
console.log(`\n${examples - failures.length}/${examples} reference examples run clean · ` +
  `${verbs.length - missing.length - pinned.length}/${verbs.length - pinned.length} verbs documented ` +
  `in an example${pinned.length ? ` (${pinned.length} not implemented: ${pinned.join(', ')})` : ''}`);
process.exit(bad ? 1 : 0);
