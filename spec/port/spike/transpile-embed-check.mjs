// Guards the "one source, two homes" invariant for the transpiler.
//
// transpile.mjs is the source of truth; an identical copy of the region between
// the FC-TRANSPILE sentinels is inlined into index.html (so the single-file app
// needs no build). This asserts the two copies are byte-identical. If it fails,
// re-inject with tools (see the injection step) or copy the region by hand.
//
// Run:  node transpile-embed-check.mjs      (from spec/port/spike)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const BEGIN = '// <FC-TRANSPILE-BEGIN>';
const END = '// <FC-TRANSPILE-END>';

// Line endings are a checkout artifact (git stores LF; Windows checkouts get CRLF),
// so compare the region's CONTENT: normalize before comparing, and keep both files
// free to be edited by tools that write LF.
function region(text, where) {
  const b = text.indexOf(BEGIN), e = text.indexOf(END);
  if (b < 0 || e < 0) { console.error(`FAIL: sentinels not found in ${where}`); process.exit(1); }
  return text.slice(b, e + END.length).replace(/\r\n/g, '\n');
}

const mod = region(fs.readFileSync(path.join(__dirname, 'transpile.mjs'), 'utf8'), 'transpile.mjs');
const html = region(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), 'index.html');

if (mod === html) {
  console.log(`transpile-embed-check: OK — index.html inlined copy matches transpile.mjs (line endings ignored) (${mod.split('\n').length} lines).`);
  process.exit(0);
}

// find first differing line for a helpful message
const a = mod.split('\n'), b = html.split('\n');
const n = Math.max(a.length, b.length);
for (let i = 0; i < n; i++) {
  if (a[i] !== b[i]) {
    console.error(`transpile-embed-check: DRIFT at region line ${i + 1}`);
    console.error(`  transpile.mjs: ${JSON.stringify(a[i])}`);
    console.error(`  index.html   : ${JSON.stringify(b[i])}`);
    break;
  }
}
process.exit(1);
