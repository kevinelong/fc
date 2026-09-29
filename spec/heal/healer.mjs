// fc self-healing safety net — PHASE 0: deterministic tier (offline, no LLM).
//
// Goal (see docs/SAFETY-NET-PLAN.md): you never dead-end. Loose/typo'd fc is
// coerced into runnable fc, and every change is REPORTED (never silent). This
// tier handles the common beginner mistakes with zero cost/latency; a later
// LLM tier is the fallback for structural rewrites this can't resolve.
//
// heal(src) -> { code, changes:[{line,from,to,reason}], remaining:[issue] }
//   - code:      healed source (still 100% your text where nothing was wrong)
//   - changes:   what was rewritten and why (drive the "I tidied this" diff UI)
//   - remaining: lint issues this tier could NOT fix (hand these to the LLM tier)
//
// lint(src) -> [issue]  is the detector. fc is deliberately forgiving (an unknown
// verb parses as a no-op, an unknown color silently defaults) so PARSE errors are
// rare — the real "it didn't do what I meant" signal is a lint issue, not a throw.
//
// VOCAB mirrors index.html (LINT_VERBS ~4809, COLORS ~677). eval.mjs asserts they
// still match, so drift is caught rather than shipped.

// VERBS mirrors index.html's LINT_VERBS exactly (drift-checked by eval.mjs).
export const VERBS = ['draw','write','say','add','remove','increase','decrease','clear','toggle','play','move','flash','shake','stop','start','show','hide','emit','double','halve','damage','heal','push','pull','set','put','get','load','save','pset','reverse','spawn','jump','join','broadcast','if','repeat','each','every','return','restore','block','knock','follow','when','else','to','go','face','walk', 'flee', 'flees', 'tween'];

export const COLORS = ['black','dark blue','dark purple','dark green','brown','dark gray','dark grey','light gray','light grey','white','red','orange','yellow','green','blue','indigo','pink','peach','gray','grey','gold','cyan','magenta','purple','lime','sky','coral'];

// Extra leading words the parser dispatches on (parse_line in src/lib.rs) that
// LINT_VERBS omits — a line starting with any of these is legitimate.
export const DISPATCH = ['animate','burst','define','map','tile','time','run','with'];
// structural words that can lead a line (`its x is ...` inside a `with` block,
// `forever`, `while`/`until` loops).
export const STRUCTURAL = ['its', 'forever', 'while', 'until'];
// sprite-behavior verbs; a line `<subject> wanders/chases/patrols ...` is valid,
// so the leading word is a user sprite name, not a typo.
export const BEHAVIOR_WORDS = ['chase','chases','wander','wanders','patrol','patrols', 'flee', 'flees'];
const BEHAVIOR = new Set(BEHAVIOR_WORDS);

// everything that may legitimately lead a statement (so we don't "correct" it)
const LEAD_OK = new Set([...VERBS, ...DISPATCH, ...STRUCTURAL]);
// candidates we're willing to SUGGEST as a correction (real commands only)
const SUGGEST_VERBS = [...new Set([...VERBS, ...DISPATCH])];
const COLOR_SET = new Set(COLORS);

// Damerau-Levenshtein (mirrors index.html:4810) — transposition-aware edit dist.
export function damerau(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    const c = a[i - 1] === b[j - 1] ? 0 : 1;
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[m][n];
}

// is `a` a subsequence of `b`? (i.e. b with some letters deleted == a)
function isSubseq(a, b) {
  let i = 0;
  for (let j = 0; j < b.length && i < a.length; j++) if (a[i] === b[j]) i++;
  return i === a.length;
}

// nearest candidate within a length-scaled distance budget (short words need to
// be closer, so we don't "correct" a 3-letter word into an unrelated one). On a
// tie, prefer a dropped/added-letter typo (subsequence either way) — that's the
// dominant, unambiguous typo class (e.g. "gren" -> "green", not "grey").
function nearest(word, candidates) {
  const budget = word.length <= 3 ? 1 : 2;
  let bd = 99, tied = [];
  for (const c of candidates) {
    const dd = damerau(word, c);
    if (dd < bd) { bd = dd; tied = [c]; }
    else if (dd === bd) tied.push(c);
  }
  if (bd < 1 || bd > budget) return null;
  if (tied.length === 1) return tied[0];
  const subseq = tied.filter(c => isSubseq(word, c) || isSubseq(c, word));
  return subseq.length === 1 ? subseq[0] : null;
}

