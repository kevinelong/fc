// Phase 2 quality eval: run a spread of prompts through the LLM tier and report
// how many produced code that PASSES the validation gate (parses + runs + lint
// clean), and in how many self-repair attempts. Needs a key:
//   ANTHROPIC_API_KEY=... node spec/heal/llm-eval.mjs
import { llmHeal } from './llm-tier.mjs';

const PROMPTS = [
  { name: 'bounce', input: 'make a red ball bounce left and right' },
  { name: 'repair', input: 'fix this: clera screen to gren' },
  { name: 'grid', input: 'draw a grid of white dots, 8 across and 8 down' },
  { name: 'countdown', input: 'a number that counts down from 10 to 0, one per second' },
  { name: 'stars', input: 'a starfield of 50 stars drifting left, wrap around' },
  { name: 'paddle', input: 'a paddle at the bottom that moves with the arrow keys' },
  { name: 'rain', input: 'green matrix-style digits falling down the screen' },
  { name: 'snake-lite', input: 'a dot that leaves a trail as it moves right' },
];

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) { console.error('No ANTHROPIC_API_KEY set.'); process.exit(2); }

let ok = 0;
const rows = [];
for (const p of PROMPTS) {
  try {
    const r = await llmHeal(p.input, { apiKey });
    if (r.ok) ok++;
    rows.push({ p, r });
    console.log(`${r.ok ? '✓' : '✗'} ${p.name.padEnd(10)} attempts=${r.attempts}  ${r.ok ? '' : 'log=' + JSON.stringify(r.log)}`);
  } catch (e) {
    rows.push({ p, err: String(e.message || e) });
    console.log(`✗ ${p.name.padEnd(10)} ERROR ${e.message || e}`);
  }
}
console.log(`\nGate pass: ${ok}/${PROMPTS.length}`);
if (process.argv.includes('-v')) for (const { p, r } of rows) if (r) console.log(`\n=== ${p.name}: ${p.input} ===\n${r.code}`);
