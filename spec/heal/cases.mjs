// Eval corpus for the Phase 0 healer. Each case:
//   name        short label
//   src         what a beginner typed
//   want        (optional) exact healed source we expect
//   clean       (optional, default false) true => src is ALREADY good; healer
//               must make ZERO changes and report zero remaining issues
//
// Success for a normal case = zero remaining lint issues AND (if `want` given)
// code === want. Success for a `clean` case = zero changes AND zero remaining.

export const CASES = [
  // ---- verb typos ----
  { name: 'clear typo', src: 'clera screen to black', want: 'clear screen to black' },
  { name: 'draw typo', src: 'darw circle at 64, 64 size 10 in red', want: 'draw circle at 64, 64 size 10 in red' },
  { name: 'write typo', src: 'wrtie "hi" at 10, 10 in white', want: 'write "hi" at 10, 10 in white' },
  { name: 'move typo', src: 'mvoe player with arrows', want: 'move player with arrows' },
  { name: 'play typo', src: 'paly sound "coin"', want: 'play sound "coin"' },
  { name: 'transpose', src: 'darw rect at 0, 0 size 8, 8 in green', want: 'draw rect at 0, 0 size 8, 8 in green' },

  // ---- color typos (single + multi-word + de-spaced) ----
  { name: 'green typo', src: 'clear screen to gren', want: 'clear screen to green' },
  { name: 'white typo', src: 'draw circle at 64, 64 size 8 in whit', want: 'draw circle at 64, 64 size 8 in white' },
  { name: 'blue typo', src: 'clear screen to bleu', want: 'clear screen to blue' },
  { name: 'yellow typo', src: 'write "hi" at 2, 2 in yello', want: 'write "hi" at 2, 2 in yellow' },
  { name: 'multiword color typo', src: 'clear screen to dark gren', want: 'clear screen to dark green' },
  { name: 'despaced color', src: 'clear screen to darkgreen', want: 'clear screen to dark green' },
  { name: 'color with on hud', src: 'write "hi" at 2, 2 in wihte on hud', want: 'write "hi" at 2, 2 in white on hud' },

  // ---- normalizations ----
  { name: 'equals assign', src: 'score = 0', want: 'score is 0' },
  { name: 'dotted equals', src: 'ball.x = 20', want: 'ball.x is 20' },
  { name: 'set to', src: 'set score to 0', want: 'score is 0' },
  { name: 'let equals', src: 'let hp = 3', want: 'hp is 3' },
  { name: 'smart quotes', src: 'write “hello” at 10, 10 in white', want: 'write "hello" at 10, 10 in white' },

  // ---- combined ----
  { name: 'verb + color typos', src: 'clera screen to gren', want: 'clear screen to green' },

  // ---- clean cases: must NOT be touched ----
  { name: 'clean assignment', src: 'ball is {x: 20, y: 70, speed: 1.5}', clean: true },
  { name: 'clean draw', src: 'draw circle at 64, 64 size 20 in red', clean: true },
  { name: 'clean multiword color', src: 'clear screen to dark blue', clean: true },
  { name: 'clean comparison ==', src: 'if score == 10 stop', clean: true },
  { name: 'clean ge operator', src: 'if x >= 5 stop', clean: true },
  { name: 'clean func + call', src: 'to reset\n  score is 0\nreset', clean: true },
  { name: 'clean loop', src: 'repeat with i from 0 to 5\n  draw rect at i, i size 2, 2 in white', clean: true },
  { name: 'clean hex color', src: 'clear screen to #123456', clean: true },
  // 'in' as a loop keyword must NOT be read as a color context
  { name: 'clean each-in loop', src: 'each ball in balls\n  draw circle at ball.x, ball.y size 4 in red', clean: true },
  { name: 'clean add to', src: 'add 1 to score', clean: true },
  { name: 'clean repeat to', src: 'repeat with i from 0 to 5\n  pset i, i in white', clean: true },
  { name: 'clean string with in', src: 'write "log in" at 2, 2 in white', clean: true },

  // more verb typos (extra letter, transposition)
  { name: 'extra-letter verb', src: 'drawe circle at 1, 1 size 2 in red', want: 'draw circle at 1, 1 size 2 in red' },
  { name: 'doubled letter verb', src: 'clearr screen to black', want: 'clear screen to black' },
  { name: 'pset color typo', src: 'pset 10, 20 in gren', want: 'pset 10, 20 in green' },
];
