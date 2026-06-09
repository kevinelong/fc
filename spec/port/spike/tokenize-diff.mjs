import { tokenizeLine } from '../../lang/fc-core.mjs';
import fs from 'fs';
import path from 'path';
const wasm = (await WebAssembly.instantiate(fs.readFileSync('target/wasm32-unknown-unknown/release/fc_spike.wasm'), {})).instance.exports;
const { memory, input_ptr, tok_ptr, indent, tokenize } = wasm;
const TYPE = {1:'string',2:'number',3:'word',4:'operator',5:'dot',6:'comma',7:'lparen',8:'rparen',9:'lbracket',10:'rbracket',11:'lbrace',12:'rbrace'};
const enc = new TextEncoder(), dec = new TextDecoder();

function wasmTok(line) {
  const bytes = enc.encode(line);
  const ip = input_ptr();
  new Uint8Array(memory.buffer, ip, bytes.length).set(bytes);
  const n = tokenize(bytes.length);
  const ind = indent();
  const dv = new DataView(memory.buffer), tp = tok_ptr();
  const toks = [];
  for (let k = 0; k < n; k++) {
    const o = tp + k*5;
    const type = TYPE[dv.getUint8(o)];
    const start = dv.getUint16(o+1, true), len = dv.getUint16(o+3, true);
    let value = dec.decode(new Uint8Array(memory.buffer, ip+start, len));
    if (type === 'number') value = parseFloat(value);
    toks.push({ type, value });
  }
  return { indent: ind, toks };
}
function jsTok(line) {
  const t = tokenizeLine(line);
  return { indent: t.indent, toks: Array.from(t, x => ({ type: x.type, value: x.value })) };
}

// every line of the corpus + the 9 example games
const lines = [];
for (const d of ['../../corpus', '../../../examples']) {
  for (const f of fs.readdirSync(path.resolve(import.meta.dirname, d)).filter(f => f.endsWith('.fc'))) {
    fs.readFileSync(path.resolve(import.meta.dirname, d, f), 'utf8').split('\n').forEach((ln, i) => lines.push([f+':'+(i+1), ln]));
  }
}
let ok = 0, bad = 0, shown = 0;
for (const [where, line] of lines) {
  const a = jsTok(line), b = wasmTok(line);
  if (JSON.stringify(a) === JSON.stringify(b)) ok++;
  else { bad++; if (shown++ < 12) console.log(`DIFF ${where}  «${line}»\n  js:   ${JSON.stringify(a)}\n  wasm: ${JSON.stringify(b)}`); }
}
console.log(`\nLexer differential test: ${ok}/${lines.length} lines match, ${bad} diff`);
process.exit(bad ? 1 : 0);
