// The validation gate — the guarantee-enforcer shared by every safety-net tier.
// Given candidate fc, decide whether it's SURFACEABLE: it must (a) run on the
// oracle for a few frames without throwing, and (b) be lint-clean (no unknown
// verbs/colors the deterministic tier would still flag). This is what lets the
// LLM tier (Phase 2) promise "runnable code" instead of hoping — every model
// output passes through here, and failures drive the self-repair retry.
//
//   validate(code) -> { ok, runs, lintIssues, error }
//
// Self-evaluable offline (no API key): validate-eval below asserts every real
// program passes and deliberately-broken snippets fail.

import { parse, Runtime, __CMDS, __step, __bindRT, __setNet } from '../port/spike/fc-core-record.mjs';
import { lint } from './healer.mjs';

export function validate(code, frames = 8) {
  const lintIssues = lint(code);
  let runs = true, error = null;
  try {
    __CMDS.length = 0;
    const rt = new Runtime(); rt.reset(); __bindRT(rt);
    if (__setNet) __setNet([]);
    rt.exec(parse(code));
    for (let i = 1; i < frames; i++) { __bindRT(rt); if (__setNet) __setNet([]); __CMDS.length = 0; __step(); }
  } catch (e) { runs = false; error = String(e && e.message || e); }
  return { ok: runs && lintIssues.length === 0, runs, lintIssues, error };
}