// color match: exact phrase, else nearest color, else a de-spaced variant
// ("darkgreen" -> "dark green", "gren" -> "green").
function nearestColor(phrase) {
  const p = phrase.toLowerCase().trim();
  if (COLOR_SET.has(p)) return null;            // already valid
  const direct = nearest(p, COLORS);
  if (direct) return direct;
  const squished = p.replace(/\s+/g, '');
  for (const c of COLORS) if (c.replace(/\s+/g, '') === squished) return c;
  const near2 = nearest(squished, COLORS.map(c => c.replace(/\s+/g, '')));
  if (near2) return COLORS.find(c => c.replace(/\s+/g, '') === near2) || null;
  return null;
}

const isComment = t => !t || t.startsWith('--') || t.startsWith('#');
// an assignment statement (target is/are ...) — a command, not a verb line
const ASSIGN = /^[a-zA-Z_]\w*(\.\w+)*\s+(is|are)\b/i;

// Collect user-declared names so calls/refs to them aren't flagged as typos:
// function names, assignment targets, loop vars, `each X in`, `with X` subjects,
// and object keys. High-recall on purpose — better to skip a real typo than to
// "correct" a variable the user legitimately named.
function declaredSymbols(src) {
  const s = new Set();
  for (const raw of src.split('\n')) {
    const line = raw.trim();
    let m;
    if ((m = line.match(/^to\s+(?:screen\s+)?([a-zA-Z_]\w*)/i))) s.add(m[1].toLowerCase());
    if ((m = line.match(/^([a-zA-Z_]\w*)(?:\.\w+)*\s+(?:is|are)\b/i))) s.add(m[1].toLowerCase());
    if ((m = line.match(/^repeat\s+with\s+([a-zA-Z_]\w*)/i))) s.add(m[1].toLowerCase());
    if ((m = line.match(/^each\s+([a-zA-Z_]\w*)\s+in\b/i))) s.add(m[1].toLowerCase());
    if ((m = line.match(/^with\s+([a-zA-Z_]\w*)/i))) s.add(m[1].toLowerCase());
    for (const km of line.matchAll(/([a-zA-Z_]\w*)\s*:/g)) s.add(km[1].toLowerCase());  // object keys
    for (const vm of line.matchAll(/\b([a-zA-Z_]\w*)\s+is\b/gi)) s.add(vm[1].toLowerCase());
  }
  return s;
}

// Find a trailing color phrase and its position: `... in <phrase>` (draw/write/
// pset) or `clear screen to <phrase>` / `clear ... to <phrase>`. Returns
// {keyword, phrase, index} or null. phrase = everything after the keyword.
function trailingColor(line) {
  // strip a trailing "on hud"/"on screen" so it isn't mistaken for the color
  let s = line.replace(/\s+on\s+(hud|screen)\s*$/i, '');
  let m = s.match(/\bin\s+([a-zA-Z][a-zA-Z ]*?)\s*$/);
  if (m) return { keyword: 'in', phrase: m[1].trim(), index: m.index + m[0].indexOf(m[1]) };
  m = s.match(/^\s*clear\b.*\bto\s+([a-zA-Z][a-zA-Z ]*?)\s*$/i);
  if (m) return { keyword: 'to', phrase: m[1].trim(), index: s.lastIndexOf(m[1]) };
  return null;
}

