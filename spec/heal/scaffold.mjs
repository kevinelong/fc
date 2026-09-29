// Safety net — PHASE 3: the runnable-scaffold floor.
//
// The promise is "type English — it always runs, and you can always see what it's
// doing". The deterministic tier (healer.mjs) fixes near-fc input and the LLM tier
// (llm-tier.mjs) interprets far-from-fc input, but both can fail (no key, too vague,
// a dead end the gate rejects). This tier is the FLOOR: something that certainly
// runs, shows the user's own words back as comments, and asks which of two
// directions they meant. It never replaces their text on its own.
//
//   scaffold(src) -> { code, options: [{name, blurb, code}, …], note }
//
// Every starter is a real, small, self-contained fc program and MUST pass the
// validation gate (validate.mjs — parse + N frames + lint-clean); eval.mjs asserts
// that, so the floor can never offer broken code.

export const STARTERS = [
  {
    name: 'collect',
    blurb: 'a game you steer with the arrows, grabbing things for score',
    keys: ['collect', 'coin', 'grab', 'catch', 'score', 'player', 'move', 'walk', 'adventure', 'quest', 'run', 'jump', 'eat', 'dragon', 'snake'],
    code: `player is {x: 60, y: 100}
coin is {x: 40, y: 30}
score is 0

to update
  move player with arrows speed 2
  if player.x > coin.x - 8 and player.x < coin.x + 8 and player.y > coin.y - 8 and player.y < coin.y + 8
    coin.x is random 110
    coin.y is random 110
    increase score

to draw
  clear screen to black
  draw rect at coin.x, coin.y size 8, 8 in gold
  draw rect at player.x, player.y size 8, 8 in green
  write "score {score}" at 2, 2 in white on hud

run game with update and draw
`,
  },
  {
    name: 'bounce',
    blurb: 'a ball that bounces around the screen forever',
    keys: ['bounce', 'ball', 'paddle', 'pong', 'wall', 'brick', 'breakout', 'tennis', 'pong'],
    code: `ball is {x: 20, y: 20, dx: 2, dy: 2}

to update
  ball.x is ball.x + ball.dx
  ball.y is ball.y + ball.dy
  if ball.x > 120 ball.dx is 0 - ball.dx
  if ball.x < 0 ball.dx is 0 - ball.dx
  if ball.y > 120 ball.dy is 0 - ball.dy
  if ball.y < 0 ball.dy is 0 - ball.dy

to draw
  clear screen to black
  draw circle at ball.x, ball.y size 6 in yellow

run game with update and draw
`,
  },
  {
    name: 'shoot',
    blurb: 'a ship you steer that fires when you press space',
    keys: ['shoot', 'fire', 'space', 'enemy', 'invader', 'laser', 'bullet', 'ship', 'blast', 'alien', 'fight', 'defend'],
    code: `ship is {x: 60, y: 110}
shot is {x: -10, y: -10}
firing is no

to update
  move ship with arrows speed 3
  if key "space" is pressed
    firing is yes
    shot.x is ship.x
    shot.y is ship.y
  if firing is yes
    shot.y is shot.y - 4
    if shot.y < -8 firing is no

to draw
  clear screen to black
  if firing is yes draw rect at shot.x, shot.y size 3, 6 in white
  draw rect at ship.x, ship.y size 10, 6 in cyan

run game with update and draw
`,
  },
  {
    name: 'stars',
    blurb: 'stars drifting past, like flying through space',
    keys: ['star', 'space', 'fly', 'fall', 'rain', 'drift', 'particle', 'random', 'sky', 'night', 'galaxy'],
    code: `stars is []
repeat with i from 1 to 40
  add {x: random 128, y: random 128, speed: (random 3) + 1} to stars

to update
  each s in stars
    decrease s.x by s.speed
    if s.x < 0
      s.x is 128
      s.y is random 128

to draw
  clear screen to black
  each s in stars
    draw rect at s.x, s.y size 1, 1 in white

run game with update and draw
`,
  },
];

// Score the user's words against each starter's keywords; the two best become the
// "did you mean …?" pair, the best is what we actually offer to run.
export function pick(src, starters = STARTERS) {
  const words = String(src || '').toLowerCase().match(/[a-z]+/g) || [];
  const seen = new Set(words);
  // stem-tolerant: "stars" hits "star", "bouncing" hits "bounce"
  const hits = k => words.some(w => w === k || (k.length >= 3 && w.startsWith(k)) || (w.length >= 3 && k.startsWith(w))) ? 1 : 0;
  const scored = starters.map(s => ({ s, hits: s.keys.reduce((n, k) => n + hits(k), 0) }));
  scored.sort((a, b) => b.hits - a.hits || a.s.name.localeCompare(b.s.name));
  const primary = scored[0].s;
  const options = [scored[0].s, scored[1].s];
  return { primary, options, scored };
}

export function scaffoldHeader(src) {
  const asked = String(src || '').split('\n').map(l => l.trim()).filter(Boolean).slice(0, 6);
  return [
    '-- What you wrote (kept here so nothing is lost):',
    ...asked.map(l => '--   ' + l),
    '--',
    '-- That did not run yet, so here is the closest thing that DOES run.',
    '-- Change any line and press run — this is a normal fc program.',
    '',
  ].join('\n');
}

// The full program we would load for a given starter: the user's words as
// comments, then the starter itself.
export function scaffoldFor(src, starter) {
  return scaffoldHeader(src) + starter.code;
}

export function scaffold(src, starters = STARTERS) {
  const { primary, options } = pick(src, starters);
  return {
    code: scaffoldFor(src, primary),
    options: options.map(o => ({ name: o.name, blurb: o.blurb, code: scaffoldFor(src, o), starter: o })),
    note: `offered the "${primary.name}" starter (did you mean: ${options.map(o => o.name).join(' or ')}?)`,
  };
}
