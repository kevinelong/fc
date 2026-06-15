// Inline the built fc_spike.wasm into index.html as base64, so the single-file
// app is self-contained (offline / PWA / APK; no separate .wasm fetch) and the
// wasm is version-controlled with the HTML. Run after rebuilding the core:
//   cargo build --release --target wasm32-unknown-unknown   (in spec/port/spike/)
//   node spec/port/spike/inline-wasm.mjs
// Replaces the content between the FC_WASM markers in index.html.
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const wasm = readFileSync(join(here, 'target', 'wasm32-unknown-unknown', 'release', 'fc_spike.wasm'));
const b64 = wasm.toString('base64');

const htmlPath = join(here, '..', '..', '..', 'index.html');   // repo-root index.html
let html = readFileSync(htmlPath, 'utf-8');

const begin = '/* FC_WASM_BEGIN */';
const end = '/* FC_WASM_END */';
const re = new RegExp(`${begin.replace(/[*/]/g, '\\$&')}[\\s\\S]*?${end.replace(/[*/]/g, '\\$&')}`);
if (!re.test(html)) {
  console.error('FC_WASM markers not found in index.html — add the placeholder first.');
  process.exit(1);
}
html = html.replace(re, `${begin} window.FC_WASM_B64 = "${b64}"; ${end}`);
writeFileSync(htmlPath, html);
console.log(`inlined ${wasm.length} bytes wasm -> ${b64.length} base64 chars into index.html`);
