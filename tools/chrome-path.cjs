#!/usr/bin/env node
// One place that knows where Chrome lives.
//
// Three harnesses each kept their own copy of this list and they drifted: class-e2e
// hardcoded the Windows path only, so it passed locally and failed every CI run on
// ubuntu-latest (where Chrome is /usr/bin/google-chrome). tools/checks.mjs also asks
// this module whether the browser exists, so a check's capability gate and the harness
// it gates can never disagree about it again.
//
// CHROME=/path/to/chrome always wins (wrappers, non-standard installs, other builds).
const fs = require('fs');

const CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  return CANDIDATES.find(p => fs.existsSync(p)) || null;
}

module.exports = { findChrome, CANDIDATES };
