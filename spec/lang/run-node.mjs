// Headless conformance runner. `node run-node.mjs` diffs the extracted core
// against spec/corpus/_goldens.json; `--update` regenerates the goldens from the
// core (authoritative: this core is byte-verified equal to the browser).
import { parse, Runtime } from './fc-core.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const CORPUS = fileURLToPath(new URL('../corpus/', import.meta.url));
export function fcRun(src, seed) {
  const rt = new Runtime(); rt.reset();
  const _r = Math.random;
  if (seed != null) { let a = (seed>>>0)||1; Math.random = () => { a=(a+0x6D2B79F5)|0; let t=Math.imul(a^(a>>>15),1|a); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; }; }
  try { rt.exec(parse(src)); } catch (e) { try { rt.error('threw: '+e.message); } catch(_){} }
  Math.random = _r;
  const vars = {};
  for (const k in rt.vars) { const v = rt.vars[k]; try { vars[k] = (v && typeof v==='object') ? JSON.parse(JSON.stringify(v)) : v; } catch(_) { vars[k]=String(v); } }
  return { say:(rt.sayBuffer||[]).slice(), errors:(rt.errors||[]).slice(), vars };
}
const files = fs.readdirSync(CORPUS).filter(f=>f.endsWith('.fc')).sort();
const seedOf = f => /random/.test(f) ? 12345 : undefined;
// Canonical (recursively key-sorted) form: compare/record by CONTENT, so a key
// insertion-order difference is never reported as a behavior diff.
const canon = v => Array.isArray(v) ? v.map(canon)
  : (v && typeof v === 'object') ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
if (process.argv.includes('--update')) {
  const g = {}; for (const f of files) g[f] = canon(fcRun(fs.readFileSync(path.join(CORPUS,f),'utf8'), seedOf(f)));
  fs.writeFileSync(path.join(CORPUS,'_goldens.json'), JSON.stringify(g, null, 2));
  console.log(`wrote ${files.length} goldens`);
} else {
  const golden = JSON.parse(fs.readFileSync(path.join(CORPUS,'_goldens.json'),'utf8'));
  let match=0, diff=0;
  for (const f of files) {
    const out = fcRun(fs.readFileSync(path.join(CORPUS,f),'utf8'), seedOf(f));
    if (JSON.stringify(canon(out))===JSON.stringify(canon(golden[f]))) match++; else { diff++; console.log('DIFF '+f+'\n  got: '+JSON.stringify(out.vars)); }
  }
  console.log(`${match}/${files.length} match, ${diff} diff`);
  process.exit(diff?1:0);
}
