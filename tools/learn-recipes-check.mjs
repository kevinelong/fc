#!/usr/bin/env node
// learn-recipes-check — the tutorials must keep working.
//
// The learn page's HOW-TO RECIPES are complete little programs that people copy into their games.
// Nothing else in the suite reads them: the corpus, the draw/frame tests and the goldens all test
// the engine, not the teaching material, so a language change could quietly turn a documented
// recipe into something that no longer parses. This extracts the RECIPES array out of the page and
// runs every program on the JS core — parse, execute, and five stepped frames so the bodies of
// `to update` / `to draw` really run — failing on a throw or on any runtime diagnostic.
//
//   node tools/learn-recipes-check.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse, Runtime, __step, __bindRT } from '../spec/port/spike/fc-core-record.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = fs.readFileSync(path.join(ROOT, 'learn', 'index.html'), 'utf8');
const m = page.match(/const RECIPES = (\[[\s\S]*?\n\]);/);
if (!m) { console.error('could not find the RECIPES array in learn/index.html'); process.exit(2); }
const recipes = new Function('return ' + m[1])();

let bad = 0;
const lines = [];
for (const [title, , program] of recipes) {
  const rt = new Runtime(); rt.reset(); __bindRT(rt);
  let threw = null;
  try {
    rt.exec(parse(program));
    for (let i = 0; i < 5; i++) __step();       // a few frames, so update/draw are exercised
  } catch (e) { threw = e.message; }
  const errs = (rt.errors || []).slice(0, 3);
  const ok = !threw && errs.length === 0;
  if (!ok) bad++;
  lines.push(`${ok ? 'ok  ' : 'FAIL'}  ${title}${threw ? '  — threw: ' + threw : ''}${errs.length ? '  — ' + JSON.stringify(errs) : ''}`);
}
console.log(lines.join('\n'));
console.log(`\n${recipes.length - bad}/${recipes.length} learn recipes run clean`);
process.exit(bad ? 1 : 0);
