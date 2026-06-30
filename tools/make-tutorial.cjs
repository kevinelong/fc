#!/usr/bin/env node
// Proof-of-concept narrated build tutorial generator.
// Pipeline: SEGMENTS (narration + code-to-type) -> Piper TTS (in the
// parlormystery container) -> paced Playwright screen capture (types each line
// in sync with its narration, then plays the game) -> ffmpeg mux -> mp4.
//
//   NODE_PATH=/tmp/pw2/node_modules node tools/make-tutorial.cjs
// Needs: the parlormystery-game container (Piper), ffmpeg, playwright-core+chromium.
const { chromium } = require('playwright-core');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CHROME = process.env.CHROME || '/usr/bin/chromium';
const VOICE = 'en_US-lessac-medium';
const TMP = '/tmp/tut';
const OUT = path.join(ROOT, 'learn', 'tutorial-catch.mp4');

// Each segment: spoken narration + the code lines appended during it. The
// narration teaches the idea and contrasts other languages with the fc way.
const SEGMENTS = [
  { say: "Let's build Catch — a paddle that catches falling coins. I'll explain each idea, then show the fc way to write it.", code: [] },
  { say: "First, the paddle. In many languages you declare a variable with a type. In fc you just say what it is: paddle is an object at x sixty.", code: ["paddle is {x: 60}"] },
  { say: "A coin starts at the top of the screen, and the score starts at zero.", code: ["coin is {x: 64, y: 0}", "score is 0"] },
  { say: "Every frame, the update function runs. For input, some engines make you poll a device or wire up callbacks. In fc you simply say: if key left, move the paddle. And assignment reads like a sentence — paddle dot x is paddle dot x minus three.", code: ["to update", "  if key \"left\" paddle.x is paddle.x - 3", "  if key \"right\" paddle.x is paddle.x + 3"] },
  { say: "The coin falls by adding to its y each frame. When it drops past the bottom, we send it back to the top at a random x.", code: ["  coin.y is coin.y + 2", "  if coin.y > 124", "    coin.x is 8 + random 112", "    coin.y is 0"] },
  { say: "The draw function also runs every frame. We clear the screen, draw the paddle as a rectangle and the coin as a circle, and write the score. The curly braces drop the score's value into the text.", code: ["to draw", "  clear screen to dark blue", "  draw rect at paddle.x, 120 size 16, 4 in white", "  draw circle at coin.x, coin.y size 4 in yellow", "  write \"catch the coins! {score}\" at 6, 4 in white on hud"] },
  { say: "Finally, run the game with update and draw. That's a whole game, written in plain English. Let's play.", code: ["run game with update and draw"] },
];

function sh(cmd) { return execSync(cmd, { stdio: ['pipe', 'pipe', 'pipe'] }).toString(); }

function synth() {
  // write all narration texts to a json, copy into the container, synth each to a wav, copy the dir out
  fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(TMP, { recursive: true });
  const texts = SEGMENTS.map(s => s.say);
  fs.writeFileSync('/tmp/tut-texts.json', JSON.stringify(texts));
  sh('doas docker cp /tmp/tut-texts.json parlormystery-game:/tmp/tut-texts.json');
  const py = `
import json, wave, io, os
from piper import PiperVoice
v = PiperVoice.load('/app/models/piper/${VOICE}.onnx','/app/models/piper/${VOICE}.onnx.json')
os.makedirs('/tmp/tutout', exist_ok=True)
texts = json.load(open('/tmp/tut-texts.json'))
for i, t in enumerate(texts):
    buf = io.BytesIO()
    with wave.open(buf,'wb') as wf:
        try: v.synthesize_wav(t, wf)
        except AttributeError: v.synthesize(t, wf)
    open('/tmp/tutout/seg%02d.wav'%i,'wb').write(buf.getvalue())
print('ok', len(texts))`;
  fs.writeFileSync('/tmp/tut-synth.py', py);
  sh('doas docker cp /tmp/tut-synth.py parlormystery-game:/tmp/tut-synth.py');
  sh('doas docker exec parlormystery-game python3 /tmp/tut-synth.py');
  sh(`doas docker cp parlormystery-game:/tmp/tutout/. ${TMP}/`);
  const durs = SEGMENTS.map((_, i) => {
    const f = path.join(TMP, 'seg' + String(i).padStart(2, '0') + '.wav');
    return parseFloat(sh(`ffprobe -v error -show_entries format=duration -of csv=p=0 ${f}`).trim());
  });
  console.log('synth durations:', durs.map(d => d.toFixed(1)).join(' '));
  return durs;
}

const FPS = 10;
const FDIR = path.join(TMP, 'frames');

async function capture(durs) {
  fs.rmSync(FDIR, { recursive: true, force: true }); fs.mkdirSync(FDIR, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const p = await browser.newPage();
  await p.setViewportSize({ width: 760, height: 600 });
  const blank = '-- Catch — a paddle catches falling coins\n';
  await p.goto('https://codeonline.io/?code=' + encodeURIComponent(Buffer.from(blank).toString('base64')), { waitUntil: 'load' });
  await p.waitForTimeout(1600);
  await p.evaluate(() => { const e = document.getElementById('editor'); e.value = '-- Catch — a paddle catches falling coins\n'; e.dispatchEvent(new Event('input')); });
  let fi = 0;
  const snap = async () => { await p.screenshot({ path: path.join(FDIR, String(fi).padStart(5, '0') + '.png') }); fi++; };
  for (let i = 0; i < SEGMENTS.length; i++) {
    const target = Math.max(3, Math.round(durs[i] * FPS));   // frames for this segment == duration * fps
    let emitted = 0;
    const last = i === SEGMENTS.length - 1;
    if (last) await p.evaluate(() => { const r = document.getElementById('run-btn'); if (r) r.click(); });
    for (const line of SEGMENTS[i].code) {                    // type each line, one frame each
      await p.evaluate(t => { const e = document.getElementById('editor'); e.value += t + '\n'; e.dispatchEvent(new Event('input')); e.scrollTop = e.scrollHeight; }, line);
      await snap(); emitted++;
    }
    while (emitted < target) {                                // hold the rest of the segment (drive the paddle on the play segment)
      if (last) { await p.keyboard.press(emitted % 2 ? 'ArrowLeft' : 'ArrowRight'); }
      await snap(); emitted++;
    }
  }
  await browser.close();
  console.log('captured', fi, 'frames at', FPS, 'fps');
  return fi;
}

function mux() {
  const list = SEGMENTS.map((_, i) => `file '${path.join(TMP, 'seg' + String(i).padStart(2, '0') + '.wav')}'`).join('\n');
  fs.writeFileSync(path.join(TMP, 'list.txt'), list);
  sh(`ffmpeg -y -f concat -safe 0 -i ${path.join(TMP, 'list.txt')} ${path.join(TMP, 'narration.wav')}`);
  // assemble frames at FPS, attach narration, pad to even dims, 25fps out for smooth playback
  sh(`ffmpeg -y -framerate ${FPS} -i '${path.join(FDIR, '%05d.png')}' -i ${path.join(TMP, 'narration.wav')} ` +
     `-map 0:v:0 -map 1:a:0 -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=25" -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest -movflags +faststart '${OUT}'`);
  const dur = sh(`ffprobe -v error -show_entries format=duration -of csv=p=0 '${OUT}'`).trim();
  console.log('wrote', OUT, '(' + (fs.statSync(OUT).size / 1024 | 0) + ' KB, ' + parseFloat(dur).toFixed(1) + 's)');
}

(async () => {
  const durs = synth();
  await capture(durs);
  mux();
})().catch(e => { console.error(e); process.exit(1); });
