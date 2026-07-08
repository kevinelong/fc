// Safety net — PHASE 2 scaffold: the LLM tier (structural rewrites + generation
// the deterministic tier can't do). This is the fallback in the cascade
// (docs/SAFETY-NET-PLAN.md): loose/far-from-fc English -> valid, RUNNABLE fc.
//
// The trust comes from the validation gate (validate.mjs): every model output is
// parsed + run for N frames + lint-checked, and a failure is fed back for a
// self-repair retry (<=2). We only ever return code that PASSES the gate.
//
// Usage (needs an Anthropic API key — self-eval of the model call requires it):
//   ANTHROPIC_API_KEY=... node spec/heal/llm-tier.mjs "make a ball bounce left and right"
//   node spec/heal/llm-tier.mjs --dry "clera screen to gren"   # print the prompt, no call
//
// Model: claude-haiku-4-5 is plenty for a small grounded DSL; bump to sonnet if
// eval shows it's needed. Cost/abuse controls (rate limit, spend cap, auth gate)
// belong in the apid/server.js /api/generate proxy, NOT here — this is the
// offline prototype for measuring quality before any endpoint ships.

import { validate } from './validate.mjs';
import { VERBS, COLORS } from './healer.mjs';

const MODEL = 'claude-haiku-4-5-20251001';
const API = 'https://api.anthropic.com/v1/messages';

// Grounding: the language in a nutshell + a few real (intent -> fc) shots. Keep
// these faithful to fc; they carry most of the reliability.
const SYSTEM = `You write programs in "fc", a plain-English fantasy-console language. Output ONLY fc code — no prose, no markdown fences.

fc facts:
- 128x128 screen, 16 colors, 8x8 sprites.
- Variables: \`x is 5\`, \`ball is {x: 20, y: 70, speed: 1.5}\`, \`stars is []\`.
- Assignment uses \`is\` (never \`=\`). Change: \`increase x by 2\`, \`decrease hp by 1\`.
- Loops: \`repeat 5 times\`, \`repeat with i from 0 to 9\`, \`each s in stars\`, \`forever\`.
- Lists: \`add x to list\`, \`item N of list\` (1-based), \`count of list\`.
- Conditionals: \`if x > 10 stop\`, \`if a and b\`, inline or indented blocks.
- Functions: \`to name\` / \`to name at x, y in c\` (params after at/with/in); call \`name at 10, 20 in red\`.
- Draw: \`clear screen to <color>\`, \`draw rect at x, y size w, h in <color>\`, \`draw circle at x, y size r in <color>\`, \`pset x, y in <color>\`, \`write "text" at x, y in <color>\`, \`draw sprite name at x, y\`.
- A game loop: define \`to update\` and \`to draw\`, then \`run game with update and draw\`.
- Keep numbers shown to the player whole. For "once per second" timing use a frame tick: \`tick is 0\` then in update \`increase tick by 1\` and act \`if tick mod 60 is 0\` (60 frames = 1s), rather than adding fractional amounts each frame.
- Colors: ${COLORS.join(', ')}.
- Known verbs: ${VERBS.join(', ')}.
Prefer the smallest program that does what's asked. Keep it readable — fc should read like a design doc.`;

const SHOTS = [
  { in: 'a red ball that bounces left and right',
    out: `ball is {x: 20, y: 64, speed: 2}\nto update\n  increase ball.x by ball.speed\n  if ball.x > 120 ball.speed is 0 - 2\n  if ball.x < 8 ball.speed is 2\nto draw\n  clear screen to black\n  draw circle at ball.x, ball.y size 6 in red\nrun game with update and draw` },
  { in: 'fix this: clera screen to gren',
    out: `clear screen to green` },
  { in: 'a field of 40 white stars scattered on screen',
    out: `stars is []\nrepeat with i from 1 to 40\n  add {x: random 128, y: random 128} to stars\nto draw\n  clear screen to black\n  each s in stars\n    pset s.x, s.y in white\nrun game with update and draw\nto update\n  wait is 0` },
];

function buildMessages(input) {
  const examples = SHOTS.map(s => `Input: ${s.in}\nfc:\n${s.out}`).join('\n\n');
  const user = `${examples}\n\nInput: ${input}\nfc:`;
  return { system: SYSTEM, user };
}

function extractCode(text) {
  const fence = text.match(/```(?:fc)?\n([\s\S]*?)```/);
  return (fence ? fence[1] : text).trim();
}

async function callModel(system, user, apiKey) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 1024, system, messages: [{ role: 'user', content: user }] }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.content || []).map(b => b.text || '').join('');
}

// Generate/repair loop: call the model, gate the result, feed failures back.
export async function llmHeal(input, { apiKey, maxRepairs = 2 } = {}) {
  const { system, user } = buildMessages(input);
  const log = [];
  let convo = user, code = '';
  for (let attempt = 0; attempt <= maxRepairs; attempt++) {
    const raw = await callModel(system, convo, apiKey);
    code = extractCode(raw);
    const v = validate(code);
    log.push({ attempt, ok: v.ok, runs: v.runs, lint: v.lintIssues.length, error: v.error });
    if (v.ok) return { code, ok: true, attempts: attempt + 1, log };
    // self-repair: show the model exactly why it failed and ask for a fix
    const why = v.error ? `it threw: ${v.error}` : `these are invalid: ${v.lintIssues.map(x => `${x.kind} "${x.token}"`).join(', ')}`;
    convo = `${user}\n${code}\n\nThat is not valid fc — ${why}. Return corrected fc only.`;
  }
  return { code, ok: false, attempts: maxRepairs + 1, log };
}

// ---- CLI -------------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const input = args.filter(a => a !== '--dry').join(' ');
  if (!input) { console.error('usage: node spec/heal/llm-tier.mjs [--dry] "<loose fc or description>"'); process.exit(2); }
  const { system, user } = buildMessages(input);
  if (dry) { console.log('=== SYSTEM ===\n' + system + '\n\n=== USER ===\n' + user); process.exit(0); }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { console.error('No ANTHROPIC_API_KEY set. Export it, or use --dry to inspect the prompt.'); process.exit(2); }
  const r = await llmHeal(input, { apiKey });
  console.log(r.ok ? `-- validated in ${r.attempts} attempt(s) --\n${r.code}` : `-- gave up after ${r.attempts} attempts --\n${r.code}\nlog: ${JSON.stringify(r.log)}`);
}