// ---- detector -------------------------------------------------------------
// Precision-first: only flag something we're confident is a mistake AND can
// suggest a fix for. Anything ambiguous (a name we don't recognize, a variable
// used as a color, a behavior line) is left alone — it still runs, and a later
// LLM tier can look deeper. False "corrections" of valid code are the cardinal sin.
export function lint(src) {
  const known = declaredSymbols(src);
  const issues = [];
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i], t = raw.trim();
    if (isComment(t)) continue;
    const lead = t.match(/^([a-zA-Z]\w*)/);
    const leadWord = lead ? lead[1].toLowerCase() : '';
    const second = (t.match(/^[a-zA-Z]\w*\s+([a-zA-Z]\w*)/) || [])[1];

    // 1) unknown leading verb — skip known verbs, declared names, assignments,
    // and `<subject> wanders/chases/...` behavior lines. Only flag with a fix.
    if (lead && !ASSIGN.test(t) && !(second && BEHAVIOR.has(second.toLowerCase()))) {
      if (!LEAD_OK.has(leadWord) && !known.has(leadWord)) {
        const sug = nearest(leadWord, SUGGEST_VERBS);
        if (sug) issues.push({ line: i + 1, kind: 'verb', token: lead[1], suggestion: sug });
      }
    }

    // 2) unknown trailing color — only in a real color context (`in <color>` for
    // draw/write/pset, or `clear ... to <color>`), only if it looks like a
    // misspelled color (a near match exists) and isn't a declared variable.
    const tc = trailingColor(t);
    if (tc) {
      const colorCtx = (tc.keyword === 'in' && ['draw', 'write', 'pset'].includes(leadWord)) || tc.keyword === 'to';
      const p = tc.phrase.toLowerCase();
      if (colorCtx && !COLOR_SET.has(p) && !/^#/.test(p) && !known.has(p)) {
        const sug = nearestColor(p);
        if (sug) issues.push({ line: i + 1, kind: 'color', token: tc.phrase, suggestion: sug });
      }
    }
  }
  return issues;
}

// ---- normalizations (pre-pass) -------------------------------------------
// Rewrite non-fc habits people arrive with, line by line. Each returns the new
// line + a reason, or null if it didn't apply.
const NORMALIZERS = [
  // smart quotes / nbsp -> plain
  { reason: 'straightened smart quotes', fn: l => {
      const n = l.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/ /g, ' ');
      return n !== l ? n : null;
  } },
  // "set X to Y" / "let X = Y" -> "X is Y"
  { reason: 'used fc assignment (is)', fn: l => {
      let m = l.match(/^(\s*)set\s+([a-zA-Z_]\w*(?:\.\w+)*)\s+to\s+(.+)$/i);
      if (m) return `${m[1]}${m[2]} is ${m[3]}`;
      m = l.match(/^(\s*)let\s+([a-zA-Z_]\w*(?:\.\w+)*)\s*=\s*(.+)$/i);
      if (m) return `${m[1]}${m[2]} is ${m[3]}`;
      return null;
  } },
  // bare "X = Y" assignment (single =, not == <= >= !=) -> "X is Y"
  { reason: 'used fc assignment (is)', fn: l => {
      const m = l.match(/^(\s*)([a-zA-Z_]\w*(?:\.\w+)*)\s*=\s*([^=].*)$/);
      if (m && !/[<>!=]=/.test(l.slice(0, l.indexOf('='))) ) return `${m[1]}${m[2]} is ${m[3]}`;
      return null;
  } },
];

// ---- healer ---------------------------------------------------------------
export function heal(src) {
  const changes = [];
  let lines = src.split('\n');

  // pass A: line normalizers
  lines = lines.map((line, i) => {
    let cur = line;
    for (const nz of NORMALIZERS) {
      const out = nz.fn(cur);
      if (out != null && out !== cur) { changes.push({ line: i + 1, from: cur.trim(), to: out.trim(), reason: nz.reason }); cur = out; }
    }
    return cur;
  });

  // pass B: lint-driven token fixes (verbs, colors) to a fixpoint. Re-linting
  // after each round is what lets a fixed verb reveal a color context on the
  // same line (`clera screen to gren` -> clear -> then the color is visible).
  for (let round = 0; round < 4; round++) {
    let applied = 0;
    for (const iss of lint(lines.join('\n'))) {
      if (!iss.suggestion) continue;
      const idx = iss.line - 1;
      const line = lines[idx];
      let out = line;
      if (iss.kind === 'verb') {
        const re = new RegExp('^(\\s*)' + iss.token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
        out = line.replace(re, '$1' + iss.suggestion);
        if (out !== line) changes.push({ line: iss.line, from: line.trim(), to: out.trim(), reason: `"${iss.token}" → "${iss.suggestion}"` });
      } else if (iss.kind === 'color') {
        const at = line.toLowerCase().lastIndexOf(iss.token.toLowerCase());
        if (at >= 0) {
          out = line.slice(0, at) + iss.suggestion + line.slice(at + iss.token.length);
          changes.push({ line: iss.line, from: line.trim(), to: out.trim(), reason: `color "${iss.token}" → "${iss.suggestion}"` });
        }
      }
      if (out !== line) { lines[idx] = out; applied++; }
    }
    if (!applied) break;
  }

  const code = lines.join('\n');
  return { code, changes, remaining: lint(code) };
}
