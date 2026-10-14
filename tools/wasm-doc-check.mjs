#!/usr/bin/env node
// wasm-doc-check — spec/WASM.md must describe the core that actually ships.
//
// Why: WASM.md §3.2 spent months specifying a binary command buffer the core never emitted
// (it emits JSON records the host parses, `src/lib.rs` `emit_cmd`), and the `store`/`song`
// ops plus the `seed_store` export added on 2026-10-12 appeared nowhere in it. A wrong ABI
// doc is worse than no doc — someone ports against it. Both sides are machine-readable, so
// the mismatch is checkable rather than a promise to re-read the prose:
//
//   1. the `op` set emitted by `emit_cmd` in src/lib.rs == the ops tabled under §3.2;
//   2. every `#[no_mangle]` export in src/lib.rs is named in WASM.md.
//
// Scope note: §2's byte-opcode table is a historical *sketch* (now labelled as such) and is
// deliberately not compared — it is not the wire format. The §3.2 table is.
//
//   node tools/wasm-doc-check.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rs = fs.readFileSync(path.join(ROOT, 'spec', 'port', 'spike', 'src', 'lib.rs'), 'utf8');
const md = fs.readFileSync(path.join(ROOT, 'spec', 'WASM.md'), 'utf8');

let bad = 0;
const fail = msg => { bad++; console.log('  FAIL  ' + msg); };

// ---- 1. the emitted-command `op` set vs the §3.2 table ----------------------
// Emitted form in Rust source: out.push_str(",\"op\":\"rect\",...")
const emitted = new Set([...rs.matchAll(/\\"op\\":\\"([a-z]+)\\"/g)].map(m => m[1]));

// The §3.2 section only (the §2 sketch also tables ops, with byte columns and uppercase names).
const s32 = md.slice(md.indexOf('### 3.2 '), md.indexOf('### 3.3 '));
if (!s32) fail('could not find the §3.2 section in spec/WASM.md');
const documented = new Set([...s32.matchAll(/^\|\s*`([a-z][a-z_]*)`\s*\|/gm)].map(m => m[1]));

const undoc = [...emitted].filter(op => !documented.has(op)).sort();
const stale = [...documented].filter(op => !emitted.has(op)).sort();
if (undoc.length) fail(`op(s) the core emits but §3.2 does not document: ${undoc.join(', ')}`);
if (stale.length) fail(`op(s) §3.2 documents but the core does not emit: ${stale.join(', ')}`);

// ---- 2. every export the HOST calls is named in the doc ---------------------
// Scoped to the host's own usage (index.html's WASMCORE calls `w.<name>(`) intersected with
// the real exports, so legacy/internal `pub extern "C" fn`s in lib.rs (reset_arena, tok_ptr,
// parse_to_json, …) are not demanded of the doc — only the ABI the page depends on.
const exportsInRs = new Set([...rs.matchAll(/pub extern "C" fn (\w+)/g)].map(m => m[1]));
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const hostUsed = [...new Set([...html.matchAll(/\bw\.(\w+)\(/g)].map(m => m[1]))].filter(n => exportsInRs.has(n)).sort();
const unnamed = hostUsed.filter(name => !md.includes('`' + name));
if (unnamed.length) fail(`export(s) the host calls but spec/WASM.md does not name: ${unnamed.join(', ')}`);

console.log(`  ${emitted.size} ops emitted, ${documented.size} tabled, ${hostUsed.length} host-used exports checked`);
console.log(`\nwasm-doc-check: ${bad ? 'FAIL' : 'OK'} · ${emitted.size} ops · ${hostUsed.length} exports · ${bad ? bad + ' problem(s)' : 'OK'}`);
process.exit(bad ? 1 : 0);
