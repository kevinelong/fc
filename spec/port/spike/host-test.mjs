import fs from 'fs';
const bytes = fs.readFileSync('target/wasm32-unknown-unknown/release/fc_spike.wasm');
const { instance } = await WebAssembly.instantiate(bytes, {});
const { memory, step, cmd_buf_ptr, load } = instance.exports;
load(0, 0);                         // (no source yet)
const n = step();                   // run one frame
const base = cmd_buf_ptr();
const dv = new DataView(memory.buffer);
const OPS = {1:'CLEAR',2:'RECT'};
const cmds = [];
for (let i = 0; i < n; i++) {
  const o = base + i*10;
  cmds.push({ op: OPS[dv.getUint8(o)],
    a: dv.getInt16(o+1,true), b: dv.getInt16(o+3,true),
    c: dv.getInt16(o+5,true), d: dv.getInt16(o+7,true), color: dv.getUint8(o+9) });
}
console.log("step() returned", n, "commands:");
console.log(JSON.stringify(cmds, null, 0));
const ok = n===2 && cmds[0].op==='CLEAR' && cmds[0].color===1 && cmds[1].op==='RECT' && cmds[1].a===40 && cmds[1].d===16 && cmds[1].color===8;
console.log(ok ? "\nROUND-TRIP OK — host decoded the WASM command buffer correctly" : "\nMISMATCH");
process.exit(ok?0:1);
