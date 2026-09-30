// transpile-mirror.mjs — the "real code" panel must say what the engine does.
//
// The panel is a second implementation of the language's *rules* (not just its syntax),
// and it can drift: `draw title` called the function in the runtime while the panel
// still emitted a sprite draw until both were changed together. This checks each
// decided rule where the panel is supposed to mirror the runtime:
//
//   * MIRRORED rules: run the program on the JS core and assert the runtime's effect,
//     then transpile it in all four languages and assert the mirrored form appears;
//   * RUNTIME-ONLY rules are listed with the reason they cannot be mirrored (no sprite
//     table in the transpiler, dispatch rather than translation) — so the list is the
//     record, not an omission.
//
// Run from spec/port/spike:  node transpile-mirror.mjs
import { parse, Runtime, __bindRT, __step } from './fc-core-record.mjs';
import { transpile } from './transpile.mjs';

const LANGS = ['python', 'js', 'lua', 'gdscript'];
let bad = 0;
const fail = m => { bad++; console.log('FAIL ' + m); };

const run = (src) => {
  const rt = new Runtime(); rt.reset(); __bindRT(rt);
  try { rt.exec(parse(src)); } catch (e) { rt.error('threw ' + e.message); }
  return rt;
};

// ---- rules the panel mirrors -------------------------------------------------
const MIRRORED = [
  {
    name: 'draw <name> calls a function of that name (R2)',
    src: 'called is 0\nto title\n  called is called + 1\nto draw\n  clear screen to black\n  draw title\nrun game with update and draw\n',
    runtime: (rt) => rt.vars.called === 1,                 // the function ran
    mirror: { js: /title\(\)/, python: /title\(\)/, lua: /title\(\)/, gdscript: /title\(\)/ },
  },
];

for (const rule of MIRRORED) {
  const rt = run(rule.src);
  if (!rule.runtime(rt)) fail(`${rule.name}: the runtime did not do it (called=${rt.vars.called})`);
  const program = parse(rule.src);
  for (const lang of LANGS) {
    const out = transpile(program, lang);
    if (!rule.mirror[lang].test(out)) {
      fail(`${rule.name}: the ${lang} panel does not mirror it`);
      console.log('  ' + out.split('\n').filter(l => /title/.test(l)).join('\n  '));
    }
  }
  if (!bad) console.log(`ok   ${rule.name}`);
}

// ---- rules the panel deliberately does not mirror ---------------------------
const RUNTIME_ONLY = [
  ['list image inference (R3)', 'the transpiler has no sprite table; the runtime fills the image in'],
  ['to update <mode> dispatch (R5)', 'dispatch, not translation — the panel shows the function as written'],
  ['missing screen placeholder (R6)', 'a drawn fallback and a diagnostic, not a translation'],
  ['the runtime diagnostics', 'messages come from the engine, not from a translation'],
];

console.log(`transpile-mirror: ${MIRRORED.length} mirrored rule(s) checked in ${LANGS.length} languages ` +
  `· ${RUNTIME_ONLY.length} runtime-only rule(s) recorded ${bad ? '· ' + bad + ' FAILURES' : '· OK'}`);
for (const [name, why] of RUNTIME_ONLY) console.log(`  runtime-only: ${name} — ${why}`);
process.exit(bad ? 1 : 0);
