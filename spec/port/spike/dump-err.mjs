// Pins the diagnostics the JS core reports for err-tests/*.fc.
//
// Run from spec/port/spike:  node dump-err.mjs
// Re-pin after an intentional message change; err-diff.mjs then holds the line.
import fs from 'fs';
import { programs, jsErrors } from './err-lib.mjs';

const golden = {};
for (const p of programs()) golden[p.name] = jsErrors(p.src);
fs.writeFileSync('err-golden.json', JSON.stringify(golden, null, 2) + '\n');
console.log(`wrote err-golden.json — ${Object.keys(golden).length} cases`);
