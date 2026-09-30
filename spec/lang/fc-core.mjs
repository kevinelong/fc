// fc language core — EXTRACTED from index.html (regenerate via spec/lang/extract; do not hand-edit).
// Real language code below; ONLY the platform (canvas/audio/net/DOM/input) is stubbed
// no-op so the pure core runs headless in Node for conformance.
const noop = function () {};
const mkProxy = (extra) => new Proxy(extra || {}, { get: (t, k) => (k in t ? t[k] : noop), set: () => true });
const ctx = mkProxy({});
const canvas = { width: 128, height: 128, getContext: () => ctx };
const AUDIO = mkProxy({});
// `flash screen` / `shake camera` are HOST-rendered presentation effects. The oracle
// records nothing (the .mjs record core pushes commands; the page paints them).
const FX = { flash: noop, shake: noop };
const NET = mkProxy({ peers: [], connected: () => false });
// STORE stub: JSON round-trip parity with the browser's localStorage-backed STORE.
const STORE = (() => { const m = new Map(); return {
  set(k, v) { try { m.set(String(k), JSON.stringify(v)); } catch (_) {} },
  get(k) { const s = m.get(String(k)); return s === undefined ? undefined : JSON.parse(s); },
}; })();
const editor = { value: '' };
const errorsDiv = { textContent: '' };
const requestAnimationFrame = noop, cancelAnimationFrame = noop, clearInterval = noop;
const setInterval = () => 0;
const performance = { now: () => 0 };
const document = { getElementById: () => null, createElement: () => ({ getContext: () => ctx, style: {} }) };
const window = {};
const location = { hostname: 'localhost', protocol: 'http:', host: 'localhost' };
const keyState = {}, keysDown = {}, keys = {}, mouseState = {};
const mouse = { x: 0, y: 0, down: false, clicked: false };

const COLORS = {
  'black': '#000000', 'dark blue': '#1d2b53', 'dark purple': '#7e2553',
  'dark green': '#008751', 'brown': '#ab5236', 'dark gray': '#5f574f',
  'dark grey': '#5f574f', 'light gray': '#c2c3c7', 'light grey': '#c2c3c7',
  'white': '#fff1e8', 'red': '#ff004d', 'orange': '#ffa300',
  'yellow': '#ffec27', 'green': '#00e436', 'blue': '#29adff',
  'indigo': '#83769c', 'pink': '#ff77a8', 'peach': '#ffccaa',
  'gray': '#8e8e8e', 'grey': '#8e8e8e', 'gold': '#ffd700',
  'cyan': '#00ffff', 'magenta': '#ff00ff', 'purple': '#9b59b6',
  'lime': '#aaff00', 'sky': '#87ceeb', 'coral': '#ff6f61',
};

// Easing curves for `tween` (pure functions of p in 0..1, shared by the sim and the
// rust core; `bounce` is the classic 7.5625/2.75 bounce-out).
// Wrap a dialog line on spaces to at most `per` characters and `max` lines
// (shared by both engines so the emitted text commands match exactly).
function wrapDialogText(text, per, max) {
  const words = String(text == null ? '' : text).split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const cand = cur ? cur + ' ' + w : w;
    if (cand.length <= per) { cur = cand; continue; }
    if (cur) lines.push(cur);
    cur = w.length > per ? w.slice(0, per) : w;
    if (lines.length >= max) break;
  }
  if (cur && lines.length < max) lines.push(cur);
  return lines;
}

function easeOf(kind, t) {
  if (kind === 'in') return t * t;
  if (kind === 'out') return t * (2 - t);
  if (kind === 'in out') return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
  if (kind === 'bounce') {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) { t -= 1.5 / d; return n * t * t + 0.75; }
    if (t < 2.5 / d) { t -= 2.25 / d; return n * t * t + 0.9375; }
    t -= 2.625 / d; return n * t * t + 0.984375;
  }
  return t;
}

function resolveColor(name) {
  if (!name) return '#fff1e8';
  const n = String(name).toLowerCase().trim();
  if (COLORS[n]) return COLORS[n];
  if (n.startsWith('#')) return n;
  if (n.startsWith('rgb')) return n;
  // try two-word colors
  return COLORS[n] || '#fff1e8';
}

// ============================================================
// BITMAP FONT (3x5 pixels per character, 1px spacing)
// ============================================================
// Each char is encoded as 5 rows of 3 bits = 15 bits = hex
const FONT_W = 3, FONT_H = 5, FONT_SPACING = 1;
const FONT = {
  'A':0x7DA7,'B':0x75D7,'C':0x7247,'D':0x5697,'E':0x7347,'F':0x7340,'G':0x72B7,
  'H':0x5F50|5,'I':0x7497,'J':0x24B6,'K':0x5D50|5,'L':0x4927,'M':0x7F50|5,
  'N':0x5ED5,'O':0x7697,'P':0x7740,'Q':0x769D,'R':0x7745,'S':0x7197,'T':0x7490,
  'U':0x5697,'V':0x5694,'W':0x56F5,'X':0x5295,'Y':0x5490,'Z':0x7497&0x7FFF,
  '0':0x7697,'1':0x6497,'2':0x7497&0x7FFF,'3':0x7197|0x0080,'4':0x5F10|1,
  '5':0x7197,'6':0x7397,'7':0x7490,'8':0x7797,'9':0x7F97,
  ' ':0x0000,'.':0x0010,',':0x0012,'!':0x4840|2,
  '?':0x7482,'\'':0x4800,'"':0x5000|0xA00,'-':0x0700,'+':0x04E0&0x7FFF,
  ':':0x0500|0xA,';':0x0412,'(': 0x2924,')':(0x4920|4),'/':0x1248,
  '_':0x0007,'=':0x0E0E,'*':0x0AE0|0xA,'#':0x5F5F,'@':0x76C7,
  '<':0x2420|4,'>':0x4240|2,'[':0x6926,']':0x4964,'{':0x6926,'}':0x4964,
  '%':0x5248|0xA,'&':0x6997,'$':0x7197,'~':0x0360,'^':0x2A00,
  '\\':0x4120|8,'|':0x4920|4,
};
// Better hand-tuned font data using explicit binary per row
const FONT_DATA = {};
(function buildFont() {
  // format: each char = array of 5 numbers (rows), each 3 bits wide
  const F = {
    'A': [0b010, 0b101, 0b111, 0b101, 0b101],
    'B': [0b110, 0b101, 0b110, 0b101, 0b110],
    'C': [0b011, 0b100, 0b100, 0b100, 0b011],
    'D': [0b110, 0b101, 0b101, 0b101, 0b110],
    'E': [0b111, 0b100, 0b110, 0b100, 0b111],
    'F': [0b111, 0b100, 0b110, 0b100, 0b100],
    'G': [0b011, 0b100, 0b101, 0b101, 0b011],
    'H': [0b101, 0b101, 0b111, 0b101, 0b101],
    'I': [0b111, 0b010, 0b010, 0b010, 0b111],
    'J': [0b001, 0b001, 0b001, 0b101, 0b010],
    'K': [0b101, 0b101, 0b110, 0b101, 0b101],
    'L': [0b100, 0b100, 0b100, 0b100, 0b111],
    'M': [0b101, 0b111, 0b111, 0b101, 0b101],
    'N': [0b101, 0b111, 0b111, 0b111, 0b101],
    'O': [0b010, 0b101, 0b101, 0b101, 0b010],
    'P': [0b110, 0b101, 0b110, 0b100, 0b100],
    'Q': [0b010, 0b101, 0b101, 0b110, 0b011],
    'R': [0b110, 0b101, 0b110, 0b101, 0b101],
    'S': [0b011, 0b100, 0b010, 0b001, 0b110],
    'T': [0b111, 0b010, 0b010, 0b010, 0b010],
    'U': [0b101, 0b101, 0b101, 0b101, 0b010],
    'V': [0b101, 0b101, 0b101, 0b010, 0b010],
    'W': [0b101, 0b101, 0b111, 0b111, 0b101],
    'X': [0b101, 0b101, 0b010, 0b101, 0b101],
    'Y': [0b101, 0b101, 0b010, 0b010, 0b010],
    'Z': [0b111, 0b001, 0b010, 0b100, 0b111],
    '0': [0b010, 0b101, 0b101, 0b101, 0b010],
    '1': [0b010, 0b110, 0b010, 0b010, 0b111],
    '2': [0b110, 0b001, 0b010, 0b100, 0b111],
    '3': [0b110, 0b001, 0b010, 0b001, 0b110],
    '4': [0b101, 0b101, 0b111, 0b001, 0b001],
    '5': [0b111, 0b100, 0b110, 0b001, 0b110],
    '6': [0b011, 0b100, 0b110, 0b101, 0b010],
    '7': [0b111, 0b001, 0b010, 0b010, 0b010],
    '8': [0b010, 0b101, 0b010, 0b101, 0b010],
    '9': [0b010, 0b101, 0b011, 0b001, 0b110],
    ' ': [0b000, 0b000, 0b000, 0b000, 0b000],
    '.': [0b000, 0b000, 0b000, 0b000, 0b010],
    ',': [0b000, 0b000, 0b000, 0b010, 0b100],
    '!': [0b010, 0b010, 0b010, 0b000, 0b010],
    '?': [0b110, 0b001, 0b010, 0b000, 0b010],
    '-': [0b000, 0b000, 0b111, 0b000, 0b000],
    '+': [0b000, 0b010, 0b111, 0b010, 0b000],
    ':': [0b000, 0b010, 0b000, 0b010, 0b000],
    ';': [0b000, 0b010, 0b000, 0b010, 0b100],
    '(': [0b001, 0b010, 0b010, 0b010, 0b001],
    ')': [0b100, 0b010, 0b010, 0b010, 0b100],
    '/': [0b001, 0b001, 0b010, 0b100, 0b100],
    '_': [0b000, 0b000, 0b000, 0b000, 0b111],
    '=': [0b000, 0b111, 0b000, 0b111, 0b000],
    '*': [0b000, 0b101, 0b010, 0b101, 0b000],
    '#': [0b101, 0b111, 0b101, 0b111, 0b101],
    '\'': [0b010, 0b010, 0b000, 0b000, 0b000],
    '"': [0b101, 0b101, 0b000, 0b000, 0b000],
    '<': [0b001, 0b010, 0b100, 0b010, 0b001],
    '>': [0b100, 0b010, 0b001, 0b010, 0b100],
    '[': [0b110, 0b100, 0b100, 0b100, 0b110],
    ']': [0b011, 0b001, 0b001, 0b001, 0b011],
    '{': [0b011, 0b010, 0b100, 0b010, 0b011],
    '}': [0b110, 0b010, 0b001, 0b010, 0b110],
    '%': [0b101, 0b001, 0b010, 0b100, 0b101],
  };
  for (const [ch, rows] of Object.entries(F)) {
    FONT_DATA[ch] = rows;
  }
})();

function drawText(text, x, y, colorHex) {
  ctx.fillStyle = colorHex;
  let cx = x;
  const s = String(text).toUpperCase();
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const rows = FONT_DATA[ch];
    if (rows) {
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 3; col++) {
          if (rows[row] & (1 << (2 - col))) {
            ctx.fillRect(cx + col, y + row, 1, 1);
          }
        }
      }
    }
    cx += FONT_W + FONT_SPACING;
  }
}

// ============================================================
// BUILT-IN SPRITES (8x8, nibble hex: 0=transparent, 1-f=palette)
// ============================================================
// Palette: 0=trans 1=black 2=dk blue 3=dk purple 4=dk green
// 5=brown 6=dk gray 7=lt gray 8=white 9=red a=orange b=yellow
// c=green d=blue e=indigo f=pink
// Helper: assemble 8 rows, validates each is 8 chars
function spr(...rows) {
  if (rows.length !== 8) console.warn('sprite needs 8 rows, got', rows.length);
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].length !== 8) console.warn('row', i, 'has', rows[i].length, 'chars:', rows[i]);
  }
  return rows.join('');
}

const SPRITES = {
  // Characters - hero in 4 facing directions (down is the default)
  hero_down: spr(
    '00dddd00',
    '0dddddd0',
    '0d8888d0',
    '0d1881d0',
    '09999990',
    '09999990',
    '00c00c00',
    '0cc00cc0'),
  hero_up: spr(
    '00dddd00',
    '0dddddd0',
    '0dddddd0',
    '0dddddd0',
    '09999990',
    '09999990',
    '00c00c00',
    '0cc00cc0'),
  hero_left: spr(
    '0dddd000',
    'dddddd00',
    'd1881d00',
    'd8888d00',
    '999999d0',
    '99999d00',
    '0c00cc00',
    'cc00cc00'),
  hero_right: spr(
    '000dddd0',
    '00dddddd',
    '00d1881d',
    '00d8888d',
    '0d999999',
    '00d99999',
    '00cc00c0',
    '00cc00cc'),
  // Backward-compat alias - "hero" without facing maps to hero_down
  hero: spr(
    '00dddd00',
    '0dddddd0',
    '0d8888d0',
    '0d1881d0',
    '09999990',
    '09999990',
    '00c00c00',
    '0cc00cc0'),
  wizard: spr(
    '00e00000',
    '0eee0000',
    '0e8e0000',
    'eeeeee00',
    '03e3e000',
    '03e3e000',
    '03303000',
    '03303000'),
  knight: spr(
    '06666600',
    '06868600',
    '06666600',
    '67777760',
    '06666600',
    '06666600',
    '06006000',
    '06006000'),
  rogue: spr(
    '01111100',
    '01616100',
    '01111100',
    '11611100',
    '05111500',
    '01111100',
    '01001000',
    '01001000'),
  princess: spr(
    '00bbb000',
    '00888000',
    '08181800',
    '00888000',
    '0fffff00',
    '0fffff00',
    '0f000f00',
    '0f000f00'),
  ship: spr(
    '00088000',
    '00988900',
    '09988990',
    '99999999',
    '99999999',
    '09088090',
    '00900900',
    '00000000'),

  // Enemies
  slime: spr(
    '00cccc00',
    '0cccccc0',
    'cc8cc8cc',
    'cccccccc',
    'cc9999cc',
    'ccccccc0',
    '0cccccc0',
    '00c00c00'),
  bat: spr(
    '00000000',
    '10000010',
    '91000190',
    '99188199',
    '99999999',
    '09999990',
    '00909900',
    '00000000'),
  ghost: spr(
    '00eeee00',
    '0eeeeee0',
    '0e8e8ee0',
    '0e8e8ee0',
    'eeeeeeee',
    'eeeeeeee',
    'e0e0e0e0',
    '00000000'),
  skeleton: spr(
    '00888800',
    '08818180',
    '08888880',
    '00888000',
    '08888800',
    '08878880',
    '00800800',
    '08800880'),
  goblin: spr(
    '0cc00cc0',
    '0cccccc0',
    'c8cccc8c',
    '0cccccc0',
    '00cccc00',
    '0cc00cc0',
    '0c0000c0',
    '0c0000c0'),
  spider: spr(
    '10000001',
    '01000010',
    '10999901',
    '19999991',
    '19989991',
    '19999991',
    '01000010',
    '10000001'),
  alien: spr(
    '00c00c00',
    '0cccccc0',
    'cc1cc1cc',
    'cccccccc',
    '0c0cc0c0',
    'c0c00c0c',
    '0c0000c0',
    'c000000c'),

  // Items
  coin: spr(
    '00000000',
    '00bbbb00',
    '0bb88bb0',
    '0b8bb8b0',
    '0bb88bb0',
    '00bbbb00',
    '00000000',
    '00000000'),
  gem: spr(
    '00000000',
    '00dddd00',
    '0d8dd8d0',
    'dddddddd',
    'dddddddd',
    '0dddddd0',
    '00dddd00',
    '00000000'),
  heart: spr(
    '00000000',
    '09909900',
    '99999990',
    '99999990',
    '09999900',
    '00999000',
    '00090000',
    '00000000'),
  key: spr(
    '00000000',
    '00bbb000',
    '0b8b8b00',
    '0bbbb000',
    '000b0000',
    '000bbb00',
    '000b0000',
    '000bb000'),
  chest: spr(
    '00000000',
    '05555550',
    '5a8a8a85',
    '55555555',
    '55b11b55',
    '55511555',
    '55555555',
    '00000000'),
  potion: spr(
    '00000000',
    '00078000',
    '00087000',
    '009dd000',
    '09dddd00',
    '09dddd00',
    '09d99d00',
    '00dddd00'),
  medkit: spr(
    '00000000',
    '08888880',
    '08899880',
    '08999980',
    '08999980',
    '08899880',
    '08888880',
    '00000000'),
  sword: spr(
    '000000c0',
    '00000c00',
    '0000c000',
    '000c0000',
    '09c00000',
    '00c00000',
    '0c000000',
    'c0000000'),
  bomb: spr(
    '00000000',
    '00a9b000',
    '00a00000',
    '01111000',
    '01111000',
    '01111000',
    '01111000',
    '00110000'),
  star: spr(
    '000bb000',
    '000bb000',
    'bbbbbbbb',
    '0bbbbbb0',
    '00bbbb00',
    '00b00b00',
    '0b0000b0',
    '00000000'),
  house: spr(
    '0009a000',
    '000aaa00',
    '00aaaaa0',
    '0aaaaaaa',
    '55555555',
    '55155155',
    '55155155',
    '55155155'),

  // Tiles
  grass: spr(
    '44c44444',
    '44444c44',
    'c4444444',
    '44444444',
    '4444c444',
    '44444444',
    '4c444444',
    '44444444'),
  dirt: spr(
    '55555555',
    '55a55555',
    '55555555',
    '55555a55',
    '5a555555',
    '55555555',
    '55555555',
    '555a5555'),
  stone: spr(
    '66676666',
    '66666666',
    '66666676',
    '77777777',
    '66666666',
    '67666666',
    '66666666',
    '77777777'),
  water: spr(
    '22d22222',
    '2222d222',
    '22222222',
    'd2222222',
    '22222d22',
    '22222222',
    '222d2222',
    '22222222'),
  brick: spr(
    '99599595',
    '55555555',
    '95995599',
    '55555555',
    '99599595',
    '55555555',
    '95995599',
    '55555555'),
  tree: spr(
    '00cccc00',
    '0cccccc0',
    'cc4cc4cc',
    'cccccccc',
    'cccccccc',
    '0cccccc0',
    '00c55c00',
    '00555500'),
  door: spr(
    '05555500',
    '51111150',
    '51111150',
    '51111150',
    '51b11150',
    '51111150',
    '51111150',
    '55555555'),

  // Effects
  explosion1: spr(
    '00000000',
    '00099000',
    '009aa900',
    '09abba90',
    '09abba90',
    '009aa900',
    '00099000',
    '00000000'),
  explosion2: spr(
    '09000090',
    '00999900',
    '09aabb90',
    '9abbba99',
    '9abbba99',
    '09aabb90',
    '00999900',
    '09000090'),
  spark: spr(
    '00000000',
    '00080000',
    '00808000',
    '08000800',
    '00808000',
    '00080000',
    '00000000',
    '00000000'),
  smoke: spr(
    '00000000',
    '00777000',
    '07777700',
    '07777700',
    '07777700',
    '00777000',
    '00000000',
    '00000000'),
  bullet: spr(
    '00000000',
    '00000000',
    '00088000',
    '00888800',
    '00088000',
    '00000000',
    '00000000',
    '00000000'),
  // Directional arrow projectiles - 8 = white shaft/head
  arrow_right: spr(
    '00000000',
    '00080000',
    '00088000',
    '08888888',
    '00088000',
    '00080000',
    '00000000',
    '00000000'),
  arrow_left: spr(
    '00000000',
    '00008000',
    '00088000',
    '88888880',
    '00088000',
    '00008000',
    '00000000',
    '00000000'),
  arrow_up: spr(
    '00080000',
    '00888000',
    '08080800',
    '00080000',
    '00080000',
    '00080000',
    '00080000',
    '00080000'),
  arrow_down: spr(
    '00080000',
    '00080000',
    '00080000',
    '00080000',
    '00080000',
    '08080800',
    '00888000',
    '00080000'),
  // Backward-compat alias
  arrow: spr(
    '00000000',
    '00080000',
    '00088000',
    '08888888',
    '00088000',
    '00080000',
    '00000000',
    '00000000'),
  fireball: spr(
    '00000000',
    '00999000',
    '09aaa900',
    '9aabba90',
    '09aaa900',
    '00999000',
    '00000000',
    '00000000'),

  // UI
  heart_full: spr(
    '00000000',
    '09909900',
    '99999990',
    '99999990',
    '09999900',
    '00999000',
    '00090000',
    '00000000'),
  heart_empty: spr(
    '00000000',
    '01101100',
    '11001100',
    '11001110',
    '01111100',
    '00111000',
    '00010000',
    '00000000'),
  skull: spr(
    '00000000',
    '00888800',
    '08181800',
    '08888800',
    '08888800',
    '00808000',
    '00000000',
    '00000000'),
  arrow_up: '00000000' + '00100000' + '01110000' + '11111000' + '00100000' + '00100000' + '00100000' + '00000000',
};

// Palette for sprite rendering (matches our 16-color system)
const SPRITE_PAL = [
  null,       // 0 = transparent
  '#000000',  // 1 = black
  '#1d2b53',  // 2 = dark blue
  '#7e2553',  // 3 = dark purple
  '#008751',  // 4 = dark green
  '#ab5236',  // 5 = brown
  '#5f574f',  // 6 = dark gray
  '#c2c3c7',  // 7 = light gray
  '#fff1e8',  // 8 = white
  '#ff004d',  // 9 = red
  '#ffa300',  // a = orange
  '#ffec27',  // b = yellow
  '#00e436',  // c = green
  '#29adff',  // d = blue
  '#83769c',  // e = indigo/lavender
  '#ff77a8',  // f = pink
];

const USER_SPRITES = {};   // defined in fc code:  sprite "name" is "<64 hex>"
function drawSprite(name, x, y) {
  const hex = USER_SPRITES[name] || SPRITES[name];
  if (!hex) return;
  // Strip any spaces/joins
  const data = hex.replace(/\s/g, '');
  for (let i = 0; i < 64 && i < data.length; i++) {
    const ci = parseInt(data[i], 16);
    if (ci === 0) continue; // transparent
    const px = i % 8;
    const py = Math.floor(i / 8);
    ctx.fillStyle = SPRITE_PAL[ci];
    ctx.fillRect(Math.floor(x) + px, Math.floor(y) + py, 1, 1);
  }
}

// ============================================================
// PROBABILITY WORDS
// ============================================================
const PROBABILITY = {
  'always': 1.0, 'almost certainly': 0.95, 'very likely': 0.85,
  'highly likely': 0.90, 'likely': 0.70, 'probably': 0.70, 'probable': 0.70,
  'better than even': 0.60, 'maybe': 0.50, 'even chance': 0.50,
  'about even': 0.50, 'probably not': 0.25, 'unlikely': 0.20,
  'we doubt': 0.20, 'little chance': 0.10, 'chances are slight': 0.10,
  'improbable': 0.10, 'highly unlikely': 0.05, 'rarely': 0.05,
  'almost never': 0.02, 'almost no chance': 0.02, 'never': 0.0,
};

// Helper: safely get lowercase string value from a token
function tv(token) {
  if (!token) return '';
  const v = token.value;
  return typeof v === 'string' ? v.toLowerCase() : String(v);
}

// Direction lookup for facing - keeps a consistent vector for movement/projectiles
const DIR_VECTORS = {
  up:    { dx:  0, dy: -1 },
  down:  { dx:  0, dy:  1 },
  left:  { dx: -1, dy:  0 },
  right: { dx:  1, dy:  0 },
};

// Helper: convert plural to singular for collision binding
function singularize(plural) {
  const s = String(plural).toLowerCase();
  if (s.endsWith('ies')) return s.slice(0, -3) + 'y';
  if (s.endsWith('ses')) return s.slice(0, -2);
  if (s.endsWith('es') && (s.endsWith('xes') || s.endsWith('shes') || s.endsWith('ches'))) return s.slice(0, -2);
  if (s.endsWith('s') && s.length > 1) return s.slice(0, -1);
  return s;
}

// ============================================================
// ============================================================
// AUDIO — fully procedural chiptune SFX + music (NO audio files).
// Sounds are tiny synthesis recipes, mirroring how sprites are hex
// strings rather than PNGs: nothing to bundle, stays diffable.
// Usage in fc:  play sound "pickup"   |   play music "theme"
// ============================================================

function tokenizeLine(line) {
  const tokens = [];
  let i = 0;
  // measure indent
  let indent = 0;
  while (i < line.length && (line[i] === ' ' || line[i] === '\t')) {
    indent += line[i] === '\t' ? 2 : 1;
    i++;
  }
  tokens.indent = Math.floor(indent / 2);
  while (i < line.length) {
    // skip spaces
    if (line[i] === ' ' || line[i] === '\t') { i++; continue; }
    // comment
    if (line[i] === '-' && line[i + 1] === '-') break;
    // string
    if (line[i] === '"' || line[i] === "'") {
      const q = line[i]; i++;
      let s = '';
      while (i < line.length && line[i] !== q) { s += line[i]; i++; }
      i++; // skip closing quote
      tokens.push({ type: 'string', value: s });
      continue;
    }
    // number
    if (/[0-9]/.test(line[i]) || (line[i] === '-' && i + 1 < line.length && /[0-9]/.test(line[i + 1]) && (tokens.length === 0 || ['operator', 'keyword', 'comma', 'lparen'].includes(tokens[tokens.length - 1].type)))) {
      let n = '';
      if (line[i] === '-') { n += '-'; i++; }
      while (i < line.length && /[0-9.]/.test(line[i])) { n += line[i]; i++; }
      tokens.push({ type: 'number', value: parseFloat(n) });
      continue;
    }
    // brackets
    if (line[i] === '[') { tokens.push({ type: 'lbracket', value: '[' }); i++; continue; }
    if (line[i] === ']') { tokens.push({ type: 'rbracket', value: ']' }); i++; continue; }
    if (line[i] === '{') { tokens.push({ type: 'lbrace', value: '{' }); i++; continue; }
    if (line[i] === '}') { tokens.push({ type: 'rbrace', value: '}' }); i++; continue; }
    if (line[i] === '(') { tokens.push({ type: 'lparen', value: '(' }); i++; continue; }
    if (line[i] === ')') { tokens.push({ type: 'rparen', value: ')' }); i++; continue; }
    if (line[i] === ',') { tokens.push({ type: 'comma', value: ',' }); i++; continue; }
    if (line[i] === '.') {
      // could be property access
      tokens.push({ type: 'dot', value: '.' }); i++; continue;
    }
    // operators
    if ('+-*/><=!'.includes(line[i])) {
      let op = line[i]; i++;
      if (i < line.length && (line[i] === '=' || (op === '>' || op === '<') && line[i] === '=')) {
        op += line[i]; i++;
      }
      tokens.push({ type: 'operator', value: op });
      continue;
    }
    // word
    if (/[a-zA-Z_]/.test(line[i])) {
      let w = '';
      while (i < line.length && /[a-zA-Z0-9_]/.test(line[i])) { w += line[i]; i++; }
      tokens.push({ type: 'word', value: w });
      continue;
    }
    i++; // skip unknown
  }
  return tokens;
}

// ============================================================
// PARSER
// ============================================================
function parse(source) {
  const rawLines = source.split('\n');
  const lines = [];
  for (let i = 0; i < rawLines.length; i++) {
    const trimmed = rawLines[i].replace(/--.*$/, '').trim();
    if (!trimmed) continue;
    const tokens = tokenizeLine(rawLines[i]);
    if (tokens.length === 0) continue;
    lines.push({ tokens, indent: tokens.indent, lineNum: i + 1 });
  }

  // Pre-scan: collect user-defined function names so they terminate
  // conditions like built-in command words. Without this:
  //   if mode is "play" shoot
  // would swallow "shoot" into the condition and drop it.
  const userFuncs = new Set();
  for (const line of lines) {
    const t = line.tokens;
    if (t.length >= 2 && tv(t[0]) === 'to') {
      if (t.length >= 3 && tv(t[1]) === 'screen') {
        userFuncs.add('screen_' + String(t[2].value).toLowerCase());
      } else if (typeof t[1].value === 'string') {
        userFuncs.add(t[1].value.toLowerCase());
      }
    }
  }

  // Rewrite `its <field>` -> `<subjectTokens> . <field>` inside a `with` block.
  function rewriteIts(tokens, subjTokens) {
    const out = [];
    for (let k = 0; k < tokens.length; k++) {
      const t = tokens[k];
      if (t.type === 'word' && tv(t) === 'its') {
        for (const st of subjTokens) out.push(st);
        if (tokens[k + 1] && tokens[k + 1].type === 'word') out.push({ type: 'dot', value: '.' });
      } else out.push(t);
    }
    if (tokens.indent !== undefined) out.indent = tokens.indent;
    return out;
  }

  function parseBlock(start, minIndent, subjTokens) {
    const stmts = [];
    let i = start;
    while (i < lines.length && lines[i].indent >= minIndent) {
      if (lines[i].indent > minIndent) { i++; continue; } // skip deeper (grabbed by parent)
      const toks = subjTokens ? rewriteIts(lines[i].tokens, subjTokens) : lines[i].tokens;
      const stmt = parseLine(toks, lines[i].lineNum);
      // grab child block
      let j = i + 1;
      const children = [];
      while (j < lines.length && lines[j].indent > minIndent) {
        children.push(lines[j]);
        j++;
      }
      if (children.length > 0) {
        // map rows are raw quoted strings, not statements
        if (stmt.type === 'map_def') {
          stmt.body = children
            .filter(l => l.tokens.length === 1 && l.tokens[0].type === 'string')
            .map(l => ({ type: 'literal', value: l.tokens[0].value }));
        } else {
          const childSubj = stmt.type === 'with' ? toks.slice(1) : subjTokens;
          stmt.body = parseBlock(i + 1, minIndent + 1, childSubj);
        }
      }
      stmts.push(stmt);
      i = j > i + 1 ? j : i + 1;
    }
    return stmts;
  }

  function parseLine(tokens, lineNum) {
    const words = tokens.map(t => t.value);
    const raw = tokens;

    // Helper: find word index
    function findWord(w, startIdx = 0) {
      for (let i = startIdx; i < raw.length; i++) {
        if (raw[i].type === 'word' && tv(raw[i]) === w.toLowerCase()) return i;
      }
      return -1;
    }
    function findAnyWord(ws, startIdx = 0) {
      for (let i = startIdx; i < raw.length; i++) {
        if (raw[i].type === 'word' && ws.includes(tv(raw[i]))) return i;
      }
      return -1;
    }

    const first = raw[0] ? tv(raw[0]) : '';

    // -- "and" chaining: split at top-level "and" between statements --
    // We handle this by looking for "and" that separates commands
    // but NOT "and" inside expressions (like "between X and Y")
    const andParts = splitOnAnd(raw);
    if (andParts.length > 1) {
      return { type: 'chain', parts: andParts.map(p => parseLine(p, lineNum)), lineNum };
    }

    // -- to (function definition) --
    if (first === 'to') {
      // "to screen X" -> function named "screen_<X>" auto-dispatched when mode is X
      if (raw.length >= 3 && tv(raw[1]) === 'screen') {
        return { type: 'funcdef', name: 'screen_' + raw[2].value, params: [], body: [], lineNum };
      }
      // "to update X" -> function named "update_<X>", dispatched while mode is X
      // (design decisions, Q5). Same shape as `screen`: neither takes a parameter.
      if (raw.length >= 3 && tv(raw[1]) === 'update') {
        return { type: 'funcdef', name: 'update_' + raw[2].value, params: [], body: [], lineNum };
      }
      const name = raw[1] ? raw[1].value : 'unknown';
      const params = [];
      for (let i = 2; i < raw.length; i++) {
        if (raw[i].type === 'word' && tv(raw[i]) !== 'at' && tv(raw[i]) !== 'with' && tv(raw[i]) !== 'in') {
          params.push(raw[i].value);
        }
      }
      return { type: 'funcdef', name, params, body: [], lineNum };
    }

    // -- sprite "name" is "<64 hex>" (user-defined sprite) --
    if (first === 'sprite' && raw[1] && raw[1].type === 'string') {
      const sname = raw[1].value;
      const hexTok = raw.find((t, idx) => idx >= 2 && t.type === 'string');
      return { type: 'def_sprite', name: sname, hex: hexTok ? String(hexTok.value).toLowerCase() : '', lineNum };
    }

    // -- song "name" at N bpm "row" "row" ... (user-defined song) --
    if (first === 'song' && raw[1] && raw[1].type === 'string') {
      const sname = raw[1].value;
      const bpmTok = raw.find(t => t.type === 'number');
      const rows = raw.filter((t, idx) => idx >= 2 && t.type === 'string').map(t => t.value);
      return { type: 'def_song', name: sname, tempo: bpmTok ? Number(bpmTok.value) : 120, rows, lineNum };
    }

    // -- define sound "name" as <wave> [from F0 to F1] [over D]  |  notes F0 F1 ... [over D] --
    if (first === 'define' && tv(raw[1]) === 'sound' && raw[2] && raw[2].type === 'string') {
      const sname = raw[2].value;
      const asIdx = findWord('as');
      const rest = raw.slice(asIdx >= 0 ? asIdx + 1 : 3);
      const findIn = w => rest.findIndex(t => t.type === 'word' && tv(t) === w);
      const overI = findIn('over');
      const dur = (overI >= 0 && rest[overI + 1]) ? Number(rest[overI + 1].value) : 0.15;
      const w0 = rest[0] ? tv(rest[0]) : 'square';
      let recipe;
      if (w0 === 'notes') {
        const end = overI >= 0 ? overI : rest.length;
        const notes = rest.slice(1, end).filter(t => t.type === 'number').map(t => Number(t.value));
        recipe = { kind: 'notes', notes, dur };
      } else {
        const wave = ['square', 'sine', 'triangle', 'sawtooth', 'noise'].includes(w0) ? w0 : 'square';
        const fromI = findIn('from'), toI = findIn('to');
        let f0 = 440, f1 = null;
        if (fromI >= 0 && rest[fromI + 1]) { f0 = Number(rest[fromI + 1].value); if (toI >= 0 && rest[toI + 1]) f1 = Number(rest[toI + 1].value); }
        else { const n = rest.find(t => t.type === 'number'); if (n) f0 = Number(n.value); }
        recipe = { kind: 'tone', wave, f0, f1, dur };
      }
      return { type: 'def_sfx', name: sname, recipe, lineNum };
    }

    // -- go to X / go back --
    if (first === 'go' && raw.length >= 2) {
      if (tv(raw[1]) === 'back') return { type: 'goback', lineNum };
      if (tv(raw[1]) === 'to' && raw.length >= 3) {
        return { type: 'goto', target: raw[2].value, lineNum };
      }
    }

    // -- follow X with camera --
    if (first === 'follow' && raw.length >= 4 && tv(raw[raw.length - 1]) === 'camera') {
      return { type: 'follow', target: raw[1].value, lineNum };
    }

    // -- run game with update and draw --
    if (first === 'run' && raw.length >= 2 && tv(raw[1]) === 'game') {
      const funcs = [];
      for (let i = 2; i < raw.length; i++) {
        if (raw[i].type === 'word' && !['with', 'and'].includes(tv(raw[i]))) {
          funcs.push(raw[i].value);
        }
      }
      return { type: 'rungame', funcs, lineNum };
    }

    // -- when (event handler) --
    if (first === 'when') {
      return parseWhen(raw, lineNum);
    }

    // -- if --
    if (first === 'if') {
      return parseIf(raw, lineNum);
    }

    // -- else / else if --
    if (first === 'else') {
      if (raw.length > 1 && tv(raw[1]) === 'if') {
        const inner = parseIf(raw.slice(1), lineNum);
        return { type: 'else_if', condition: inner.condition, thenStmt: inner.thenStmt, body: inner.body, lineNum };
      }
      // standalone else with inline statement
      if (raw.length > 1) {
        return { type: 'else', thenStmt: parseLine(raw.slice(1), lineNum), lineNum };
      }
      return { type: 'else', body: [], lineNum };
    }

    // -- repeat N times --
    if (first === 'repeat') {
      return parseRepeat(raw, lineNum);
    }

    // -- each X in Y --
    if (first === 'each') {
      return parseEach(raw, lineNum);
    }

    // -- forever --
    if (first === 'forever') {
      return { type: 'forever', body: [], lineNum };
    }

    // -- every N frames / every N seconds (run the body on a cadence) --
    if (first === 'every' && raw[1] && raw[1].type === 'number') {
      const unit = (raw[2] && raw[2].type === 'word' && tv(raw[2]) === 'seconds') ? 'seconds' : 'frames';
      return { type: 'every', n: Number(raw[1].value), unit, body: [], lineNum };
    }

    // -- time limit is N seconds  (optional match countdown; sets `timer` + `when time runs out`) --
    if (first === 'time' && raw[1] && tv(raw[1]) === 'limit') {
      const isIdx = raw.findIndex(t => tv(t) === 'is');
      let body = isIdx >= 0 ? raw.slice(isIdx + 1) : raw.slice(2);
      let unit = 'seconds';
      if (body.length && tv(body[body.length - 1]) === 'seconds') body = body.slice(0, -1);
      else if (body.length && tv(body[body.length - 1]) === 'frames') { unit = 'frames'; body = body.slice(0, -1); }
      return { type: 'time_limit', value: parseExpression(body), unit, lineNum };
    }

    // -- flash screen [COLOR] [for N [seconds|frames]] --
    // Host-rendered presentation effect (the page paints it, and skips it entirely
    // when the user asked for reduced motion). Frame-counted so both engines agree.
    if (first === 'flash' && raw[1] && tv(raw[1]) === 'screen') {
      const forIdx = raw.findIndex(t => tv(t) === 'for');
      const color = raw.slice(2, forIdx >= 0 ? forIdx : raw.length).map(t => t.value).join(' ').trim();
      let frames = { type: 'literal', value: 6 }, unit = 'frames';
      if (forIdx >= 0) { const d = parseDurationTail(raw.slice(forIdx + 1)); frames = d.value; unit = d.unit; }
      return { type: 'flash', color: color || 'white', frames, unit, lineNum };
    }

    // -- shake camera [for N [seconds|frames]] [by N [pixels]] --
    if (first === 'shake' && raw[1] && tv(raw[1]) === 'camera') {
      const forIdx = raw.findIndex(t => tv(t) === 'for');
      const byIdx = raw.findIndex(t => tv(t) === 'by');
      let frames = { type: 'literal', value: 12 }, unit = 'frames';
      let magnitude = { type: 'literal', value: 2 };
      if (forIdx >= 0) {
        const stop = byIdx > forIdx ? byIdx : raw.length;
        const d = parseDurationTail(raw.slice(forIdx + 1, stop)); frames = d.value; unit = d.unit;
      }
      if (byIdx >= 0) magnitude = parseExpression(raw.slice(byIdx + 1).filter(t => tv(t) !== 'pixels'));
      return { type: 'shake', frames, unit, magnitude, lineNum };
    }


    // -- jump X [by N]  (upward velocity impulse; pairs with `gravity is N`) --
    if (first === 'jump') {
      const target = raw[1] ? raw[1].value : 'player';
      const numTok = raw.find(t => t.type === 'number');
      const force = numTok ? Number(numTok.value) : 4.5;
      return { type: 'jump', target, force, lineNum };
    }

    // -- save X as "name"  (remember a value on this device; read back with `load`) --
    if (first === 'save' && raw.some(t => t.type === 'word' && tv(t) === 'as')) {
      const asIdx = raw.findIndex(t => t.type === 'word' && tv(t) === 'as');
      return { type: 'save', value: parseExpression(raw.slice(1, asIdx)), key: parseExpression(raw.slice(asIdx + 1)), lineNum };
    }

    // -- tile "#" is {image: "brick", solid: yes}  (what a map character means) --
    if (first === 'tile' && raw[1] && raw[1].type === 'string' && raw[2] && tv(raw[2]) === 'is') {
      return { type: 'tile_def', ch: String(raw[1].value), props: parseExpression(raw.slice(3)), lineNum };
    }

    // -- map is  (the indented quoted rows below become the level; sizes the world) --
    if (first === 'map' && raw.length === 2 && tv(raw[1]) === 'is') {
      return { type: 'map_def', body: [], lineNum };
    }

    // -- draw map  (draw every tile, camera-aware; place it in `to draw`) --
    if (first === 'draw' && raw.length === 2 && tv(raw[1]) === 'map') {
      return { type: 'draw_map', lineNum };
    }

    // -- ghosts chase player [speed 0.5] · bats wander · guard patrols between 20 and 100 --
    if (raw.length >= 2 && raw[0].type === 'word' && raw[1].type === 'word' &&
        ['chase', 'chases', 'wander', 'wanders', 'patrol', 'patrols', 'flee', 'flees', 'shoot', 'shoots'].includes(tv(raw[1]))) {
      // optional trailing `through walls` lets a mover ignore solid map tiles
      const twi = raw.findIndex((t, i) => t.type === 'word' && tv(t) === 'through' &&
                                raw[i + 1] && raw[i + 1].type === 'word' && tv(raw[i + 1]) === 'walls');
      const through = twi >= 0;
      const toks = through ? raw.slice(0, twi).concat(raw.slice(twi + 2)) : raw;
      const subject = toks[0].value;
      const verb = tv(toks[1]).replace(/s$/, '');
      const sp = toks.findIndex(t => t.type === 'word' && tv(t) === 'speed');
      // `end` bounds the clauses BEFORE speed (target / x1 / x2); the speed
      // expression has its own bound so a trailing `when within N` isn't swallowed.
      const end = sp >= 0 ? sp : toks.length;
      let speed = null;
      if (sp >= 0) {
        const after = toks.slice(sp + 1);
        const stop = after.findIndex(t => t.type === 'word' && ['when', 'within', 'through', 'and', 'with'].includes(tv(t)));
        speed = parseExpression(stop > 0 ? after.slice(0, stop) : after);
      }
      if (verb === 'chase') {
        const target = toks[2] && toks[2].type === 'word' ? toks[2].value : 'player';
        return { type: 'behavior', kind: 'chase', subject, target, speed, through, lineNum };
      }
      if (verb === 'flee') {
        // `flees FROM player` — the target is the word after `from` (toks[2] would be
        // the word "from" itself); bare `flees player` also works.
        const fi = toks.findIndex(t => t.type === 'word' && tv(t) === 'from');
        const cand = fi > 0 && toks[fi + 1] && toks[fi + 1].type === 'word' ? toks[fi + 1].value
                   : (toks[2] && toks[2].type === 'word' && !['speed', 'when', 'through', 'from'].includes(tv(toks[2])) ? toks[2].value : 'player');
        const target = cand;
        const wi = toks.findIndex(t => t.type === 'word' && tv(t) === 'within');
        let within = null;
        if (wi > 0) {
          const after = toks.slice(wi + 1);
          const stop = after.findIndex(t => t.type === 'word' && ['speed', 'when', 'through', 'and', 'with'].includes(tv(t)));
          within = parseExpression(stop > 0 ? after.slice(0, stop) : after);
        }
        return { type: 'behavior', kind: 'flee', subject, target, within, speed, through, lineNum };
      }
      if (verb === 'shoot') {
        // `X shoots at player every 1 second speed 2` — the engine spawns a shot
        // toward the target into `X.shots` on a cooldown; the game does collisions.
        const ai = toks.findIndex(t => t.type === 'word' && tv(t) === 'at');
        const target = ai > 0 && toks[ai + 1] && toks[ai + 1].type === 'word' ? toks[ai + 1].value : 'player';
        const ei = toks.findIndex(t => t.type === 'word' && tv(t) === 'every');
        let every = { type: 'literal', value: 60 }, unit = 'frames';
        if (ei > 0) {
          const stop = [sp, toks.findIndex(t => t.type === 'word' && tv(t) === 'when')].filter(i => i > ei).sort((a, b) => a - b)[0];
          const d = parseDurationTail(toks.slice(ei + 1, stop === undefined ? toks.length : stop));
          every = d.value; unit = d.unit;
        }
        return { type: 'behavior', kind: 'shoot', subject, target, every, unit, speed, through, lineNum };
      }
      if (verb === 'wander') {
        return { type: 'behavior', kind: 'wander', subject, speed, through, lineNum };
      }
      if (verb === 'patrol') {
        const li = toks.findIndex(t => t.type === 'word' && tv(t) === 'along');
        if (li > 0) {
          return { type: 'behavior', kind: 'patrol_points', subject, points: parseExpression(toks.slice(li + 1, end)), speed, through, lineNum };
        }
        const bi = toks.findIndex(t => t.type === 'word' && tv(t) === 'between');
        const ai = toks.findIndex(t => t.type === 'word' && tv(t) === 'and');
        if (bi > 0 && ai > bi) {
          return { type: 'behavior', kind: 'patrol', subject,
                   x1: parseExpression(toks.slice(bi + 1, ai)), x2: parseExpression(toks.slice(ai + 1, end)), speed, through, lineNum };
        }
      }
    }

    // -- animate player with "hero_down" "hero_up" every 10 frames --
    if (first === 'animate' && raw.length >= 4 && raw[2] && tv(raw[2]) === 'with') {
      const frames = [];
      let i = 3;
      while (i < raw.length && raw[i].type === 'string') { frames.push(raw[i].value); i++; }
      let every = 10;
      if (i < raw.length && tv(raw[i]) === 'every' && raw[i + 1] && raw[i + 1].type === 'number') {
        every = Number(raw[i + 1].value);
      }
      if (frames.length) return { type: 'animate', subject: raw[1].value, frames, every, lineNum };
    }

    // -- emit sparks [rising|falling] (at X, Y | from REF) [in COLOR] [for N [seconds|frames]] --
    // A SUSTAINED emitter: it spawns particles every frame (same model/random draws
    // as `burst`) for the given duration, following REF when one is named.
    if (first === 'emit') {
      const kw = (w) => raw.findIndex((t, i) => i > 1 && t.type === 'word' && tv(t) === w);
      const atIdx = kw('at'), fromIdx = kw('from'), inIdx = kw('in'), forIdx = kw('for');
      const markerIdx = raw.findIndex((t, i) => i > 1 && t.type === 'word' && (tv(t) === 'rising' || tv(t) === 'falling'));
      const starts = [atIdx, fromIdx, inIdx, forIdx].filter(i => i > 0);
      const nounEnd = Math.min(...(starts.length ? starts : [raw.length]), markerIdx > 0 ? markerIdx : raw.length);
      const rateTok = raw.slice(1, nounEnd).find(t => t.type === 'number');
      const rate = rateTok ? { type: 'literal', value: rateTok.value } : { type: 'literal', value: 2 };
      let x = null, y = null, ref = null;
      if (fromIdx > 0) ref = tv(raw[fromIdx + 1] || { value: 'player' });
      else if (atIdx > 0) {
        const stop = starts.filter(i => i > atIdx).concat([raw.length]).reduce((a, b) => Math.min(a, b));
        const seg = raw.slice(atIdx + 1, stop);
        const ci = seg.findIndex(t => t.type === 'comma');
        if (ci > 0) { x = parseExpression(seg.slice(0, ci)); y = parseExpression(seg.slice(ci + 1)); }
        else { x = parseExpression(seg); y = { type: 'literal', value: 0 }; }
      }
      const colorEnd = forIdx > inIdx && inIdx > 0 ? forIdx : raw.length;
      const color = inIdx > 0 ? raw.slice(inIdx + 1, colorEnd).map(t => t.value).join(' ').trim() : '';
      let frames = { type: 'literal', value: 30 }, unit = 'frames';
      if (forIdx > 0) { const d = parseDurationTail(raw.slice(forIdx + 1)); frames = d.value; unit = d.unit; }
      return { type: 'emit', rate, x, y, ref, marker: markerIdx > 0 ? tv(raw[markerIdx]) : '',
               color: color || 'orange', frames, unit, lineNum };
    }

    // -- tween X.y from A to B over N [seconds|frames] [ease in|out|in out|bounce] --
    // Frame-counted property interpolation (no wall clock): the property is set to
    // `from` immediately and eased to `to` over N frames.
    if (first === 'tween') {
      const kw = (w) => raw.findIndex((t, i) => i > 1 && tv(t) === w);
      const fromIdx = kw('from'), toIdx = kw('to'), overIdx = kw('over'), easeIdx = kw('ease');
      const end = (a, b) => b > a ? b : raw.length;
      const target = tokensToRef(raw.slice(1, fromIdx > 0 ? fromIdx : end(0, toIdx)));
      const from = fromIdx > 0 ? parseExpression(raw.slice(fromIdx + 1, end(fromIdx, toIdx))) : { type: 'literal', value: 0 };
      const to = toIdx > 0 ? parseExpression(raw.slice(toIdx + 1, end(toIdx, overIdx))) : { type: 'literal', value: 0 };
      let frames = { type: 'literal', value: 60 }, unit = 'frames';
      if (overIdx > 0) { const d = parseDurationTail(raw.slice(overIdx + 1, easeIdx > overIdx ? easeIdx : raw.length)); frames = d.value; unit = d.unit; }
      const ease = easeIdx > 0 ? raw.slice(easeIdx + 1).map(t => String(t.value).toLowerCase()).join(' ') : '';
      return { type: 'tween', target, from, to, frames, unit, ease, lineNum };
    }

    // -- player has inventory  ·  add "key" to player inventory  ·  remove "key" from player inventory --
    if (raw.length === 3 && raw[0].type === 'word' && tv(raw[1]) === 'has' && tv(raw[2]) === 'inventory') {
      return { type: 'inventory', subject: raw[0].value, lineNum };
    }
    if ((first === 'add' || first === 'remove') && raw.length >= 4 && tv(raw[raw.length - 1]) === 'inventory') {
      const kwIdx = raw.findIndex((t, i) => i > 0 && t.type === 'word' && tv(t) === (first === 'add' ? 'to' : 'from'));
      if (kwIdx > 0 && kwIdx + 1 < raw.length - 1) {
        return { type: first === 'add' ? 'inv_add' : 'inv_remove',
                 item: parseExpression(raw.slice(1, kwIdx)),
                 subject: tokensToRef(raw.slice(kwIdx + 1, raw.length - 1)), lineNum };
      }
    }

    // -- show dialog "text" [at X, Y]  ·  show choice "a" "b" [at X, Y] --
    // Non-pausing dialogue: the engine draws the box/choices and keeps `dialog` /
    // `choice` up to date; the game decides what to pause (`if dialog is not "" return`).
    if (first === 'show' && raw[1] && raw[2] && raw[2].type === 'string'
        && (tv(raw[1]) === 'dialog' || tv(raw[1]) === 'choice')) {
      const kind = tv(raw[1]);
      const labels = [];
      let i = 2;
      while (i < raw.length && raw[i].type === 'string') { labels.push(raw[i].value); i++; }
      let x = null, y = null;
      const ai = raw.findIndex((t, k) => k >= i && t.type === 'word' && tv(t) === 'at');
      if (ai > 0) {
        const seg = raw.slice(ai + 1);
        const c = seg.findIndex(t => t.type === 'comma');
        if (c > 0) { x = parseExpression(seg.slice(0, c)); y = parseExpression(seg.slice(c + 1)); }
      }
      if (kind === 'dialog') return { type: 'dialog', text: labels[0] || '', x, y, lineNum };
      return { type: 'choice', labels, x, y, lineNum };
    }

    // -- burst 12 sparks at player  ·  burst 8 sparks at 64, 64 in yellow --
    if (first === 'burst') {
      const ai = raw.findIndex(t => t.type === 'word' && tv(t) === 'at');
      if (ai > 1) {
        const ii = raw.findIndex((t, k) => k > ai && t.type === 'word' && tv(t) === 'in');
        const placeEnd = ii > 0 ? ii : raw.length;
        const place = raw.slice(ai + 1, placeEnd);
        const color = ii > 0 ? raw.slice(ii + 1).map(t => t.value).join(' ') : null;
        const countToks = raw.slice(1, Math.max(2, ai - 1));   // the word before `at` is a decorative noun
        const count = parseExpression(countToks);
        const ci = place.findIndex(t => t.type === 'comma');
        if (ci > 0) {
          return { type: 'burst', count, x: parseExpression(place.slice(0, ci)), y: parseExpression(place.slice(ci + 1)), color, lineNum };
        }
        return { type: 'burst', count, ref: parseExpression(place), color, lineNum };
      }
    }

    // -- join game "X" room "Y"  (open the multiplayer relay socket) --
    if (first === 'join' && tv(raw[1]) === 'game') {
      const strs = raw.filter(t => t.type === 'string').map(t => t.value);
      const game = strs[0] || 'fc';
      const room = strs[1] || 'lobby';
      return { type: 'net_join', game, room, lineNum };
    }

    // -- broadcast {x: player.x, ...}  (send your state to peers) --
    if (first === 'broadcast' && raw.length >= 2) {
      return { type: 'broadcast', value: parseExpression(raw.slice(1)), lineNum };
    }

    // -- stop --
    if (first === 'stop' && raw.length === 1) {
      return { type: 'stop', lineNum };
    }

    // -- return --
    if (first === 'return') {
      return { type: 'return', value: raw.length > 1 ? parseExpression(raw.slice(1)) : null, lineNum };
    }

    // -- move X with arrows [speed N] --
    // Smart movement: reads held arrow keys, normalizes diagonal speed,
    // updates facing + dx/dy + walking. One line replaces the if-key ladder.
    if (first === 'move' && raw.length >= 4 && tv(raw[2]) === 'with' && tv(raw[3]) === 'arrows') {
      const target = raw[1].value;
      const spIdx = raw.findIndex(t => t.type === 'word' && tv(t) === 'speed');
      const speed = spIdx > 0 ? parseExpression(raw.slice(spIdx + 1)) : null;
      return { type: 'move_with_arrows', target, speed, lineNum };
    }

    // -- move X by DX, DY [blocked by WALLS] --
    // Manual move with optional wall-sliding; the engine does the per-axis AABB
    // so game code stays plain English (each wall may carry w/h, default 8).
    if (first === 'move' && raw.length >= 4 && tv(raw[2]) === 'by') {
      const target = raw[1].value;
      const bIdx = raw.findIndex(t => t.type === 'word' && tv(t) === 'blocked');
      const vec = raw.slice(3, bIdx > 0 ? bIdx : raw.length);
      const ci = vec.findIndex(t => t.type === 'comma');
      const dx = parseExpression(ci >= 0 ? vec.slice(0, ci) : vec);
      const dy = ci >= 0 ? parseExpression(vec.slice(ci + 1)) : { type: 'literal', value: 0 };
      const blockedBy = (bIdx > 0 && raw[bIdx + 2]) ? raw[bIdx + 2].value : null;  // "blocked by LIST"
      return { type: 'move_by', target, dx, dy, blockedBy, lineNum };
    }

    // -- clear screen to COLOR --
    if (first === 'clear' && raw.length >= 2 && tv(raw[1]) === 'screen') {
      const colorTokens = raw.slice(raw.findIndex(t => tv(t) === 'to') + 1);
      return { type: 'clearscreen', color: colorTokens.map(t => t.value).join(' '), lineNum };
    }

    // -- clear VARIABLE --
    if (first === 'clear') {
      return { type: 'clear', target: raw.slice(1).map(t => t.value).join('.'), lineNum };
    }

    // -- draw commands --
    if (first === 'draw') {
      return parseDraw(raw, lineNum);
    }

    // -- write "text" at x, y in color --
    if (first === 'write') {
      return parseWrite(raw, lineNum);
    }

    // -- say "text" --
    if (first === 'say') {
      return parseSay(raw, lineNum);
    }

    // -- show button "label" at x, y --
    if (first === 'show' && raw.length >= 3 && tv(raw[1]) === 'button') {
      return parseButton(raw, lineNum);
    }

    // -- show meter CURRENT of MAX at x, y [size w, h] [in color] --
    if (first === 'show' && raw.length >= 3 && tv(raw[1]) === 'meter') {
      return parseMeter(raw, lineNum);
    }

    // -- add X to Y --
    if (first === 'add') {
      return parseAdd(raw, lineNum);
    }

    // -- remove X from Y --
    if (first === 'remove') {
      return parseRemove(raw, lineNum);
    }

    // -- increase X [by N] / decrease X [by N]  (plain-English aliases; desugar to add/remove) --
    if (first === 'increase' || first === 'decrease') {
      const byIdx = raw.findIndex((t, i) => i > 0 && t.type === 'word' && tv(t) === 'by');
      const value = byIdx > 0 ? parseExpression(raw.slice(byIdx + 1)) : { type: 'literal', value: 1 };
      const target = tokensToRef(byIdx > 0 ? raw.slice(1, byIdx) : raw.slice(1));
      return { type: first === 'increase' ? 'add' : 'remove', value, target, lineNum };
    }

    // -- with X : a block whose `its <field>` lines resolve to X.<field> --
    if (first === 'with' && raw.length >= 2) {
      return { type: 'with', body: [], lineNum };
    }

    // -- toggle X --
    if (first === 'toggle') {
      return { type: 'toggle', target: raw.slice(1).map(t => t.value).join('.'), lineNum };
    }

    // -- double / halve --
    if (first === 'double') {
      return { type: 'double', target: raw.slice(1).map(t => t.value).join('.'), lineNum };
    }
    if (first === 'halve') {
      return { type: 'halve', target: raw.slice(1).map(t => t.value).join('.'), lineNum };
    }

    // -- reverse X  (flip a number's sign: reverse ball.dx)  desugars to X is 0 - X --
    if (first === 'reverse' && raw.length >= 2) {
      const refTokens = raw.slice(1);
      return { type: 'assign', target: tokensToRef(refTokens),
        value: { type: 'math', op: '-', left: { type: 'literal', value: 0 }, right: parseExpression(refTokens) }, lineNum };
    }

    // -- pset x, y in color --
    if (first === 'pset') {
      return parsePset(raw, lineNum);
    }

    // -- probability words --
    for (const [phrase, prob] of Object.entries(PROBABILITY)) {
      const phraseWords = phrase.split(' ');
      if (raw.length >= phraseWords.length) {
        let match = true;
        for (let pi = 0; pi < phraseWords.length; pi++) {
          if (tv(raw[pi]) !== phraseWords[pi]) { match = false; break; }
        }
        if (match) {
          const rest = raw.slice(phraseWords.length);
          return { type: 'probability', prob, stmt: parseLine(rest, lineNum), lineNum };
        }
      }
    }

    // -- X are Y (tag declaration) --
    // e.g. "trees are solid", "coins are pickups"
    const areIdx = findWord('are');
    if (areIdx > 0 && areIdx < raw.length - 1) {
      const subject = raw.slice(0, areIdx).map(t => t.value).join('');
      const tag = raw.slice(areIdx + 1).map(t => t.value).join(' ').toLowerCase().trim();
      return { type: 'tag', subject, tag, lineNum };
    }

    // -- restore/block player position --
    if (first === 'restore' || first === 'block') {
      const target = raw.slice(1).filter(t => t.type === 'word' && tv(t) !== 'position').map(t => t.value).join('.');
      return { type: 'restore', target: target || 'player', lineNum };
    }

    // -- knock X away from Y [distance N] --
    if (first === 'knock') {
      return parseKnock(raw, lineNum);
    }

    // -- walk X direction / walk X toward Y --
    if (first === 'walk' && raw.length >= 3) {
      const target = raw[1].value;
      if (tv(raw[2]) === 'toward' && raw.length >= 4) {
        return { type: 'walk_toward', target, towardName: raw[3].value, lineNum };
      }
      const dir = tv(raw[2]);
      if (['up', 'down', 'left', 'right'].includes(dir)) {
        return { type: 'walk', target, direction: dir, lineNum };
      }
    }

    // -- stop music / stop sound --  (checked BEFORE the `stop X` sprite form,
    // which would otherwise swallow `music`/`sound` as a target name)
    if (first === 'stop' && raw[1] && (tv(raw[1]) === 'music' || tv(raw[1]) === 'sound')) {
      return { type: 'stop_music', lineNum };
    }

    // -- stop walking X / stop X --
    if (first === 'stop' && raw.length >= 2) {
      // "stop walking X" — also accepts "stop X" as a synonym for sprites
      const targetIdx = tv(raw[1]) === 'walking' ? 2 : 1;
      if (targetIdx < raw.length) {
        return { type: 'stop_walking', target: raw[targetIdx].value, lineNum };
      }
    }

    // -- face X direction / face X toward Y --
    if (first === 'face' && raw.length >= 3) {
      const target = raw[1].value;
      // "face X toward Y"
      if (tv(raw[2]) === 'toward' && raw.length >= 4) {
        return { type: 'face_toward', target, towardName: raw[3].value, lineNum };
      }
      // "face X up/down/left/right"
      const dir = tv(raw[2]);
      if (['up', 'down', 'left', 'right'].includes(dir)) {
        return { type: 'face', target, direction: dir, lineNum };
      }
    }

    // -- damage X [N] --
    if (first === 'damage') {
      const target = raw[1] ? raw[1].value : 'player';
      const amt = raw.length > 2 ? parseExpression(raw.slice(2)) : { type: 'literal', value: 1 };
      return { type: 'damage', target, amount: amt, lineNum };
    }

    // -- heal X [N] --
    if (first === 'heal') {
      const target = raw[1] ? raw[1].value : 'player';
      const amt = raw.length > 2 ? parseExpression(raw.slice(2)) : { type: 'literal', value: 1 };
      return { type: 'heal', target, amount: amt, lineNum };
    }

    // -- X is Y (assignment) --
    const isIdx = findWord('is');
    if (isIdx > 0 && isIdx < raw.length - 1) {
      const target = raw.slice(0, isIdx);
      const valueTokens = raw.slice(isIdx + 1);
      return { type: 'assign', target: tokensToRef(target), value: parseExpression(valueTokens), lineNum };
    }

    // -- play sound "X" / play music "X" --
    if (first === 'play' && raw.length >= 2) {
      const kind = tv(raw[1]) === 'music' ? 'music' : 'sound';
      let name = null;
      for (let i = 1; i < raw.length; i++) {
        if (raw[i].type === 'string') { name = raw[i].value; break; }
        if (raw[i].type === 'word' && tv(raw[i]) !== 'sound' && tv(raw[i]) !== 'music') name = raw[i].value;
      }
      return { type: 'play_sound', kind, name, lineNum };
    }

    // -- function call (anything else) --
    return { type: 'call', name: first, args: raw.slice(1), argExprs: parseCallArgs(raw.slice(1)), lineNum };
  }

  function parseKnock(raw, lineNum) {
    // knock X away from Y [distance N]
    const awayIdx = raw.findIndex(t => t.type === 'word' && tv(t) === 'away');
    const fromIdx = raw.findIndex(t => t.type === 'word' && tv(t) === 'from');
    const distIdx = raw.findIndex(t => t.type === 'word' && tv(t) === 'distance');
    const target = raw[1] ? raw[1].value : 'player';
    let source = 'enemy';
    if (fromIdx > 0 && fromIdx + 1 < raw.length) source = raw[fromIdx + 1].value;
    let distance = { type: 'literal', value: 4 };
    if (distIdx > 0) distance = parseExpression(raw.slice(distIdx + 1));
    return { type: 'knock', target, source, distance, lineNum };
  }

  function splitOnAnd(tokens) {
    // Find "and" that separates statements (not inside "between X and Y" or "run game with X and Y")
    // Don't split if the line starts with a context that uses "and" as a connector: run, when
    const firstWord = tokens[0] ? tv(tokens[0]) : '';
    if (firstWord === 'run' || firstWord === 'when' || firstWord === 'to') {
      return [tokens];
    }
    const parts = [];
    let current = [];
    let inBetween = false;
    for (let i = 0; i < tokens.length; i++) {
      const v = tokens[i].value ? tv(tokens[i]) : '';
      if (v === 'between') inBetween = true;
      if (v === 'and' && inBetween) { inBetween = false; current.push(tokens[i]); continue; }
      if (v === 'and' && !inBetween && current.length > 0) {
        // Check if next token looks like a new command (word that's a verb/keyword)
        const next = tokens[i + 1];
        if (next && next.type === 'word' && isCommandWord(tv(next))) {
          parts.push(current);
          current = [];
          continue;
        }
      }
      current.push(tokens[i]);
    }
    if (current.length > 0) parts.push(current);
    return parts;
  }

  function isCommandWord(w) {
    if (userFuncs.has(w)) return true;
    return ['draw', 'write', 'say', 'add', 'remove', 'increase', 'decrease', 'clear', 'toggle', 'play', 'move',
      'flash', 'shake', 'stop', 'start', 'show', 'hide', 'emit', 'double', 'halve',
      'damage', 'heal', 'push', 'pull', 'set', 'put', 'get', 'load', 'save', 'pset', 'reverse', 'spawn', 'jump',
      'join', 'broadcast',
      'if', 'repeat', 'each', 'every', 'return', 'restore', 'block', 'knock', 'follow',
      'when', 'else', 'to', 'go', 'face', 'walk'].includes(w);
  }

  function parseWhen(raw, lineNum) {
    // when "key" is pressed / when mouse is clicked / when key is in [...]
    const rest = raw.slice(1);
    // when time runs out  (the optional match timer reached zero)
    if (rest.length >= 3 && tv(rest[0]) === 'time' && tv(rest[1]) === 'runs' && tv(rest[2]) === 'out') {
      const action = rest.length > 3 ? parseLine(rest.slice(3), lineNum) : null;
      return { type: 'when_timeout', thenStmt: action, body: [], lineNum };
    }
    // when player talks to "wizard"  [inline action]   (also accepts `talks to npc "x"`)
    if (rest.length >= 4 && tv(rest[0]) === 'player' && tv(rest[1]) === 'talks' && tv(rest[2]) === 'to') {
      const si = rest.findIndex((t, i) => i >= 3 && t.type === 'string');
      if (si > 0) {
        const action = si + 1 < rest.length ? parseLine(rest.slice(si + 1), lineNum) : null;
        return { type: 'when_talk', tag: String(rest[si].value).toLowerCase(), thenStmt: action, body: [], lineNum };
      }
    }

    // when "space" is pressed
    if (rest.length >= 3 && rest[0].type === 'string' && tv(rest[1]) === 'is' && tv(rest[2]) === 'pressed') {
      const action = rest.length > 3 ? parseLine(rest.slice(3), lineNum) : null;
      return { type: 'when_key', key: rest[0].value, thenStmt: action, body: [], lineNum };
    }
    // when key "X" is pressed
    if (rest.length >= 4 && tv(rest[0]) === 'key' && rest[1].type === 'string') {
      const action = rest.length > 4 ? parseLine(rest.slice(4), lineNum) : null;
      return { type: 'when_key', key: rest[1].value, thenStmt: action, body: [], lineNum };
    }
    // when key is in [list]
    if (rest.length >= 3 && tv(rest[0]) === 'key' && tv(rest[1]) === 'is') {
      const action = findInlineAction(rest, 3);
      return { type: 'when_key_in', keys: parseListLiteral(rest, 3), thenStmt: action.stmt, body: [], lineNum };
    }
    // when mouse is clicked
    if (rest.length >= 3 && tv(rest[0]) === 'mouse') {
      const action = rest.length > 3 ? parseLine(rest.slice(3), lineNum) : null;
      return { type: 'when_mouse', event: tv(rest[2]), thenStmt: action, body: [], lineNum };
    }

    // when button "X" is clicked [inline action]
    if (rest.length >= 4 && tv(rest[0]) === 'button' && rest[1].type === 'string' &&
        tv(rest[2]) === 'is' && tv(rest[3]) === 'clicked') {
      const action = rest.length > 4 ? parseLine(rest.slice(4), lineNum) : null;
      return { type: 'when_button', label: rest[1].value, thenStmt: action, body: [], lineNum };
    }

    // when player picks up any coin [inline action]
    const picksUpIdx = rest.findIndex((t, i) => i > 0 && tv(t) === 'picks' && i + 1 < rest.length && tv(rest[i + 1]) === 'up');
    if (picksUpIdx > 0) {
      // find item name (after "any")
      let itemIdx = picksUpIdx + 2;
      if (itemIdx < rest.length && tv(rest[itemIdx]) === 'any') itemIdx++;
      const itemVar = rest[itemIdx] ? rest[itemIdx].value : 'item';
      const action = rest.length > itemIdx + 1 ? parseLine(rest.slice(itemIdx + 1), lineNum) : null;
      return { type: 'when_pickup', itemVar, thenStmt: action, body: [], lineNum };
    }

    // when player hits any X
    const hitsIdx = rest.findIndex((t, i) => i > 0 && tv(t) === 'hits');
    if (hitsIdx > 0) {
      let itemIdx = hitsIdx + 1;
      if (itemIdx < rest.length && tv(rest[itemIdx]) === 'any') itemIdx++;
      const itemVar = rest[itemIdx] ? rest[itemIdx].value : 'item';
      const action = rest.length > itemIdx + 1 ? parseLine(rest.slice(itemIdx + 1), lineNum) : null;
      return { type: 'when_hit', itemVar, thenStmt: action, body: [], lineNum };
    }

    // when X is defeated  (fires when a hostile's hp hits 0 from a projectile)
    if (rest.length >= 3 && tv(rest[1]) === 'is' && tv(rest[2]) === 'defeated') {
      const itemVar = rest[0].value;
      const action = rest.length > 3 ? parseLine(rest.slice(3), lineNum) : null;
      return { type: 'when_defeat', itemVar, thenStmt: action, body: [], lineNum };
    }

    return { type: 'when_generic', tokens: rest, body: [], lineNum };
  }

  function findInlineAction(raw, startAfter) {
    // Look for tokens after a bracket close or keyword boundary
    for (let i = startAfter; i < raw.length; i++) {
      if (raw[i].type === 'rbracket') {
        if (i + 1 < raw.length) return { stmt: parseLine(raw.slice(i + 1), 0), end: i };
        return { stmt: null, end: i };
      }
    }
    return { stmt: null, end: raw.length };
  }

  function parseListLiteral(raw, startIdx) {
    const items = [];
    let i = startIdx;
    // skip "in"
    while (i < raw.length && tv(raw[i]) === 'in') i++;
    // skip [
    if (i < raw.length && raw[i].type === 'lbracket') i++;
    while (i < raw.length && raw[i].type !== 'rbracket') {
      if (raw[i].type !== 'comma') {
        items.push(raw[i].type === 'string' ? raw[i].value : raw[i].value);
      }
      i++;
    }
    return items;
  }

  function parseIf(raw, lineNum) {
    // Find where the condition ends and an inline statement begins. The condition
    // is a boolean expression (one comparison per and/or clause). Once we've seen
    // a comparison in the current clause — `is` OR a comparison operator
    // (> < >= <= !=) — the NEXT `is` starts an inline assignment statement, e.g.
    // `if e.x + adir > 118 hit is yes` -> cond=`e.x+adir>118`, then=`hit is yes`.
    // (Tracking only `is` missed conditions that compare with > / < etc.)
    let condEnd = raw.length;
    let seenCompare = false;
    const isCmpOp = t => t.type === 'operator' && ['>', '<', '>=', '<=', '!='].includes(t.value);
    for (let i = 1; i < raw.length; i++) {
      // after a logical and/or, the next clause starts fresh
      if (raw[i].type === 'word' && (tv(raw[i]) === 'and' || tv(raw[i]) === 'or')) {
        seenCompare = false;
        continue;
      }
      if (isCmpOp(raw[i])) { seenCompare = true; continue; }
      if (raw[i].type === 'word' && tv(raw[i]) === 'is') {
        if (seenCompare) {
          // this `is` begins an inline assignment — split before its target
          // (walk back over a dotted ref like `player.x`)
          let j = i - 1;
          while (j - 1 >= 2 && raw[j - 1].type === 'dot') j -= 2;
          condEnd = j;
          break;
        }
        // No comparison yet. Usually this `is` is the condition's own comparison
        // (`if mode is "play"`). But if the condition before this `is`'s target is
        // a self-contained boolean (a bare var / `not X` / `no X`) and the target
        // is a separate ref, it's an inline assignment with no comparison:
        // `if ready done is yes` -> cond=`ready`, then=`done is yes`.
        // Tell it apart from a multi-token LEFT operand (`the number of peers is 5`,
        // `a + b is 5`): the token before the target — if it's a continuation
        // (operator / dot / `of` / `mod`) the target is part of the left operand.
        let ts = i - 1;
        while (ts - 1 >= 2 && raw[ts - 1] && raw[ts - 1].type === 'dot') ts -= 2;
        const pre = raw[ts - 1];
        const continuesLeft = pre && (pre.type === 'operator' || pre.type === 'dot' ||
          (pre.type === 'word' && ['of', 'mod', 'and', 'or'].includes(tv(pre))));
        if (ts > 1 && raw[ts] && raw[ts].type === 'word' && pre && !continuesLeft) {
          condEnd = ts;   // condition = raw[1..ts), then = `<target> is <value>`
          break;
        }
        seenCompare = true;
        continue;
      }
      if (raw[i].type === 'word' && isCommandWord(tv(raw[i]))) {
        const prev = raw[i - 1];
        if (prev && prev.type === 'word' && ['is', 'not', 'and', 'or', 'in', 'between'].includes(tv(prev))) continue;
        condEnd = i;
        break;
      }
    }
    const condition = parseCondition(raw.slice(1, condEnd));
    const thenStmt = condEnd < raw.length ? parseLine(raw.slice(condEnd), lineNum) : null;
    return { type: 'if', condition, thenStmt, body: [], lineNum };
  }

  // Collapse English comparison phrases into operator tokens ("is more/greater than"
  // ->>, "is less/fewer than" / "is under/below"-><, "is over/above"->>, "is at least"
  // ->>=, "is at most"-><=). Leaves `is not`, `is in`, `is between`, plain `is` alone.
  function collapseCmp(tokens) {
    const W = t => (t && t.type === 'word') ? tv(t) : null;
    const out = [];
    for (let i = 0; i < tokens.length; i++) {
      if (W(tokens[i]) === 'is') {
        const a = W(tokens[i + 1]), b = W(tokens[i + 2]);
        if ((a === 'more' || a === 'greater') && b === 'than') { out.push({ type: 'operator', value: '>' }); i += 2; continue; }
        if ((a === 'less' || a === 'fewer') && b === 'than') { out.push({ type: 'operator', value: '<' }); i += 2; continue; }
        if (a === 'at' && b === 'least') { out.push({ type: 'operator', value: '>=' }); i += 2; continue; }
        if (a === 'at' && b === 'most') { out.push({ type: 'operator', value: '<=' }); i += 2; continue; }
        if (a === 'under' || a === 'below') { out.push({ type: 'operator', value: '<' }); i += 1; continue; }
        if (a === 'over' || a === 'above') { out.push({ type: 'operator', value: '>' }); i += 1; continue; }
      }
      out.push(tokens[i]);
    }
    return out;
  }

  function parseCondition(tokens) {
    if (tokens.length === 0) return { type: 'literal', value: false };
    tokens = collapseCmp(tokens);

    // Handle `key "X"` with an optional `is held` / `is pressed` / `is down`
    // (or just `held` / `pressed` / `down`) suffix — check live key state.
    if (tokens[0].type === 'word' && tv(tokens[0]) === 'key' && tokens.length >= 2 && tokens[1].type === 'string') {
      const rest = tokens.slice(2).map(t => tv(t));
      if (rest.every(w => ['is', 'held', 'pressed', 'down', 'being'].includes(w))) {
        return { type: 'key_pressed', key: tokens[1].value.toLowerCase() };
      }
    }

    // Handle "not" prefix
    if (tokens[0].type === 'word' && tv(tokens[0]) === 'not') {
      return { type: 'not', expr: parseCondition(tokens.slice(1)) };
    }

    // Handle "no X" (e.g., "no enemies")
    if (tokens[0].type === 'word' && tv(tokens[0]) === 'no') {
      return { type: 'not', expr: parseExpression(tokens.slice(1)) };
    }

    // Look for "and" / "or" logical operators
    for (let i = 1; i < tokens.length; i++) {
      if (tokens[i].type === 'word' && tv(tokens[i]) === 'or') {
        return { type: 'or', left: parseCondition(tokens.slice(0, i)), right: parseCondition(tokens.slice(i + 1)) };
      }
    }
    for (let i = 1; i < tokens.length; i++) {
      if (tokens[i].type === 'word' && tv(tokens[i]) === 'and') {
        return { type: 'and', left: parseCondition(tokens.slice(0, i)), right: parseCondition(tokens.slice(i + 1)) };
      }
    }

    // "X is between A and B"
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type === 'word' && tv(tokens[i]) === 'between') {
        const left = parseExpression(tokens.slice(0, i - 1)); // before "is"
        let andIdx = -1;
        for (let j = i + 1; j < tokens.length; j++) {
          if (tokens[j].type === 'word' && tv(tokens[j]) === 'and') { andIdx = j; break; }
        }
        if (andIdx > 0) {
          return { type: 'between', value: left, low: parseExpression(tokens.slice(i + 1, andIdx)), high: parseExpression(tokens.slice(andIdx + 1)) };
        }
      }
    }

    // "X is in [list]"
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type === 'word' && tv(tokens[i]) === 'is') {
        if (i + 1 < tokens.length && tokens[i + 1].type === 'word' && tv(tokens[i + 1]) === 'not') {
          if (i + 2 < tokens.length && tokens[i + 2].type === 'word' && tv(tokens[i + 2]) === 'in') {
            return { type: 'not', expr: { type: 'in', value: parseExpression(tokens.slice(0, i)), list: parseListFromTokens(tokens.slice(i + 3)) } };
          }
          // X is not Y
          return { type: 'neq', left: parseExpression(tokens.slice(0, i)), right: parseExpression(tokens.slice(i + 2)) };
        }
        if (i + 1 < tokens.length && tokens[i + 1].type === 'word' && tv(tokens[i + 1]) === 'in') {
          return { type: 'in', value: parseExpression(tokens.slice(0, i)), list: parseListFromTokens(tokens.slice(i + 2)) };
        }
        // X is Y (equality)
        return { type: 'eq', left: parseExpression(tokens.slice(0, i)), right: parseExpression(tokens.slice(i + 1)) };
      }
    }

    // comparison operators
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type === 'operator' && ['>', '<', '>=', '<=', '!='].includes(tokens[i].value)) {
        return { type: 'cmp', op: tokens[i].value, left: parseExpression(tokens.slice(0, i)), right: parseExpression(tokens.slice(i + 1)) };
      }
    }

    // `player has "key" in inventory` — inventory membership (strict equality)
    if (tokens.length >= 5 && tv(tokens[tokens.length - 1]) === 'inventory'
        && tv(tokens[tokens.length - 2]) === 'in') {
      const hi = tokens.findIndex(t => t.type === 'word' && tv(t) === 'has');
      if (hi > 0) {
        return { type: 'inv_has', subject: tokensToRef(tokens.slice(0, hi)), item: parseExpression(tokens.slice(hi + 1, tokens.length - 2)) };
      }
    }

    // "X has Y" (contains)
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type === 'word' && tv(tokens[i]) === 'has') {
        return { type: 'has', left: parseExpression(tokens.slice(0, i)), right: parseExpression(tokens.slice(i + 1)) };
      }
    }

    // bare expression (truthiness)
    return parseExpression(tokens);
  }

  function parseListFromTokens(tokens) {
    if (tokens.length === 0) return { type: 'literal', value: [] };
    if (tokens[0].type === 'lbracket') {
      // Depth-aware split on commas
      const items = [];
      let depth = 0;
      let current = [];
      for (let i = 1; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.type === 'rbracket' && depth === 0) {
          if (current.length) items.push(parseExpression(current));
          break;
        }
        if (t.type === 'lbracket' || t.type === 'lbrace') depth++;
        if (t.type === 'rbracket' || t.type === 'rbrace') { depth--; current.push(t); continue; }
        if (t.type === 'comma' && depth === 0) {
          if (current.length) items.push(parseExpression(current));
          current = [];
          continue;
        }
        current.push(t);
      }
      return { type: 'listliteral', items };
    }
    return parseExpression(tokens);
  }

  // Parse a user-function call's argument tokens into a positional list of
  // expressions. Args are separated by top-level commas OR the 'at'/'with'
  // connector words (the same words stripped from the param list), e.g.
  // `fill at 2 with 9` -> [2, 9], `drop at 3, 4` -> [3, 4]. Paren/bracket/brace
  // aware; empty segments (a leading connector) are dropped.
  function parseCallArgs(tokens) {
    const segs = []; let cur = [], depth = 0;
    for (const t of tokens) {
      const ty = t.type;
      if (ty === 'lparen' || ty === 'lbracket' || ty === 'lbrace') { depth++; cur.push(t); continue; }
      if (ty === 'rparen' || ty === 'rbracket' || ty === 'rbrace') { depth--; cur.push(t); continue; }
      const sep = depth === 0 && (ty === 'comma' || (ty === 'word' && (tv(t) === 'at' || tv(t) === 'with' || tv(t) === 'in')));
      if (sep) { if (cur.length) segs.push(cur); cur = []; }
      else cur.push(t);
    }
    if (cur.length) segs.push(cur);
    return segs.map(seg => parseExpression(seg));
  }

  function parseExpression(tokens) {
    if (tokens.length === 0) return { type: 'literal', value: 0 };
    if (tokens.length === 1) {
      const t = tokens[0];
      if (t.type === 'number') return { type: 'literal', value: t.value };
      if (t.type === 'string') return { type: 'literal', value: t.value };
      if (t.value === 'yes') return { type: 'literal', value: true };
      if (t.value === 'no') return { type: 'literal', value: false };
      return { type: 'ref', name: t.value };
    }

    // Strip a fully-wrapping paren group: ( EXPR ) -> EXPR. Only when the opening
    // paren's match is the LAST token (so (a+b)*(c) isn't mis-stripped).
    if (tokens[0].type === 'lparen') {
      let depth = 0, matched = -1;
      for (let i = 0; i < tokens.length; i++) {
        const ty = tokens[i].type;
        if (ty === 'lparen' || ty === 'lbracket' || ty === 'lbrace') depth++;
        else if (ty === 'rparen' || ty === 'rbracket' || ty === 'rbrace') depth--;
        if (depth === 0) { matched = i; break; }
      }
      if (matched === tokens.length - 1) return parseExpression(tokens.slice(1, matched));
    }

    // Handle list literal [a, b, c]
    if (tokens[0].type === 'lbracket') {
      return parseListFromTokens(tokens);
    }

    // Handle object literal {x: 1, y: 2}
    if (tokens[0].type === 'lbrace') {
      return parseObjectLiteral(tokens);
    }

    // Handle "random N"
    if (tokens[0].type === 'word' && tv(tokens[0]) === 'random') {
      return { type: 'random', max: parseExpression(tokens.slice(1)) };
    }

    // Handle `load "name"` (read a value saved with `save`; 0 if never saved)
    if (tokens[0].type === 'word' && tv(tokens[0]) === 'load' && tokens.length >= 2) {
      return { type: 'load', key: parseExpression(tokens.slice(1)) };
    }

    // Handle `solid at X, Y` (is that point on a solid map tile? yes/no)
    if (tokens[0].type === 'word' && tv(tokens[0]) === 'solid' &&
        tokens.length >= 4 && tv(tokens[1]) === 'at') {
      const rest = tokens.slice(2);
      const ci = rest.findIndex(t => t.type === 'comma');
      if (ci > 0) return { type: 'solid_at', x: parseExpression(rest.slice(0, ci)), y: parseExpression(rest.slice(ci + 1)) };
    }

    // "list of N <noun> [{props}]" - auto-placed sprite list
    if (tokens[0].type === 'word' && tv(tokens[0]) === 'list' &&
        tokens.length >= 3 && tv(tokens[1]) === 'of') {
      let propsStart = tokens.length;
      for (let i = 2; i < tokens.length; i++) {
        if (tokens[i].type === 'lbrace') { propsStart = i; break; }
      }
      // Count is tokens[2] (single number/ref - multi-token count support later)
      const count = parseExpression([tokens[2]]);
      let props = null;
      if (propsStart < tokens.length) {
        props = parseObjectLiteral(tokens.slice(propsStart));
      }
      return { type: 'list_of_sprites', count, props };
    }

    // "centered sprite [{...}]"
    if (tokens[0].type === 'word' && tv(tokens[0]) === 'centered' &&
        tokens.length >= 2 && tv(tokens[1]) === 'sprite') {
      let props = null;
      if (tokens.length >= 3 && tokens[2].type === 'lbrace') {
        props = parseObjectLiteral(tokens.slice(2));
      }
      return { type: 'sprite_expr', position: 'centered', props };
    }

    // "sprite [{...}]"
    if (tokens[0].type === 'word' && tv(tokens[0]) === 'sprite' &&
        (tokens.length === 1 || tokens[1].type === 'lbrace')) {
      let props = null;
      if (tokens.length >= 2 && tokens[1].type === 'lbrace') {
        props = parseObjectLiteral(tokens.slice(1));
      }
      return { type: 'sprite_expr', position: 'zero', props };
    }

    // Property access: a.b.c
    if (tokens.length >= 3 && tokens[1].type === 'dot') {
      let ref = tokens[0].value;
      let i = 1;
      while (i < tokens.length && tokens[i].type === 'dot') {
        ref += '.' + tokens[i + 1].value;
        i += 2;
      }
      if (i >= tokens.length) return { type: 'ref', name: ref };
      // more tokens after property - continue to math
      const newTokens = [{ type: 'word', value: ref }, ...tokens.slice(i)];
      return parseExpression(newTokens);
    }

    // "item N of list"
    if (tokens[0].type === 'word' && tv(tokens[0]) === 'item') {
      const ofIdx = tokens.findIndex((t, i) => i > 0 && t.type === 'word' && tv(t) === 'of');
      if (ofIdx > 0) {
        return { type: 'item_of', index: parseExpression(tokens.slice(1, ofIdx)), list: parseExpression(tokens.slice(ofIdx + 1)) };
      }
    }

    // "the number of X" / "count of X"
    if (tokens[0].type === 'word' && tv(tokens[0]) === 'the' &&
      tokens.length >= 4 && tv(tokens[1]) === 'number' && tv(tokens[2]) === 'of') {
      return { type: 'count', expr: parseExpression(tokens.slice(3)) };
    }
    if (tokens[0].type === 'word' && tv(tokens[0]) === 'count' &&
      tokens.length >= 3 && tv(tokens[1]) === 'of') {
      return { type: 'count', expr: parseExpression(tokens.slice(2)) };
    }

    // Math: +, -, *, /, mod  — split at the rightmost TOP-LEVEL operator (depth 0),
    // so operators inside ( ) [ ] { } stay grouped. Scan right-to-left for left-assoc.
    // Low precedence: + -
    for (let i = tokens.length - 1, depth = 0; i >= 1; i--) {
      const ty = tokens[i].type;
      if (ty === 'rparen' || ty === 'rbracket' || ty === 'rbrace') depth++;
      else if (ty === 'lparen' || ty === 'lbracket' || ty === 'lbrace') depth--;
      if (depth === 0 && tokens[i].type === 'operator' && (tokens[i].value === '+' || tokens[i].value === '-')) {
        return { type: 'math', op: tokens[i].value, left: parseExpression(tokens.slice(0, i)), right: parseExpression(tokens.slice(i + 1)) };
      }
    }
    // High precedence: * / mod
    for (let i = tokens.length - 1, depth = 0; i >= 1; i--) {
      const ty = tokens[i].type;
      if (ty === 'rparen' || ty === 'rbracket' || ty === 'rbrace') depth++;
      else if (ty === 'lparen' || ty === 'lbracket' || ty === 'lbrace') depth--;
      if (depth === 0 && ((tokens[i].type === 'operator' && (tokens[i].value === '*' || tokens[i].value === '/')) ||
        (tokens[i].type === 'word' && tv(tokens[i]) === 'mod'))) {
        return { type: 'math', op: tokens[i].value === 'mod' ? '%' : tokens[i].value, left: parseExpression(tokens.slice(0, i)), right: parseExpression(tokens.slice(i + 1)) };
      }
    }

    // Leading unary minus: -X  (placed after the binary +/- split above, which
    // scans from the right and skips index 0 — so -4 + 10 splits at + first = 6,
    // while a bare -X negates the atom).
    if (tokens[0].type === 'operator' && tokens[0].value === '-') {
      return { type: 'math', op: '-', left: { type: 'literal', value: 0 }, right: parseExpression(tokens.slice(1)) };
    }

    // String interpolation - join remaining tokens
    // If mixed types, try to form a string
    if (tokens[0].type === 'string') {
      return { type: 'literal', value: tokens[0].value };
    }

    // Fall back: first token as ref
    return { type: 'ref', name: tokens.map(t => t.value).join(' ') };
  }

  function parseObjectLiteral(tokens) {
    // Build an object_expr where each value is a parsed expression.
    // The runtime evaluates each value at construction time so refs like
    // {x: player.x} resolve dynamically.
    const props = {};
    let i = 1; // skip {
    while (i < tokens.length && tokens[i].type !== 'rbrace') {
      if (tokens[i].type === 'comma') { i++; continue; }
      const key = tokens[i].value;
      i++; // skip key
      if (i < tokens.length && tokens[i].value === ':') i++; // colon (rarely tokenized)
      // Find end of value: next comma or closing brace at depth 0
      const valueStart = i;
      let depth = 0;
      while (i < tokens.length) {
        const t = tokens[i];
        if (depth === 0 && (t.type === 'comma' || t.type === 'rbrace')) break;
        if (t.type === 'lbrace' || t.type === 'lbracket' || t.type === 'lparen') depth++;
        if (t.type === 'rbrace' || t.type === 'rbracket' || t.type === 'rparen') depth--;
        i++;
      }
      const valueTokens = tokens.slice(valueStart, i);
      if (valueTokens.length > 0) {
        props[key] = parseExpression(valueTokens);
      }
    }
    return { type: 'object_expr', props };
  }

  function tokensToRef(tokens) {
    const parts = [];
    for (const t of tokens) {
      if (t.type === 'dot') parts.push('.');
      else parts.push(t.value);
    }
    return parts.join('');
  }

  // Detect and strip "on hud" / "on screen" suffix. Returns { tokens, hud }
  function stripHudSuffix(raw) {
    for (let i = raw.length - 2; i >= 0; i--) {
      if (raw[i].type === 'word' && tv(raw[i]) === 'on' &&
          raw[i + 1].type === 'word' && (tv(raw[i + 1]) === 'hud' || tv(raw[i + 1]) === 'screen')) {
        return { tokens: raw.slice(0, i), hud: true };
      }
    }
    return { tokens: raw, hud: false };
  }

  function parseDraw(raw, lineNum) {
    const stripped = stripHudSuffix(raw);
    raw = stripped.tokens;
    const hudFlag = stripped.hud;
    const shape = raw[1] ? tv(raw[1]) : '';
    const args = {};

    // Handle "draw sprite <name-or-expr> at x, y"
    if (shape === 'sprite' && raw.length >= 3) {
      const atIdx = raw.findIndex((t, i) => i >= 3 && t.type === 'word' && tv(t) === 'at');
      const nameEnd = atIdx > 0 ? atIdx : raw.length;
      const nameTokens = raw.slice(2, nameEnd);
      // Literal-string shortcut keeps the simple case fast
      if (nameTokens.length === 1 && nameTokens[0].type === 'string') {
        args.spriteName = nameTokens[0].value.toLowerCase().replace(/\s+/g, '_');
      } else if (nameTokens.length > 0) {
        args.spriteNameExpr = parseExpression(nameTokens);
      }
      if (atIdx > 0) {
        const afterAt = raw.slice(atIdx + 1);
        const commaIdx = afterAt.findIndex(t => t.type === 'comma');
        if (commaIdx > 0) {
          args.x = parseExpression(afterAt.slice(0, commaIdx));
          args.y = parseExpression(afterAt.slice(commaIdx + 1));
        } else {
          args.x = parseExpression(afterAt);
        }
      }
      return { type: 'draw', shape: 'sprite', args, hud: hudFlag, lineNum };
    }

    // Find positions of all keyword delimiters
    const KEYWORDS = ['at', 'size', 'from', 'to', 'in'];
    const positions = [];
    for (let i = 2; i < raw.length; i++) {
      if (raw[i].type === 'word' && KEYWORDS.includes(tv(raw[i]))) {
        positions.push({ kw: tv(raw[i]), idx: i });
      }
    }
    positions.push({ kw: 'END', idx: raw.length });

    // For each keyword, extract tokens until the next keyword
    for (let p = 0; p < positions.length - 1; p++) {
      const { kw, idx } = positions[p];
      const nextIdx = positions[p + 1].idx;
      const segment = raw.slice(idx + 1, nextIdx);

      if (kw === 'in') {
        args.color = segment.map(t => t.value).join(' ');
        continue;
      }

      // Split segment on comma for x, y pairs
      const commaIdx = segment.findIndex(t => t.type === 'comma');
      let first, second;
      if (commaIdx > 0) {
        first = parseExpression(segment.slice(0, commaIdx));
        second = parseExpression(segment.slice(commaIdx + 1));
      } else {
        first = parseExpression(segment);
      }

      if (kw === 'at') { args.x = first; args.y = second; }
      else if (kw === 'size') { args.w = first; args.h = second || first; }
      else if (kw === 'from') { args.x1 = first; args.y1 = second; }
      else if (kw === 'to') { args.x2 = first; args.y2 = second; }
    }
    return { type: 'draw', shape, args, hud: hudFlag, lineNum };
  }

  function parseWrite(raw, lineNum) {
    const stripped = stripHudSuffix(raw);
    raw = stripped.tokens;
    const hudFlag = stripped.hud;
    let text = null, x = null, y = null, color = null;
    let i = 1;
    // get text
    if (i < raw.length && raw[i].type === 'string') {
      text = raw[i].value;
      i++;
    } else {
      // expression until "at"
      const atIdx = raw.findIndex((t, idx) => idx > 0 && t.type === 'word' && tv(t) === 'at');
      if (atIdx > 0) {
        text = raw.slice(1, atIdx).map(t => t.value).join(' ');
        i = atIdx;
      }
    }
    // Find at/in keyword positions and extract multi-token expressions
    const atIdx2 = raw.findIndex((t, idx) => idx >= i && t.type === 'word' && tv(t) === 'at');
    const inIdx2 = raw.findIndex((t, idx) => idx >= i && t.type === 'word' && tv(t) === 'in');
    if (atIdx2 > 0) {
      const end = inIdx2 > atIdx2 ? inIdx2 : raw.length;
      const segment = raw.slice(atIdx2 + 1, end);
      const commaIdx = segment.findIndex(t => t.type === 'comma');
      if (commaIdx > 0) {
        x = parseExpression(segment.slice(0, commaIdx));
        y = parseExpression(segment.slice(commaIdx + 1));
      } else {
        x = parseExpression(segment);
      }
    }
    if (inIdx2 > 0) {
      color = raw.slice(inIdx2 + 1).map(t => t.value).join(' ');
    }
    return { type: 'write', text: text ? { type: 'literal', value: text } : { type: 'literal', value: '' }, x: x || { type: 'literal', value: 0 }, y: y || { type: 'literal', value: 0 }, color: color || 'white', hud: hudFlag, lineNum };
  }

  function parseButton(raw, lineNum) {
    // show button "label" at x, y
    const label = raw[2] && raw[2].type === 'string' ? raw[2].value : '';
    const atIdx = raw.findIndex(t => t.type === 'word' && tv(t) === 'at');
    let x = { type: 'literal', value: 10 }, y = { type: 'literal', value: 10 };
    if (atIdx > 0) {
      const after = raw.slice(atIdx + 1);
      const commaIdx = after.findIndex(t => t.type === 'comma');
      if (commaIdx > 0) {
        x = parseExpression(after.slice(0, commaIdx));
        y = parseExpression(after.slice(commaIdx + 1));
      } else {
        x = parseExpression(after);
      }
    }
    return { type: 'button', label, x, y, lineNum };
  }

  function parseMeter(raw, lineNum) {
    // show meter CURRENT of MAX at x, y [size w, h] [in color]
    const idxOf = (w) => raw.findIndex((t, i) => i > 1 && t.type === 'word' && tv(t) === w);
    const ofIdx = idxOf('of');
    const atIdx = idxOf('at');
    const sizeIdx = idxOf('size');
    const inIdx = idxOf('in');

    const num = (v) => ({ type: 'literal', value: v });
    const segment = (a, b) => raw.slice(a, b);

    // current: from index 2 up to "of" (or "at" if no "of")
    const curEnd = ofIdx > 0 ? ofIdx : (atIdx > 0 ? atIdx : raw.length);
    const current = parseExpression(segment(2, curEnd));
    // max: between "of" and "at"
    const max = ofIdx > 0 ? parseExpression(segment(ofIdx + 1, atIdx > 0 ? atIdx : raw.length)) : num(1);

    // x, y after "at"
    let x = num(2), y = num(2);
    if (atIdx > 0) {
      const xyEnd = sizeIdx > 0 ? sizeIdx : (inIdx > 0 ? inIdx : raw.length);
      const xy = segment(atIdx + 1, xyEnd);
      const c = xy.findIndex(t => t.type === 'comma');
      if (c > 0) { x = parseExpression(xy.slice(0, c)); y = parseExpression(xy.slice(c + 1)); }
      else x = parseExpression(xy);
    }

    // optional size
    let w = num(40), h = num(5);
    if (sizeIdx > 0) {
      const sEnd = inIdx > sizeIdx ? inIdx : raw.length;
      const sz = segment(sizeIdx + 1, sEnd);
      const c = sz.findIndex(t => t.type === 'comma');
      if (c > 0) { w = parseExpression(sz.slice(0, c)); h = parseExpression(sz.slice(c + 1)); }
    }

    // optional color
    let color = 'green';
    if (inIdx > 0) color = raw.slice(inIdx + 1).map(t => t.value).join(' ');

    return { type: 'meter', current, max, x, y, w, h, color, lineNum };
  }

  // Parse the tail of a timed statement: `N`, `N frames`, `N seconds`, or `N
  // frame`/`N second`. Returns {value: <expr>, unit}. Mirrors the `time limit`
  // conversion so every timed verb speaks the same units.
  function parseDurationTail(toks) {
    let body = toks.slice();
    let unit = 'frames';
    if (body.length && tv(body[body.length - 1]) === 'seconds') { unit = 'seconds'; body = body.slice(0, -1); }
    else if (body.length && tv(body[body.length - 1]) === 'second') { unit = 'seconds'; body = body.slice(0, -1); }
    else if (body.length && tv(body[body.length - 1]) === 'frames') { body = body.slice(0, -1); }
    else if (body.length && tv(body[body.length - 1]) === 'frame') { body = body.slice(0, -1); }
    return { value: parseExpression(body), unit };
  }

  function parseSay(raw, lineNum) {
    if (raw.length >= 2 && raw[1].type === 'string') {
      return { type: 'say', text: { type: 'literal', value: raw[1].value }, lineNum };
    }
    return { type: 'say', text: parseExpression(raw.slice(1)), lineNum };
  }

  function parseAdd(raw, lineNum) {
    // add X to Y
    const toIdx = raw.findIndex((t, i) => i > 0 && t.type === 'word' && tv(t) === 'to');
    if (toIdx > 0) {
      return { type: 'add', value: parseExpression(raw.slice(1, toIdx)), target: tokensToRef(raw.slice(toIdx + 1)), lineNum };
    }
    return { type: 'call', name: 'add', args: raw.slice(1), lineNum };
  }

  function parseRemove(raw, lineNum) {
    // remove X from Y
    const fromIdx = raw.findIndex((t, i) => i > 0 && t.type === 'word' && tv(t) === 'from');
    if (fromIdx > 0) {
      return { type: 'remove', value: parseExpression(raw.slice(1, fromIdx)), target: tokensToRef(raw.slice(fromIdx + 1)), lineNum };
    }
    return { type: 'call', name: 'remove', args: raw.slice(1), lineNum };
  }

  function parseRepeat(raw, lineNum) {
    // repeat N times
    const timesIdx = raw.findIndex(t => t.type === 'word' && tv(t) === 'times');
    if (timesIdx > 0) {
      return { type: 'repeat_times', count: parseExpression(raw.slice(1, timesIdx)), body: [], lineNum };
    }
    // repeat with X from A to B
    const withIdx = raw.findIndex(t => t.type === 'word' && tv(t) === 'with');
    if (withIdx > 0) {
      const varName = raw[withIdx + 1] ? raw[withIdx + 1].value : 'i';
      const fromIdx = raw.findIndex(t => t.type === 'word' && tv(t) === 'from');
      const toIdx = raw.findIndex((t, i) => i > fromIdx && t.type === 'word' && tv(t) === 'to');
      if (fromIdx > 0 && toIdx > 0) {
        return { type: 'repeat_range', varName, from: parseExpression(raw.slice(fromIdx + 1, toIdx)), to: parseExpression(raw.slice(toIdx + 1)), body: [], lineNum };
      }
    }
    // repeat while/until
    if (raw.length >= 2 && tv(raw[1]) === 'while') {
      return { type: 'repeat_while', condition: parseCondition(raw.slice(2)), body: [], lineNum };
    }
    if (raw.length >= 2 && tv(raw[1]) === 'until') {
      return { type: 'repeat_until', condition: parseCondition(raw.slice(2)), body: [], lineNum };
    }
    // bare repeat
    return { type: 'forever', body: [], lineNum };
  }

  function parseEach(raw, lineNum) {
    // each X in Y [where condition] [inline action]
    const inIdx = raw.findIndex((t, i) => i > 0 && t.type === 'word' && tv(t) === 'in');
    if (inIdx > 0) {
      const varName = raw.slice(1, inIdx).map(t => t.value).join(' ');
      // Find: list-end = first command word after the first token past "in"
      let listEnd = raw.length;
      for (let i = inIdx + 2; i < raw.length; i++) {
        if (raw[i].type === 'word' && isCommandWord(tv(raw[i]))) {
          listEnd = i;
          break;
        }
      }
      const whereIdx = raw.findIndex((t, i) => i > inIdx && i < listEnd && t.type === 'word' && tv(t) === 'where');
      let list, where = null;
      const listUpper = whereIdx > 0 ? whereIdx : listEnd;
      list = parseExpression(raw.slice(inIdx + 1, listUpper));
      if (whereIdx > 0) {
        where = parseCondition(raw.slice(whereIdx + 1, listEnd));
      }
      const thenStmt = listEnd < raw.length ? parseLine(raw.slice(listEnd), lineNum) : null;
      return { type: 'each', varName, list, where, thenStmt, body: [], lineNum };
    }
    return { type: 'call', name: 'each', args: raw.slice(1), lineNum };
  }

  function parsePset(raw, lineNum) {
    let x = null, y = null, color = 'white';
    const inIdx = raw.findIndex((t, idx) => idx > 0 && t.type === 'word' && tv(t) === 'in');
    const end = inIdx > 0 ? inIdx : raw.length;
    const segment = raw.slice(1, end);
    const commaIdx = segment.findIndex(t => t.type === 'comma');
    if (commaIdx > 0) {
      x = parseExpression(segment.slice(0, commaIdx));
      y = parseExpression(segment.slice(commaIdx + 1));
    } else {
      x = parseExpression(segment);
    }
    if (inIdx > 0) {
      color = raw.slice(inIdx + 1).map(t => t.value).join(' ');
    }
    return { type: 'pset', x: x || { type: 'literal', value: 0 }, y: y || { type: 'literal', value: 0 }, color, lineNum };
  }

  const program = parseBlock(0, 0);
  return program;
}

// ============================================================
// INTERPRETER
// ============================================================

// ---- runtime diagnostics: plain-English help for the forgiving engine --------
// fc never stops for a bad value; it substitutes one (an item out of range becomes
// nothing, text in maths becomes 0) and carries on. These helpers turn that
// silence into a message a beginner can act on, tagged with a clickable line.
function fcIsNumeric(s) { return !isNaN(parseFloat(String(s))); }
function fcTypeName(v) {
  if (v === null || v === undefined) return 'nothing';
  if (Array.isArray(v)) return 'list';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'string') return 'text';
  if (typeof v === 'boolean') return 'yes/no';
  return 'thing';
}
function fcShow(v) {
  if (v === null || v === undefined) return 'nothing';
  if (typeof v === 'string') return '"' + v + '"';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  return 'that';
}
// how to name an expression in a message: a variable reads as itself
function fcNameOf(node) {
  if (node && node.type === 'ref') return String(node.name);
  if (node && node.type === 'literal' && (typeof node.value === 'number' || typeof node.value === 'string')) return fcShow(node.value);
  return 'that';
}
function fcEditDistance(a, b) {
  a = String(a); b = String(b);
  let prev = [];
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}
// the closest known name, when it is close enough to be a typo
function fcNearMiss(word, keys) {
  const sorted = keys.slice().sort();
  let best = null, bestD = 99;
  for (const k of sorted) {
    const d = fcEditDistance(String(word).toLowerCase(), String(k).toLowerCase());
    if (d < bestD) { bestD = d; best = k; }
  }
  return bestD <= 2 && bestD > 0 ? best : null;
}
class Runtime {
  constructor() {
    this.vars = {};
    this.funcs = {};
    this.gameLoop = null;
    this.animFrame = null;
    this.keyState = {};
    this.keyJustPressed = {};
    this.mouseState = { x: 0, y: 0, down: false, clicked: false };
    this.eventHandlers = { key: {}, key_in: [], mouse: {}, timeout: null }; this.timeLimitFrames = undefined; this.timeoutFired = false;
    this.tags = { solid: [], pickups: [], hostile: [], deadly: [], passable: [] };
    this.tileDefs = {};
    this.map = null;
    this.behaviorSubjects = [];
    this.animSubjects = [];
    this.particles = []; this.emitters = []; this.tweens = [];
    this.pickupHandlers = {};
    this.hitHandlers = {};
    this.defeatHandlers = {};
    this.buttonHandlers = {};
    this.buttons = [];  // list of {label, x, y, w, h} redrawn each frame
    this._prevPositions = {};
    this.camera = { x: 0, y: 0 };
    this.followTarget = null;
    this.world = { width: 128, height: 128 };
    this._screenStack = [];
    this._screenTarget = null;
    this.errors = [];
    this._line = 0;        // source line of the statement being executed
    this._errSeen = new Set();
    this.stopped = false;
    this.sayBuffer = [];
    this._rafId = null;
    this._watchdog = null;
  }

  reset() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    if (this._watchdog) clearInterval(this._watchdog);
    if (this.animFrame) clearInterval(this.animFrame);
    AUDIO.stopMusic();
    NET.close();   // drop any relay socket; re-opened if the program calls `join`
    this._everyCounters = {};
    for (const k in USER_SPRITES) delete USER_SPRITES[k];   // re-registered on each run
    this.vars = {};
    this.funcs = {};
    this.gameLoop = null;
    this.animFrame = null;
    this._rafId = null;
    this._watchdog = null;
    this.eventHandlers = { key: {}, key_in: [], mouse: {}, timeout: null }; this.timeLimitFrames = undefined; this.timeoutFired = false;
    this.tags = { solid: [], pickups: [], hostile: [], deadly: [], passable: [] };
    this.tileDefs = {};
    this.map = null;
    this.behaviorSubjects = [];
    this.animSubjects = [];
    this.particles = []; this.emitters = []; this.tweens = [];
    this.pickupHandlers = {};
    this.hitHandlers = {};
    this.defeatHandlers = {};
    this.buttonHandlers = {};
    this.buttons = [];  // list of {label, x, y, w, h} redrawn each frame
    this._prevPositions = {};
    this.camera = { x: 0, y: 0 };
    this.followTarget = null;
    this.world = { width: 128, height: 128 };
    this._screenStack = [];
    this._screenTarget = null;
    this.errors = [];
    this._line = 0;
    this._errSeen = new Set();
    this.stopped = false;
    this.sayBuffer = [];
    this._trace = null;              // when an array, exec() records a step per statement (debugger)
    this._traceLoopFuncs = null;     // captured `run game` funcs so the debugger can step one frame w/o RAF
    // don't reset keyState - it's maintained by event listeners
  }

  error(msg, lineNum) {
    const n = lineNum || this._line || 0;
    // one message per (line, text): a bad `item` in a loop must not spam the panel
    this._errSeen = this._errSeen || new Set();
    const key = n + ':' + msg;
    if (this._errSeen.has(key)) return;
    this._errSeen.add(key);
    if (this.errors.length >= 25) {
      if (this._errSeen.has('+cap')) return;
      this._errSeen.add('+cap');
      this.errors.push('(…and more \u2014 fix these first)');
      return;
    }
    this.errors.push((n ? `Line ${n}: ` : '') + msg);
  }

  // A dotted read that came back empty: say which step failed, with a near-miss
  // guess at the name that was meant. Only for paths whose first name exists —
  // reading a variable that was never set is normal, not a mistake.
  reportMissingPath(name) {
    const parts = String(name).split('.');
    let cur = this.vars[parts[0]];
    if (cur === undefined) return;
    let path = parts[0];
    for (let i = 1; i < parts.length; i++) {
      const key = parts[i];
      if (cur === null || cur === undefined) return;
      if (Array.isArray(cur)) {
        if (key === 'count' || key === 'length') { cur = cur.length; path = path + '.' + key; continue; }
        this.error(`${path} is a list, so it has no ${key}`);
        return;
      }
      if (typeof cur !== 'object') {
        this.error(`${path} is a ${fcTypeName(cur)}, so it has no ${key}`);
        return;
      }
      if (!Object.prototype.hasOwnProperty.call(cur, key)) {
        const guess = fcNearMiss(key, Object.keys(cur));
        this.error(`${path} has no ${key}` + (guess ? ` \u2014 did you mean ${guess}?` : ''));
        return;
      }
      cur = cur[key];
      path = path + '.' + key;
    }
  }

  isTruthy(val) {
    if (val === null || val === undefined) return false;
    if (val === false || val === 'no') return false;
    if (val === true || val === 'yes') return true;
    if (typeof val === 'number') return val !== 0;
    if (typeof val === 'string') return val !== '';
    if (Array.isArray(val)) return val.length > 0;
    if (typeof val === 'object') return Object.keys(val).length > 0;
    return true;
  }

  // A color word resolves to the palette/CSS name — UNLESS a variable of that name
  // exists, in which case its value names the color (dynamic colors: `shade is
  // green` … `draw rect … in shade`). A two-word name like "dark gray" can never be
  // a variable, so it always stays a palette lookup.
  colorOf(name) {
    if (name) {
      const v = this.getVar(String(name));
      if (typeof v === 'string' || typeof v === 'number') return resolveColor(String(v));
    }
    return resolveColor(name);
  }
  getVar(name) {
    if (name.includes('.')) {
      const parts = name.split('.');
      let obj = this.vars[parts[0]];
      for (let i = 1; i < parts.length; i++) {
        if (obj == null) return undefined;
        if (parts[i] === 'count' || parts[i] === 'length') {
          if (Array.isArray(obj)) return obj.length;
        }
        obj = obj[parts[i]];
      }
      return obj;
    }
    return this.vars[name];
  }

  setVar(name, value) {
    if (name.includes('.')) {
      const parts = name.split('.');
      let obj = this.vars[parts[0]];
      if (obj == null) { this.vars[parts[0]] = {}; obj = this.vars[parts[0]]; }
      for (let i = 1; i < parts.length - 1; i++) {
        if (obj[parts[i]] == null) obj[parts[i]] = {};
        obj = obj[parts[i]];
      }
      obj[parts[parts.length - 1]] = value;
    } else {
      this.vars[name] = value;
    }
  }

  evalExpr(node) {
    if (!node) return 0;
    switch (node.type) {
      case 'literal': {
        if (Array.isArray(node.value)) return node.value.map(item => this.evalExpr(item));
        if (typeof node.value === 'object' && node.value !== null && !Array.isArray(node.value)) {
          // deep copy object
          const obj = {};
          for (const [k, v] of Object.entries(node.value)) obj[k] = v;
          return obj;
        }
        return node.value;
      }
      case 'listliteral': return node.items.map(item => this.evalExpr(item));
      case 'object_expr': {
        const obj = {};
        for (const [key, expr] of Object.entries(node.props)) {
          obj[key] = this.evalExpr(expr);
        }
        return obj;
      }
      case 'ref': {
        const v = this.getVar(node.name);
        if (v !== undefined) return v;
        // might be a color name or unknown
        if (COLORS[node.name.toLowerCase()]) return node.name;
        if (String(node.name).indexOf('.') !== -1) this.reportMissingPath(node.name);
        return undefined;
      }
      case 'math': {
        let l = this.evalExpr(node.left);
        let r = this.evalExpr(node.right);
        // forgiving coercion — but say so when the value was never a number
        if (typeof l === 'string') { if (!fcIsNumeric(l)) this.error('"' + l + '" is text, so I used 0'); l = parseFloat(l) || 0; }
        if (typeof r === 'string') { if (!fcIsNumeric(r)) this.error('"' + r + '" is text, so I used 0'); r = parseFloat(r) || 0; }
        switch (node.op) {
          case '+': return l + r;
          case '-': return l - r;
          case '*': return l * r;
          case '/': if (r === 0) { this.error("can't divide by zero \u2014 I used 0"); return 0; } return l / r;
          case '%': if (r === 0) { this.error("can't divide by zero \u2014 I used 0"); return 0; } return l % r;
        }
        return 0;
      }
      case 'random': {
        const max = this.evalExpr(node.max);
        return Math.floor(Math.random() * (max + 1));
      }
      case 'load': {
        const v = STORE.get(String(this.evalExpr(node.key)));
        return v === undefined ? 0 : v;
      }
      case 'solid_at': {
        if (!this.map) return false;
        const row = this.map.rows[Math.floor(this.evalExpr(node.y) / 8)];
        if (!row) return false;
        const def = this.tileDefs[row[Math.floor(this.evalExpr(node.x) / 8)]];
        return !!(def && def.solid);
      }
      case 'sprite_expr': {
        // Ensure world is in sync before placement
        if (this.vars.world && typeof this.vars.world.width === 'number') {
          this.world = this.vars.world;
        }
        const base = { x: 0, y: 0 };
        if (node.position === 'centered') {
          base.x = Math.floor((this.world.width - 8) / 2);
          base.y = Math.floor((this.world.height - 8) / 2);
        }
        if (node.props) {
          const props = this.evalExpr(node.props);
          Object.assign(base, props);
        }
        // Auto-populate dx/dy from facing so projectiles/walking work even
        // before the first face/walk verb runs
        if (base.facing && DIR_VECTORS[base.facing]) {
          if (typeof base.dx !== 'number') base.dx = DIR_VECTORS[base.facing].dx;
          if (typeof base.dy !== 'number') base.dy = DIR_VECTORS[base.facing].dy;
        }
        return base;
      }
      case 'list_of_sprites': {
        if (this.vars.world && typeof this.vars.world.width === 'number') {
          this.world = this.vars.world;
        }
        const count = this.evalExpr(node.count);
        const items = [];
        const existing = this._collectAllSprites();
        for (let i = 0; i < count; i++) {
          const props = node.props ? this.evalExpr(node.props) : {};
          const pos = this._findEmptySpot(existing);
          const item = Object.assign({ x: pos.x, y: pos.y }, props);
          items.push(item);
          existing.push({ x: pos.x, y: pos.y });
        }
        return items;
      }
      case 'item_of': {
        const idx = this.evalExpr(node.index);
        const list = this.evalExpr(node.list);
        if (Array.isArray(list)) {
          // 1-based indexing
          if (typeof idx !== 'number' || !isFinite(idx)) { this.error("can't use " + fcShow(idx) + " as an item number"); return undefined; }
          if (idx < 1) { this.error('item numbers start at 1, but you asked for item ' + fcShow(idx)); return undefined; }
          if (idx > list.length) {
            this.error(fcNameOf(node.list) + ' only has ' + list.length + (list.length === 1 ? ' item' : ' items') + ', but you asked for item ' + fcShow(idx));
            return undefined;
          }
          return list[idx - 1];
        }
        if (list !== undefined && list !== null) {
          this.error(fcNameOf(node.list) + " isn't a list, so I can't take item " + fcShow(idx) + ' from it');
        }
        return undefined;
      }
      case 'count': {
        const val = this.evalExpr(node.expr);
        if (Array.isArray(val)) return val.length;
        if (typeof val === 'string') return val.length;
        if (val !== undefined && val !== null) {
          this.error(fcNameOf(node.expr) + ' is a ' + fcTypeName(val) + ", so I can't count it");
        }
        return 0;
      }
      case 'not': return !this.isTruthy(this.evalCondition(node));
      case 'eq': case 'neq': case 'cmp': case 'between': case 'in': case 'has': case 'and': case 'or':
        return this.evalCondition(node);
      default: return 0;
    }
  }

  evalCondition(node) {
    if (!node) return false;
    switch (node.type) {
      case 'key_pressed': return !!this.keyState[node.key];
      case 'eq': return this.evalExpr(node.left) == this.evalExpr(node.right);
      case 'neq': return this.evalExpr(node.left) != this.evalExpr(node.right);
      case 'cmp': {
        const l = this.evalExpr(node.left);
        const r = this.evalExpr(node.right);
        switch (node.op) {
          case '>': return l > r;
          case '<': return l < r;
          case '>=': return l >= r;
          case '<=': return l <= r;
          case '!=': return l != r;
        }
        return false;
      }
      case 'between': {
        const v = this.evalExpr(node.value);
        return v >= this.evalExpr(node.low) && v <= this.evalExpr(node.high);
      }
      case 'in': {
        const v = this.evalExpr(node.value);
        const list = this.evalExpr(node.list);
        if (Array.isArray(list)) return list.includes(v);
        return false;
      }
      case 'inv_has': {
        const o = this.getVar(node.subject);
        const inv = (o && typeof o === 'object' && Array.isArray(o.inventory)) ? o.inventory : [];
        const item = this.evalExpr(node.item);
        return inv.some(x => x === item);
      }

      case 'has': {
        const l = this.evalExpr(node.left);
        const r = this.evalExpr(node.right);
        if (typeof l === 'string') return l.toLowerCase().includes(String(r).toLowerCase());
        if (Array.isArray(l)) return l.includes(r);
        return false;
      }
      case 'not': return !this.isTruthy(this.evalCondition(node.expr));
      case 'and': return this.isTruthy(this.evalCondition(node.left)) && this.isTruthy(this.evalCondition(node.right));
      case 'or': return this.isTruthy(this.evalCondition(node.left)) || this.isTruthy(this.evalCondition(node.right));
      default: return this.isTruthy(this.evalExpr(node));
    }
  }

  interpolate(s) {
    if (typeof s !== 'string') return String(s ?? '');
    return s.replace(/\{([^}]+)\}/g, (_, name) => {
      const val = this.getVar(name.trim());
      return val !== undefined ? String(val) : '{' + name + '}';
    });
  }

  exec(stmts, maxOps) {
    if (!stmts) return;
    const limit = maxOps || 100000;
    let ops = 0;
    // Isolate return within this exec context (return exits function, not whole runtime)
    const priorReturning = this._returning || false;
    this._returning = false;
    // Execute a statement list with proper if / else if / else threading at EVERY
    // nesting level. Previously only the top-level list went through smartExecList,
    // so an if/else nested inside a loop body ran its `else` unconditionally (both
    // branches firing). Delegating here fixes that — see smartExecList below.
    const execList = (list) => smartExecList(list);
    const execOne = (stmt) => {
      if (!stmt || this.stopped || this._returning) return;
      if (stmt.lineNum) this._line = stmt.lineNum;
      switch (stmt.type) {
        case 'chain':
          for (const part of stmt.parts) execOne(part);
          break;

        case 'assign': {
          const val = this.evalExpr(stmt.value);
          // `coins is list of 4 sprites` — the list's name says what the sprites are
          // (design decisions, Q3): fill in an image when the singular is a built-in
          // sprite and the sprite did not name one. An explicit image always wins.
          const infer = (stmt.value && stmt.value.type === 'list_of_sprites' && stmt.target.indexOf('.') === -1)
            ? singularize(stmt.target) : '';
          if (infer && SPRITES[infer] && Array.isArray(val)) {
            for (const item of val) {
              if (item && typeof item === 'object' && !Array.isArray(item) && item.image == null) item.image = infer;
            }
          }
          this.setVar(stmt.target, val);
          break;
        }

        case 'add': {
          const val = this.evalExpr(stmt.value);
          const current = this.getVar(stmt.target);
          if (Array.isArray(current)) {
            current.push(val);
          } else if (typeof current === 'number' || current === undefined) {
            const numVal = typeof val === 'string' ? parseFloat(val) || 0 : val;
            this.setVar(stmt.target, (current || 0) + numVal);
          } else if (typeof current === 'string') {
            this.setVar(stmt.target, current + String(val));
          }
          break;
        }

        case 'remove': {
          const val = this.evalExpr(stmt.value);
          const current = this.getVar(stmt.target);
          if (Array.isArray(current)) {
            const idx = current.indexOf(val);
            if (idx >= 0) current.splice(idx, 1);
          } else if (typeof current === 'number') {
            const numVal = typeof val === 'string' ? parseFloat(val) || 0 : val;
            this.setVar(stmt.target, current - numVal);
          }
          break;
        }

        case 'clear': {
          const current = this.getVar(stmt.target);
          if (Array.isArray(current)) this.setVar(stmt.target, []);
          else if (typeof current === 'number') this.setVar(stmt.target, 0);
          else if (typeof current === 'string') this.setVar(stmt.target, '');
          else if (typeof current === 'boolean') this.setVar(stmt.target, false);
          else this.setVar(stmt.target, 0);
          break;
        }

        case 'toggle': {
          const current = this.getVar(stmt.target);
          if (typeof current === 'boolean') this.setVar(stmt.target, !current);
          else if (typeof current === 'number') this.setVar(stmt.target, current === 0 ? 1 : 0);
          else if (current === 'yes') this.setVar(stmt.target, 'no');
          else if (current === 'no') this.setVar(stmt.target, 'yes');
          else this.setVar(stmt.target, !this.isTruthy(current));
          break;
        }

        case 'double': {
          const current = this.getVar(stmt.target);
          if (typeof current === 'number') this.setVar(stmt.target, current * 2);
          break;
        }

        case 'halve': {
          const current = this.getVar(stmt.target);
          if (typeof current === 'number') this.setVar(stmt.target, current / 2);
          break;
        }

        case 'if': {
          if (this.isTruthy(this.evalCondition(stmt.condition))) {
            if (stmt.thenStmt) execOne(stmt.thenStmt);
            if (stmt.body && stmt.body.length) execList(stmt.body);
          } else {
            // look for else/else_if after this in parent scope
            // handled by the else_if/else processing below
          }
          break;
        }

        case 'else_if': {
          // only runs if previous if was false - handled in execList
          if (this.isTruthy(this.evalCondition(stmt.condition))) {
            if (stmt.thenStmt) execOne(stmt.thenStmt);
            if (stmt.body && stmt.body.length) execList(stmt.body);
          }
          break;
        }

        case 'else': {
          if (stmt.thenStmt) execOne(stmt.thenStmt);
          if (stmt.body && stmt.body.length) execList(stmt.body);
          break;
        }

        case 'repeat_times': {
          const count = this.evalExpr(stmt.count);
          for (let i = 0; i < count && !this.stopped && ops < limit; i++) {
            ops++;
            execList(stmt.body);
          }
          break;
        }

        case 'repeat_range': {
          const from = this.evalExpr(stmt.from);
          const to = this.evalExpr(stmt.to);
          const step = from <= to ? 1 : -1;
          for (let i = from; step > 0 ? i <= to : i >= to; i += step) {
            if (this.stopped || ops > limit) break;
            ops++;
            this.setVar(stmt.varName, i);
            execList(stmt.body);
          }
          break;
        }

        case 'repeat_while': {
          while (this.isTruthy(this.evalCondition(stmt.condition)) && !this.stopped && ops < limit) {
            ops++;
            execList(stmt.body);
          }
          break;
        }

        case 'repeat_until': {
          while (!this.isTruthy(this.evalCondition(stmt.condition)) && !this.stopped && ops < limit) {
            ops++;
            execList(stmt.body);
          }
          break;
        }

        case 'with': { execList(stmt.body); break; }

        case 'forever': {
          // In non-game mode, just run a bunch of times
          for (let i = 0; i < 1000 && !this.stopped && ops < limit; i++) {
            ops++;
            execList(stmt.body);
          }
          break;
        }

        case 'every': {
          // Run the body once every N frames (or N*60 frames for seconds).
          // Counter persists across frames, keyed by source line.
          if (!this._everyCounters) this._everyCounters = {};
          const key = stmt.lineNum;
          const c = (this._everyCounters[key] || 0) + 1;
          this._everyCounters[key] = c;
          const period = Math.max(1, stmt.unit === 'seconds' ? Math.round(stmt.n * 60) : stmt.n);
          if (c % period === 0) execList(stmt.body);
          break;
        }

        case 'each': {
          let list = this.evalExpr(stmt.list);
          if (!Array.isArray(list)) break;
          if (stmt.where) {
            list = list.filter(item => {
              this.setVar(stmt.varName, item);
              return this.isTruthy(this.evalCondition(stmt.where));
            });
          }
          for (const item of list) {
            if (this.stopped || ops > limit) break;
            ops++;
            this.setVar(stmt.varName, item);
            if (stmt.thenStmt) execOne(stmt.thenStmt);
            if (stmt.body && stmt.body.length) execList(stmt.body);
          }
          break;
        }

        case 'funcdef': {
          this.funcs[stmt.name] = stmt;
          break;
        }

        case 'rungame': {
          // Sync world from user variable if they set it
          if (this.vars.world && typeof this.vars.world.width === 'number') {
            this.world = this.vars.world;
          }
          // In a debug trace we must NOT start the live RAF loop — capture the
          // loop functions so the debugger can step exactly one frame instead.
          if (this._trace) { this._traceLoopFuncs = stmt.funcs; }
          else { this.startGameLoop(stmt.funcs); }
          break;
        }

        case 'follow': {
          this.followTarget = stmt.target;
          // Also sync world size now in case user set it before follow
          if (this.vars.world && typeof this.vars.world.width === 'number') {
            this.world = this.vars.world;
          }
          break;
        }

        case 'goto': {
          // Navigate to a screen, remember previous for `go back`
          if (this.vars.mode) this._screenStack.push(this.vars.mode);
          this.vars.mode = stmt.target;
          this._screenTarget = stmt.target;   // marks a NAVIGATION (see the draw dispatch)
          // Clear buttons immediately so old buttons don't catch stale clicks
          this.buttons = [];
          break;
        }

        case 'goback': {
          if (this._screenStack.length > 0) {
            this.vars.mode = this._screenStack.pop();
            this.buttons = [];
          }
          break;
        }

        case 'when_key': {
          this.eventHandlers.key[stmt.key.toLowerCase()] = stmt;
          break;
        }

        case 'when_timeout': {
          this.eventHandlers.timeout = stmt;
          break;
        }

        case 'time_limit': {
          const secs = Number(this.evalExpr(stmt.value)) || 0;
          this.timeLimitFrames = Math.max(0, Math.round(stmt.unit === 'seconds' ? secs * 60 : secs));
          this.timeLeftFrames = this.timeLimitFrames;
          this.timeoutFired = false;
          this.vars.timer = Math.ceil(this.timeLeftFrames / 60);
          break;
        }

        case 'flash': {
          const n = Number(this.evalExpr(stmt.frames)) || 0;
          this.flashFrames = Math.max(0, Math.round(stmt.unit === 'seconds' ? n * 60 : n));
          this.flashColor = stmt.color || 'white';
          break;
        }

        case 'shake': {
          const n = Number(this.evalExpr(stmt.frames)) || 0;
          this.shakeFrames = Math.max(0, Math.round(stmt.unit === 'seconds' ? n * 60 : n));
          this.shakeMag = Math.max(0, Number(this.evalExpr(stmt.magnitude)) || 0);
          break;
        }


        case 'when_key_in': {
          this.eventHandlers.key_in.push(stmt);
          break;
        }

        case 'when_mouse': {
          this.eventHandlers.mouse[stmt.event] = stmt;
          break;
        }

        case 'when_button': {
          this.buttonHandlers[stmt.label.toLowerCase()] = stmt;
          break;
        }

        case 'button': {
          // Draw a button and remember its hitbox
          this.drawButton(stmt);
          break;
        }

        case 'meter': {
          this.drawMeter(stmt);
          break;
        }

        case 'when_pickup': {
          this.pickupHandlers[stmt.itemVar] = stmt;
          break;
        }

        case 'when_hit': {
          this.hitHandlers[stmt.itemVar] = stmt;
          break;
        }

        case 'when_defeat': {
          this.defeatHandlers[stmt.itemVar] = stmt;
          break;
        }

        case 'tag': {
          // Register subject under tag
          if (!this.tags[stmt.tag]) this.tags[stmt.tag] = [];
          if (!this.tags[stmt.tag].includes(stmt.subject)) {
            this.tags[stmt.tag].push(stmt.subject);
          }
          break;
        }

        case 'restore': {
          const prev = this._prevPositions[stmt.target];
          const obj = this.getVar(stmt.target);
          if (prev && obj) {
            obj.x = prev.x;
            obj.y = prev.y;
          }
          break;
        }

        case 'knock': {
          const target = this.getVar(stmt.target);
          const source = this.getVar(stmt.source);
          const dist = this.evalExpr(stmt.distance);
          if (target && source && typeof target.x === 'number' && typeof source.x === 'number') {
            const dx = target.x - source.x;
            const dy = target.y - source.y;
            const len = Math.sqrt(dx*dx + dy*dy) || 1;
            target.x += (dx / len) * dist;
            target.y += (dy / len) * dist;
          }
          break;
        }

        case 'damage': {
          const obj = this.getVar(stmt.target);
          const amt = this.evalExpr(stmt.amount);
          if (obj && typeof obj.hp === 'number') {
            obj.hp -= amt;
          }
          break;
        }

        case 'face': {
          const obj = this.getVar(stmt.target);
          if (obj) {
            obj.facing = stmt.direction;
            const v = DIR_VECTORS[stmt.direction];
            if (v) { obj.dx = v.dx; obj.dy = v.dy; }
          }
          break;
        }

        case 'move_with_arrows': {
          const obj = this.getVar(stmt.target);
          if (obj) {
            const sp = stmt.speed != null ? this.evalExpr(stmt.speed)
                     : (typeof obj.speed === 'number' ? obj.speed : 1);
            let mx = 0, my = 0;
            if (this.keyState.up) my -= 1;
            if (this.keyState.down) my += 1;
            if (this.keyState.left) mx -= 1;
            if (this.keyState.right) mx += 1;
            // Normalize diagonal so it isn't ~1.41x faster than cardinal
            if (mx !== 0 && my !== 0) { mx *= 0.7071; my *= 0.7071; }
            obj.x += mx * sp;
            obj.y += my * sp;
            obj.walking = (mx !== 0 || my !== 0);
            // Facing: dominant axis, horizontal priority on a tie (incl. diagonals)
            if (obj.walking) {
              let dir;
              if (Math.abs(mx) >= Math.abs(my)) dir = mx > 0 ? 'right' : 'left';
              else dir = my > 0 ? 'down' : 'up';
              obj.facing = dir;
              const v = DIR_VECTORS[dir];
              if (v) { obj.dx = v.dx; obj.dy = v.dy; }
            }
          }
          break;
        }

        case 'move_by': {
          const obj = this.getVar(stmt.target);
          if (obj && typeof obj === 'object') {
            const dx = Number(this.evalExpr(stmt.dx)) || 0;
            const dy = Number(this.evalExpr(stmt.dy)) || 0;
            const walls = stmt.blockedBy ? this.getVar(stmt.blockedBy) : null;
            const sz = (typeof obj.w === 'number') ? obj.w : 6;   // mover box (defaults to 6)
            const blocked = (px, py) => {
              if (!Array.isArray(walls)) return false;
              for (const w of walls) {
                if (!w || typeof w.x !== 'number') continue;
                const ww = (typeof w.w === 'number') ? w.w : 8;
                const wh = (typeof w.h === 'number') ? w.h : 8;
                if (px + sz > w.x && px < w.x + ww && py + sz > w.y && py < w.y + wh) return true;
              }
              return false;
            };
            // move each axis only if it stays clear — slides along walls
            if (!blocked(obj.x + dx, obj.y)) obj.x += dx;
            if (!blocked(obj.x, obj.y + dy)) obj.y += dy;
          }
          break;
        }

        case 'walk': {
          const obj = this.getVar(stmt.target);
          if (obj) {
            obj.facing = stmt.direction;
            const v = DIR_VECTORS[stmt.direction];
            if (v) { obj.dx = v.dx; obj.dy = v.dy; }
            obj.walking = true;
          }
          break;
        }

        case 'walk_toward': {
          const obj = this.getVar(stmt.target);
          const target = this.getVar(stmt.towardName);
          if (obj && target && typeof target.x === 'number' && typeof obj.x === 'number') {
            const dx = target.x - obj.x;
            const dy = target.y - obj.y;
            const dir = Math.abs(dx) > Math.abs(dy)
              ? (dx > 0 ? 'right' : 'left')
              : (dy > 0 ? 'down' : 'up');
            obj.facing = dir;
            const v = DIR_VECTORS[dir];
            if (v) { obj.dx = v.dx; obj.dy = v.dy; }
            obj.walking = true;
          }
          break;
        }

        case 'stop_walking': {
          const obj = this.getVar(stmt.target);
          if (obj) obj.walking = false;
          break;
        }

        case 'face_toward': {
          const obj = this.getVar(stmt.target);
          const target = this.getVar(stmt.towardName);
          if (obj && target && typeof target.x === 'number' && typeof obj.x === 'number') {
            const dx = target.x - obj.x;
            const dy = target.y - obj.y;
            // Pick dominant axis
            let dir;
            if (Math.abs(dx) > Math.abs(dy)) {
              dir = dx > 0 ? 'right' : 'left';
            } else {
              dir = dy > 0 ? 'down' : 'up';
            }
            obj.facing = dir;
            const v = DIR_VECTORS[dir];
            if (v) { obj.dx = v.dx; obj.dy = v.dy; }
          }
          break;
        }

        case 'heal': {
          const obj = this.getVar(stmt.target);
          const amt = this.evalExpr(stmt.amount);
          if (obj && typeof obj.hp === 'number') {
            obj.hp += amt;
            if (typeof obj.max_hp === 'number' && obj.hp > obj.max_hp) obj.hp = obj.max_hp;
          }
          break;
        }

        case 'clearscreen': {
          const color = this.colorOf(stmt.color);
          ctx.fillStyle = color;
          ctx.fillRect(0, 0, 128, 128);
          break;
        }

        case 'play_sound':
          if (stmt.kind === 'music') AUDIO.music(stmt.name);
          else AUDIO.play(stmt.name);
          break;

        case 'stop_music':
          AUDIO.stopMusic();
          break;

        case 'def_sprite':
          if (stmt.hex && stmt.hex.length === 64) USER_SPRITES[stmt.name] = stmt.hex;
          break;

        case 'def_song':
          AUDIO.defineSong(stmt.name, stmt.tempo, stmt.rows);
          break;

        case 'def_sfx':
          AUDIO.defineSfx(stmt.name, stmt.recipe);
          break;

        case 'jump': {
          const obj = this.getVar(stmt.target);
          if (obj && typeof obj === 'object') obj.dy = -stmt.force;
          break;
        }

        case 'save': {
          const key = String(this.evalExpr(stmt.key));
          STORE.set(key, this.evalExpr(stmt.value));
          break;
        }

        case 'tile_def': {
          const props = this.evalExpr(stmt.props);
          this.tileDefs[stmt.ch] = (props && typeof props === 'object') ? props : {};
          break;
        }

        case 'map_def': {
          const rows = (stmt.body || [])
            .map(s => (s && s.type === 'literal' && typeof s.value === 'string') ? s.value : null)
            .filter(v => v !== null);
          let cols = 0;
          for (const r of rows) cols = Math.max(cols, r.length);
          this.map = rows.length ? { rows, cols } : null;
          if (this.map) {
            // the map defines the world (never smaller than one screen)
            this.world = { width: Math.max(128, cols * 8), height: Math.max(128, rows.length * 8) };
            this.vars.world = this.world;
          }
          break;
        }

        case 'draw_map': {
          if (!this.map) break;
          const ox = this.camera.x, oy = this.camera.y;
          const rows = this.map.rows;
          for (let r = 0; r < rows.length; r++) {
            const y = r * 8 - oy;
            if (y <= -8 || y >= 128) continue;
            const row = rows[r];
            for (let c = 0; c < row.length; c++) {
              const def = this.tileDefs[row[c]];
              if (!def || !def.image) continue;
              const x = c * 8 - ox;
              if (x <= -8 || x >= 128) continue;
              drawSprite(def.image, x, y);
            }
          }
          break;
        }

        case 'behavior': {
          const v = this.getVar(stmt.subject);
          const speed = stmt.speed ? this.evalExpr(stmt.speed) : null;
          const items = Array.isArray(v) ? v : (v && typeof v === 'object' ? [v] : []);
          for (const m of items) {
            const b = { kind: stmt.kind };
            if (stmt.kind === 'chase') b.target = stmt.target;
            if (stmt.kind === 'patrol') { b.x1 = this.evalExpr(stmt.x1); b.x2 = this.evalExpr(stmt.x2); b.dir = 1; }
            if (stmt.kind === 'flee') { b.target = stmt.target; if (stmt.within) b.within = this.evalExpr(stmt.within); }
            if (stmt.kind === 'patrol_points') { b.points = this.evalExpr(stmt.points) || []; b.idx = 0; }
            if (stmt.kind === 'shoot') {
              b.target = stmt.target;
              const secs = Number(this.evalExpr(stmt.every)) || 0;
              b.every = Math.max(1, Math.round(stmt.unit === 'seconds' ? secs * 60 : secs));
              b.cool = 0;
              if (!Array.isArray(m.shots)) m.shots = [];
            }
            if (stmt.through) b.through = true;
            b.speed = (speed != null) ? speed : (typeof m.speed === 'number' ? m.speed : (stmt.kind === 'shoot' ? 2 : 0.5));
            m.behavior = b;                       // visible & editable from fc code
          }
          if (!this.behaviorSubjects.includes(stmt.subject)) this.behaviorSubjects.push(stmt.subject);
          break;
        }

        case 'animate': {
          const v = this.getVar(stmt.subject);
          const items = Array.isArray(v) ? v : (v && typeof v === 'object' ? [v] : []);
          for (const m of items) m.animation = { frames: stmt.frames.slice(), every: stmt.every };
          if (!this.animSubjects.includes(stmt.subject)) this.animSubjects.push(stmt.subject);
          break;
        }

        case 'burst': {
          let x, y;
          if (stmt.ref) {
            const o = this.evalExpr(stmt.ref);
            if (!o || typeof o.x !== 'number') break;
            x = o.x + 4; y = o.y + 4;
          } else { x = this.evalExpr(stmt.x); y = this.evalExpr(stmt.y); }
          const n = Math.max(1, Math.min(64, this.evalExpr(stmt.count) | 0));
          const palette = stmt.color ? [this.colorOf(stmt.color)] : ['#ffec27', '#fff1e8', '#ffa300'];
          for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = 0.4 + Math.random() * 1.4;
            this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                                  life: 16 + (Math.random() * 18 | 0), color: palette[i % palette.length] });
          }
          if (this.particles.length > 400) this.particles.splice(0, this.particles.length - 400);
          break;
        }

        case 'emit': {
          const secs = Number(this.evalExpr(stmt.frames)) || 0;
          const frames = Math.max(0, Math.round(stmt.unit === 'seconds' ? secs * 60 : secs));
          if (frames > 0) {
            const color = this.colorOf(stmt.color);
            let ref = null, x = 0, y = 0;
            if (stmt.ref) ref = stmt.ref;
            else { x = this.evalExpr(stmt.x); y = this.evalExpr(stmt.y); }
            const rate = Math.max(1, Math.min(16, this.evalExpr(stmt.rate) | 0));
            this.emitters.push({ ref, x, y, color, marker: stmt.marker || '', rate, frames });
            if (this.emitters.length > 16) this.emitters.splice(0, this.emitters.length - 16);
          }
          break;
        }

        case 'tween': {
          const secs = Number(this.evalExpr(stmt.frames)) || 0;
          const frames = Math.max(1, Math.round(stmt.unit === 'seconds' ? secs * 60 : secs));
          const from = Number(this.evalExpr(stmt.from)) || 0;
          const to = Number(this.evalExpr(stmt.to)) || 0;
          const ease = ['in', 'out', 'in out', 'bounce'].includes(stmt.ease) ? stmt.ease : '';
          this.tweens = (this.tweens || []).filter(t => t.target !== stmt.target);   // a new tween replaces one on the same target
          this.tweens.push({ target: stmt.target, from, to, frames, tick: 0, ease });
          this.setVar(stmt.target, from);
          if (this.tweens.length > 16) this.tweens.splice(0, this.tweens.length - 16);
          break;
        }

        case 'inventory': { this.inventoryOf(stmt.subject); break; }

        case 'inv_add': {
          const inv = this.inventoryOf(stmt.subject);
          const item = this.evalExpr(stmt.item);
          if (!inv.some(x => x === item)) inv.push(item);   // one entry per distinct item
          break;
        }

        case 'inv_remove': {
          const inv = this.inventoryOf(stmt.subject);
          const item = this.evalExpr(stmt.item);
          const at = inv.findIndex(x => x === item);
          if (at >= 0) inv.splice(at, 1);
          break;
        }

        case 'when_talk': {
          if (!this.talkHandlers) this.talkHandlers = [];
          this.talkHandlers.push(stmt);
          break;
        }

        case 'dialog': {
          const text = this.interpolate(stmt.text || '');
          this.vars.dialog = text;                        // the game reads/clears this
          this.ui = this.ui || { text: '', box: { x: 2, y: 92 }, labels: [], choiceBox: { x: 6, y: 100 } };
          this.ui.text = text;
          this.ui.box = { x: stmt.x ? this.evalExpr(stmt.x) : 2, y: stmt.y ? this.evalExpr(stmt.y) : 92 };
          this.ui.labels = [];
          break;
        }

        case 'choice': {
          const labels = (stmt.labels || []).map(l => this.interpolate(l));
          this.ui = this.ui || { text: '', box: { x: 2, y: 92 }, labels: [], choiceBox: { x: 6, y: 100 } };
          this.ui.labels = labels;
          this.ui.choiceBox = { x: stmt.x ? this.evalExpr(stmt.x) : 6, y: stmt.y ? this.evalExpr(stmt.y) : 100 };
          if (!labels.includes(this.vars.choice)) this.vars.choice = '';   // drop a stale pick
          if (typeof this.vars.dialog !== 'string') this.vars.dialog = '';
          break;
        }

        case 'net_join':
          NET.join(stmt.game, stmt.room);
          this.vars.peers = NET.peers;   // live array, kept fresh by the relay
          break;

        case 'broadcast': {
          const data = this.evalExpr(stmt.value);
          if (data && typeof data === 'object') NET.broadcast(data);
          break;
        }

        case 'draw':
          this.execDraw(stmt);
          break;

        case 'write':
          this.execWrite(stmt);
          break;

        case 'pset': {
          const x = Math.floor(this.evalExpr(stmt.x));
          const y = Math.floor(this.evalExpr(stmt.y));
          ctx.fillStyle = this.colorOf(stmt.color);
          ctx.fillRect(x, y, 1, 1);
          break;
        }

        case 'say': {
          const text = this.interpolate(this.evalExpr(stmt.text));
          this.sayBuffer.push(text);
          break;
        }

        case 'probability': {
          if (Math.random() < stmt.prob) {
            execOne(stmt.stmt);
          }
          break;
        }

        case 'stop':
          this.stopped = true;
          break;

        case 'return':
          this._returnValue = stmt.value ? this.evalExpr(stmt.value) : null;
          this._returning = true;
          break;

        case 'call':
          this.execCall(stmt);
          break;

        default:
          break;
      }
    };

    // Modified execList to handle if/else chains
    const origExecList = execList;
    const smartExecList = (list) => {
      let lastIfResult = null;
      for (let i = 0; i < list.length; i++) {
        if (this.stopped || this._returning || ops > limit) return;
        ops++;
        const stmt = list[i];
        if (stmt && stmt.lineNum) this._line = stmt.lineNum;   // diagnostics point here

        // Debugger trace: record the line about to run + a snapshot of state
        // (bounded). Skip funcdefs (a `to X` line does nothing visible on its own).
        // Zero cost unless a debug run set this._trace.
        if (this._trace && this._trace.length < 6000 && stmt && stmt.lineNum && stmt.type !== 'funcdef') {
          this._trace.push({ line: stmt.lineNum, vars: this._snapshotVars() });
        }

        if (stmt.type === 'if') {
          lastIfResult = this.isTruthy(this.evalCondition(stmt.condition));
          if (lastIfResult) {
            if (stmt.thenStmt) execOne(stmt.thenStmt);
            if (stmt.body && stmt.body.length) execList(stmt.body);
          }
        } else if (stmt.type === 'else_if') {
          if (lastIfResult === false) {
            lastIfResult = this.isTruthy(this.evalCondition(stmt.condition));
            if (lastIfResult) {
              if (stmt.thenStmt) execOne(stmt.thenStmt);
              if (stmt.body && stmt.body.length) execList(stmt.body);
            }
          } else {
            // previous if was true, skip this
          }
        } else if (stmt.type === 'else') {
          if (lastIfResult === false) {
            if (stmt.thenStmt) execOne(stmt.thenStmt);
            if (stmt.body && stmt.body.length) execList(stmt.body);
          }
          lastIfResult = null;
        } else {
          lastIfResult = null;
          execOne(stmt);
        }
      }
    };

    smartExecList(stmts);
    // Consume any in-flight return so it doesn't leak to callers of exec
    this._returning = priorReturning;
  }

  // Compact, display-ready snapshot of variables for the step debugger. Values
  // are formatted to short strings (not deep-cloned) — cheap and safe per step.
  _fmtVal(v) {
    if (v == null) return String(v);
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : (Math.round(v * 100) / 100).toString();
    if (typeof v === 'string') return JSON.stringify(v);
    if (typeof v === 'boolean') return v ? 'yes' : 'no';
    if (Array.isArray(v)) return '[' + v.length + (v.length === 1 ? ' item]' : ' items]');
    if (typeof v === 'object') { try { const s = JSON.stringify(v); return s.length > 64 ? s.slice(0, 63) + '…' : s; } catch (_) { return '{…}'; } }
    return String(v);
  }
  _snapshotVars() {
    const out = {};
    for (const k in this.vars) {
      const v = this.vars[k];
      if (typeof v === 'function') continue;
      out[k] = this._fmtVal(v);
    }
    return out;
  }

  // Cycle `animate X with ...` frames using the global tick.
  applyAnimations() {
    for (const name of this.animSubjects || []) {
      const v = this.vars[name];
      const items = Array.isArray(v) ? v : (v && typeof v === 'object' ? [v] : []);
      for (const m of items) {
        const a = m.animation;
        if (!a || !a.frames || !a.frames.length) continue;
        m.image = a.frames[Math.floor((this.tick || 0) / (a.every || 10)) % a.frames.length];
      }
    }
    // Declarative form: a sprite that declares its own `frames` list (and optional
    // `fps`, default 8) cycles by itself — no `animate` statement needed. A sprite
    // driven by the verb keeps the verb's cadence (checked first, above).
    for (const name of Object.keys(this.vars)) {
      const v = this.vars[name];
      const items = Array.isArray(v) ? v : (v && typeof v === 'object' ? [v] : []);
      for (const m of items) {
        if (!m || typeof m !== 'object' || m.animation) continue;
        const frames = m.frames;
        if (!Array.isArray(frames) || !frames.length) continue;
        const fps = (typeof m.fps === 'number' && m.fps > 0) ? m.fps : 8;
        const every = Math.max(1, Math.round(60 / fps));
        m.image = frames[Math.floor((this.tick || 0) / every) % frames.length];
      }
    }
  }

  // Move, age and draw the particle pool (created by `burst`). Runs in the draw phase.
  // Sustained emitters (`emit … for N frames`): spawn `rate` particles per frame at
  // the emitter's current position (following REF), with the same random draw ORDER
  // as `burst` so both engines stay in lockstep.
  // Frame-counted property tweens (`tween ball.y from 0 to 100 over 1 second`): each
  // frame writes the eased value, and the tween retires once p reaches 1.
  applyTweens() {
    if (!this.tweens || !this.tweens.length) return;
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const t = this.tweens[i];
      const p = t.frames <= 0 ? 1 : Math.min(1, t.tick / t.frames);
      this.setVar(t.target, t.from + (t.to - t.from) * easeOf(t.ease, p));
      t.tick++;
      if (p >= 1) this.tweens.splice(i, 1);
    }
  }

  // Inventories are ordinary fc lists hanging off a subject (`player.inventory`), so
  // they show up in the inspector and can be read with `count of player.inventory`.
  inventoryOf(name) {
    const v = this.getVar(name);
    if (v && typeof v === 'object') {
      if (!Array.isArray(v.inventory)) v.inventory = [];
      return v.inventory;
    }
    const o = { inventory: [] };
    this.setVar(name, o);
    return o.inventory;
  }

  // `show dialog` — a message box (124x30) with the text wrapped to 29 chars/line
  // (the font is 4px per char) and up to 3 lines, mirroring the wasm's cmd emission.
  // `show choice` — one `show button`-shaped button per label, re-registered every
  // frame so the click dispatch can hit them; a click sets `choice` (see the frame
  // dispatch) and the game reads it.
  drawChoices(labels, x, y) {
    let cy = Math.floor(y);
    for (const label of labels) {
      this.drawButton({ label: String(label), x: { type: 'literal', value: Math.floor(x) }, y: { type: 'literal', value: cy }, choice: true, lineNum: 0 });
      cy += 13;
    }
  }

  drawDialog(text, x, y) {
    const bx = Math.floor(x), by = Math.floor(y);
    ctx.fillStyle = resolveColor('white');
    ctx.fillRect(bx, by, 124, 30);
    ctx.fillStyle = resolveColor('black');
    ctx.fillRect(bx + 1, by + 1, 122, 28);
    const lines = wrapDialogText(text, 29, 3);
    for (let i = 0; i < lines.length; i++) drawText(lines[i], bx + 4, by + 4 + i * 7, resolveColor('white'));
  }

  updateEmitters() {
    if (!this.emitters || !this.emitters.length) return;
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const e = this.emitters[i];
      let x = e.x, y = e.y;
      if (e.ref) {
        const o = this.getVar(e.ref);
        if (!o || typeof o.x !== 'number') { this.emitters.splice(i, 1); continue; }
        x = o.x + 4; y = o.y + 4;
      }
      const bias = e.marker === 'rising' ? -1 : (e.marker === 'falling' ? 1 : 0);
      for (let k = 0; k < e.rate; k++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 0.4 + Math.random() * 1.4;
        const vy = bias ? (bias * Math.abs(Math.sin(a) * sp)) + (bias * 0.3) : Math.sin(a) * sp;
        this.particles.push({ x, y, vx: Math.cos(a) * sp, vy,
                              life: 16 + (Math.random() * 18 | 0), color: e.color });
      }
      if (--e.frames <= 0) this.emitters.splice(i, 1);
    }
    if (this.particles.length > 400) this.particles.splice(0, this.particles.length - 400);
  }

  updateParticles() {
    if (!this.particles.length) return;
    const ox = this.camera.x, oy = this.camera.y;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx; p.y += p.vy;
      p.vx *= 0.96; p.vy *= 0.96;
      p.life--;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      ctx.fillStyle = p.color;
      const s = p.life > 10 ? 2 : 1;
      ctx.fillRect(Math.floor(p.x - ox), Math.floor(p.y - oy), s, s);
    }
  }

  // Apply chase / wander / patrol behaviors each frame (set once, runs forever).
  applyBehaviors() {
    for (const name of this.behaviorSubjects || []) {
      const v = this.vars[name];
      const items = Array.isArray(v) ? v : (v && typeof v === 'object' ? [v] : []);
      for (const m of items) {
        const b = m.behavior;
        if (!b || typeof m.x !== 'number' || typeof m.y !== 'number') continue;
        const spd = (typeof b.speed === 'number') ? b.speed : 0.5;
        let vx = 0, vy = 0;
        if (b.kind === 'chase') {
          const t = this.vars[b.target];
          if (!t || typeof t.x !== 'number') continue;
          const dx = t.x - m.x, dy = t.y - m.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          if (len < 1) continue;
          vx = dx / len * spd; vy = dy / len * spd;
        } else if (b.kind === 'wander') {
          if ((!b.vx && !b.vy) || Math.random() < 0.02) {
            const a = Math.random() * Math.PI * 2;
            b.vx = Math.cos(a); b.vy = Math.sin(a);
          }
          vx = b.vx * spd; vy = b.vy * spd;
        } else if (b.kind === 'flee') {
          const t = this.vars[b.target];
          if (!t || typeof t.x !== 'number') continue;
          const dx = m.x - t.x, dy = m.y - t.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          if (len < 1) continue;
          if (b.within > 0 && len > b.within) continue;      // out of range: hold still
          vx = dx / len * spd; vy = dy / len * spd;
        } else if (b.kind === 'patrol_points') {
          const pts = Array.isArray(b.points) ? b.points : [];
          if (!pts.length) continue;
          if (typeof b.idx !== 'number') b.idx = 0;
          const pt = pts[b.idx % pts.length];
          if (!pt || typeof pt.x !== 'number') { b.idx = (b.idx + 1) % pts.length; continue; }
          const dx = pt.x - m.x, dy = pt.y - m.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          if (len < spd) { b.idx = (b.idx + 1) % pts.length; }
          else { vx = dx / len * spd; vy = dy / len * spd; }
        } else if (b.kind === 'shoot') {
          const t = this.vars[b.target];
          const shots = Array.isArray(m.shots) ? m.shots : (m.shots = []);
          // shots fly straight and are culled once they leave the world, so the list
          // cannot grow without bound
          for (let i = shots.length - 1; i >= 0; i--) {
            const sh = shots[i];
            sh.x += sh.dx; sh.y += sh.dy;
            if (sh.x < -8 || sh.y < -8 || sh.x > this.world.width + 8 || sh.y > this.world.height + 8) shots.splice(i, 1);
          }
          b.cool = (b.cool || 0) - 1;
          if (b.cool <= 0) {
            if (t && typeof t.x === 'number') {
              const sx = m.x + 4, sy = m.y + 4;
              const dx0 = (t.x + 4) - sx, dy0 = (t.y + 4) - sy;
              const len = Math.sqrt(dx0 * dx0 + dy0 * dy0) || 1;
              shots.push({ x: sx, y: sy, dx: dx0 / len * spd, dy: dy0 / len * spd });
            }
            b.cool = b.every || 60;
          }
        } else if (b.kind === 'patrol') {
          const lo = Math.min(b.x1, b.x2), hi = Math.max(b.x1, b.x2);
          if (!b.dir) b.dir = 1;
          if (m.x <= lo) b.dir = 1;
          if (m.x >= hi) b.dir = -1;
          vx = b.dir * spd;
        }
        // move with map-solid slide (axis at a time), then clamp to the world
        const nx = m.x + vx, ny = m.y + vy;
        if (b.through) { m.x = nx; m.y = ny; }
        else if (!this.mapSolidBox(nx, ny)) { m.x = nx; m.y = ny; }
        else if (!this.mapSolidBox(nx, m.y)) { m.x = nx; if (b.kind === 'wander') b.vy = -b.vy; }
        else if (!this.mapSolidBox(m.x, ny)) { m.y = ny; if (b.kind === 'wander') b.vx = -b.vx; }
        else if (b.kind === 'wander') { b.vx = -b.vx; b.vy = -b.vy; }
        if (m.x < 0) m.x = 0;
        if (m.y < 0) m.y = 0;
        const mx = this.world.width - 8, my = this.world.height - 8;
        if (m.x > mx) { m.x = mx; if (b.vx) b.vx = -b.vx; if (b.dir) b.dir = -1; }
        if (m.y > my) { m.y = my; if (b.vy) b.vy = -b.vy; }
      }
    }
  }

  // True if the 8x8 box at (x, y) overlaps any solid map tile.
  mapSolidBox(x, y) {
    if (!this.map) return false;
    const rows = this.map.rows;
    const r0 = Math.max(0, Math.floor(y / 8)), r1 = Math.min(rows.length - 1, Math.floor((y + 7) / 8));
    const c0 = Math.max(0, Math.floor(x / 8));
    for (let r = r0; r <= r1; r++) {
      const row = rows[r];
      const c1 = Math.min(row.length - 1, Math.floor((x + 7) / 8));
      for (let c = c0; c <= c1; c++) {
        const def = this.tileDefs[row[c]];
        if (def && def.solid) return true;
      }
    }
    return false;
  }

  execDraw(stmt) {
    const a = stmt.args;
    // Camera offset: world-space draws subtract camera, HUD draws don't
    const ox = stmt.hud ? 0 : this.camera.x;
    const oy = stmt.hud ? 0 : this.camera.y;
    const x = (a.x ? this.evalExpr(a.x) : 0) - ox;
    const y = (a.y ? this.evalExpr(a.y) : 0) - oy;
    const color = this.colorOf(a.color);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;

    switch (stmt.shape) {
      case 'circle': {
        const r = a.w ? this.evalExpr(a.w) : 4;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'rect': {
        const w = a.w ? this.evalExpr(a.w) : 8;
        const h = a.h ? this.evalExpr(a.h) : w;
        ctx.fillRect(x, y, w, h);
        break;
      }
      case 'line': {
        const x1 = (a.x1 ? this.evalExpr(a.x1) : 0) - ox;
        const y1 = (a.y1 ? this.evalExpr(a.y1) : 0) - oy;
        const x2 = (a.x2 ? this.evalExpr(a.x2) : 0) - ox;
        const y2 = (a.y2 ? this.evalExpr(a.y2) : 0) - oy;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        break;
      }
      case 'sprite': {
        // draw sprite "name" at x, y
        let name = a.spriteName;
        let bounceY = 0;
        if (!name && a.spriteNameExpr) {
          const resolved = this.evalExpr(a.spriteNameExpr);
          if (typeof resolved === 'string') {
            name = resolved.toLowerCase().replace(/\s+/g, '_');
          } else if (resolved && typeof resolved === 'object' && resolved.image) {
            // Sprite object: try <image>_<facing> first, fall back to <image>
            const base = String(resolved.image).toLowerCase().replace(/\s+/g, '_');
            const facing = resolved.facing;
            if (facing) {
              const variant = base + '_' + facing;
              name = (USER_SPRITES[variant] || SPRITES[variant]) ? variant : base;
            } else {
              name = base;
            }
            // Walking bounce: 1px up on alternating ~12-frame phases
            // (matches the ~5Hz cadence the research recommended)
            if (resolved.walking) {
              const phase = Math.floor((this.tick || 0) / 12) % 2;
              if (phase === 1) bounceY = -1;
            }
          }
        }
        name = name || '';
        if (name && !SPRITES[name] && !USER_SPRITES[name]) {
          this.error('no sprite called ' + name + ' — if you meant a function, write ' + name + ' on its own line');
        }
        drawSprite(name, x, y + bounceY);
        break;
      }
      default: {
        // `draw title` (the generic-noun form): a function of that name wins (design
        // decisions, Q2); with no function, a sprite of that name is drawn; with
        // neither it is a mistake worth naming on the line.
        const noun = stmt.shape;
        if (noun && this.funcs[noun]) {
          if (a.x || a.y) this.error('"' + noun + '" is a function, so draw ignores the position — write ' + noun + ' on its own line to call it');
          this.callFunc(noun);
        } else if (noun && (SPRITES[noun] || USER_SPRITES[noun])) {
          drawSprite(noun, x, y);
        } else if (noun) {
          this.error('no sprite called ' + noun + ' — if you meant a function, write ' + noun + ' on its own line');
        }
        break;
      }
    }
  }

  drawButton(stmt) {
    // Buttons are always screen-space (HUD)
    const x = Math.floor(this.evalExpr(stmt.x));
    const y = Math.floor(this.evalExpr(stmt.y));
    const label = String(stmt.label || '');
    const w = label.length * 4 + 8;
    const h = 11;
    // record for click hit-testing
    // `choice: true` (from `show choice`) makes a click record the pick in `choice`
    this.buttons.push(stmt.choice ? { label: label.toLowerCase(), x, y, w, h, choice: true } : { label: label.toLowerCase(), x, y, w, h });
    // background
    ctx.fillStyle = '#29adff';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#1d2b53';
    ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    // label
    drawText(label, x + 4, y + 3, '#fff1e8');
  }

  drawMeter(stmt) {
    // Meters are always screen-space (HUD)
    const cur = this.evalExpr(stmt.current);
    const max = this.evalExpr(stmt.max) || 1;
    const x = Math.floor(this.evalExpr(stmt.x));
    const y = Math.floor(this.evalExpr(stmt.y));
    const w = Math.max(3, Math.floor(this.evalExpr(stmt.w)));
    const h = Math.max(3, Math.floor(this.evalExpr(stmt.h)));
    const frac = Math.max(0, Math.min(1, cur / max));
    // outer border (black)
    ctx.fillStyle = '#000000';
    ctx.fillRect(x, y, w, h);
    // empty track (dark gray)
    ctx.fillStyle = '#5f574f';
    ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    // filled portion
    const fillW = Math.round((w - 2) * frac);
    if (fillW > 0) {
      ctx.fillStyle = this.colorOf(stmt.color);
      ctx.fillRect(x + 1, y + 1, fillW, h - 2);
    }
    // percent text, centered, only if the bar is big enough to fit it
    if (w >= 18 && h >= 5) {
      const pct = Math.round(frac * 100) + '%';
      const textW = pct.length * 4 - 1; // 3px glyph + 1px gap, minus trailing gap
      const tx = x + Math.max(1, Math.floor((w - textW) / 2));
      const ty = y + Math.floor((h - 5) / 2);
      drawText(pct, tx, ty, '#fff1e8');
    }
  }

  execWrite(stmt) {
    const text = this.interpolate(this.evalExpr(stmt.text));
    const ox = stmt.hud ? 0 : this.camera.x;
    const oy = stmt.hud ? 0 : this.camera.y;
    const x = this.evalExpr(stmt.x) - ox;
    const y = this.evalExpr(stmt.y) - oy;
    const color = this.colorOf(stmt.color);
    drawText(text, x, y, color);
  }

  execCall(stmt) {
    const func = this.funcs[stmt.name];
    if (func) {
      // bind call args -> params positionally (fc is all-global, so params
      // are ordinary globals). Evaluate args in the caller's scope first.
      const params = func.params || [];
      const argExprs = stmt.argExprs || [];
      for (let i = 0; i < params.length; i++) {
        if (i < argExprs.length && argExprs[i] != null) this.setVar(params[i], this.evalExpr(argExprs[i]));
      }
      const savedStop = this.stopped;
      this.stopped = false;
      this.exec(func.body);
      const ret = this._returnValue;
      this._returnValue = undefined;
      this.stopped = savedStop;
      return ret;
    }
  }

  callFunc(name) {
    const func = this.funcs[name];
    if (func) {
      const savedStop = this.stopped;
      this.stopped = false;
      this.exec(func.body);
      this._returnValue = undefined;
      this.stopped = savedStop;
    }
  }

  startGameLoop(funcNames) {
    this.gameLoop = true;
    const self = this;
    function frame() {
      if (self.stopped) return;
      // expose live multiplayer state to fc programs each frame
      self.vars.peers = NET.peers;
      self.vars.connected = NET.connected();
      // optional match timer: tick down once/frame, expose `timer` (whole seconds
      // left), fire `when time runs out` once at zero. No limit set -> no-op.
      if (typeof self.timeLimitFrames === 'number') {
        if (self.timeLeftFrames > 0) self.timeLeftFrames--;
        self.vars.timer = Math.max(0, Math.ceil(self.timeLeftFrames / 60));
        if (self.timeLeftFrames <= 0 && !self.timeoutFired) {
          self.timeoutFired = true;
          const h = self.eventHandlers.timeout;
          if (h) { if (h.thenStmt) self.exec([h.thenStmt]); if (h.body && h.body.length) self.exec(h.body); }
        }
      }
      // Process "when key" event handlers
      for (const [key, handler] of Object.entries(self.eventHandlers.key)) {
        if (self.keyState[key]) {
          if (handler.thenStmt) self.exec([handler.thenStmt]);
          if (handler.body && handler.body.length) self.exec(handler.body);
        }
      }

      // Dispatch button clicks (if any click pending and hits a button's box)
      if (self.mouseState.clicked) {
        for (const btn of self.buttons) {
          if (self.mouseState.x >= btn.x && self.mouseState.x < btn.x + btn.w &&
              self.mouseState.y >= btn.y && self.mouseState.y < btn.y + btn.h) {
            if (btn.choice) self.vars.choice = btn.label;   // `show choice` reads this
            const h = self.buttonHandlers[btn.label];
            if (h) {
              if (h.thenStmt) self.exec([h.thenStmt]);
              if (h.body && h.body.length) self.exec(h.body);
            }
            break;
          }
        }
      }

      // Process mouse events (after button check so generic mouse doesn't eat clicks)
      if (self.mouseState.clicked && self.eventHandlers.mouse['clicked']) {
        const h = self.eventHandlers.mouse['clicked'];
        self.vars['mouse'] = { x: self.mouseState.x, y: self.mouseState.y };
        if (h.thenStmt) self.exec([h.thenStmt]);
        if (h.body && h.body.length) self.exec(h.body);
      }
      if (self.mouseState.down && self.eventHandlers.mouse['down']) {
        const h = self.eventHandlers.mouse['down'];
        self.vars['mouse'] = { x: self.mouseState.x, y: self.mouseState.y };
        if (h.thenStmt) self.exec([h.thenStmt]);
        if (h.body && h.body.length) self.exec(h.body);
      }
      self.mouseState.clicked = false;

      // `when player talks to "X"` — edge-triggered on the TALK key while the player
      // overlaps a sprite carrying tag X (the game decides what talking means).
      {
        const talkKey = !!(self.keyState.space || self.keyState.enter);
        if (talkKey && !self._talkPrev) {
          const player = self.vars.player;
          if (player && typeof player.x === 'number') {
            for (const h of (self.talkHandlers || [])) {
              // the string is a TAG (`wizard are talkers`) or, failing that, the
              // sprite's own name — so `talks to "wizard"` works either way
              let subjects = (self.tags && self.tags[h.tag]) || [];
              if (!subjects.length) subjects = [h.tag];
              const near = subjects.some(n => {
                const o = self.vars[n];
                return o && typeof o.x === 'number' && Math.abs(o.x - player.x) < 8 && Math.abs(o.y - player.y) < 8;
              });
              if (near) { if (h.thenStmt) self.exec([h.thenStmt]); if (h.body && h.body.length) self.exec(h.body); }
            }
          }
        }
        self._talkPrev = talkKey;
      }

      // Tick counter for animation timing
      self.tick = (self.tick || 0) + 1;

      // Save player's previous position for collision rollback
      const player = self.vars.player;
      if (player && typeof player.x === 'number') {
        self._prevPositions.player = { x: player.x, y: player.y };
      }

      // Run update function first (movement, input)
      if (funcNames.length > 0) {
        // `to update <mode>` replaces the bare update while `mode` is that mode; the
        // bare update keeps its meaning for every other mode (design decisions, Q5).
        const modeNow = self.vars.mode;
        const modeFn = (typeof modeNow === 'string' && modeNow) ? ('update_' + modeNow) : '';
        if (modeFn && self.funcs[modeFn]) self.callFunc(modeFn);
        else self.callFunc(funcNames[0]);
      }

      // Auto-move any sprite with walking: yes (player + future NPCs)
      // Walks until: solid collision, world edge, or stop_walking
      self._autoWalk();

      // Built-in enemy behaviors (ghosts chase player · bats wander · guard patrols)
      self.applyBehaviors();
      // Frame-swap any `animate X with ...` subjects
      self.applyAnimations();
      self.applyTweens();

      // Gravity: if the user set a positive `gravity`, the player accelerates
      // downward each frame (dy builds up, then moves y). `jump player` sets a
      // negative dy. Defaults off (gravity 0) so non-platformers are unaffected.
      {
        const gp = self.vars.player;
        const g = self.getVar('gravity');
        if (typeof g === 'number' && g > 0 && gp && typeof gp.y === 'number') {
          gp.dy = (typeof gp.dy === 'number' ? gp.dy : 0) + g;
          gp.y = gp.y + gp.dy;
        }
      }

      // Clamp player to world edges (8px sprite, world is the map bounds)
      const p = self.vars.player;
      if (p && typeof p.x === 'number') {
        const maxX = self.world.width - 8;
        const maxY = self.world.height - 8;
        if (p.x < 0) { p.x = 0; if (p.walking) p.walking = false; }
        if (p.y < 0) { p.y = 0; p.dy = 0; if (p.walking) p.walking = false; }
        if (p.x > maxX) { p.x = maxX; if (p.walking) p.walking = false; }
        if (p.y > maxY) { p.y = maxY; p.dy = 0; if (p.walking) p.walking = false; }
      }

      // Check collisions after movement
      self.checkCollisions();

      // Update camera (follow target, clamp to world)
      if (self.followTarget) {
        const t = self.vars[self.followTarget];
        if (t && typeof t.x === 'number') {
          self.camera.x = Math.max(0, Math.min(self.world.width - 128, t.x - 64));
          self.camera.y = Math.max(0, Math.min(self.world.height - 128, t.y - 64));
        }
      }

      // Reset button hitbox list before draw populates it
      self.buttons = [];

      // Run remaining functions (draw, hud, etc)
      for (let i = 1; i < funcNames.length; i++) {
        self.callFunc(funcNames[i]);
      }

      // Particles draw on top of the game layer
      self.updateEmitters();
      self.updateParticles();

      // Auto-dispatch to a screen function matching current mode
      const mode = self.vars.mode;
      if (mode && self.funcs['screen_' + mode]) {
        self.callFunc('screen_' + mode);
      } else if (mode && self._screenTarget === mode) {
        // `go to win` with no `to screen win`: say so on the canvas, and once in the
        // diagnostics, instead of rendering nothing (design decisions, Q6).
        // a navigation has no line of its own in the wasm AST, so this notice carries
        // no line either — the two engines must say exactly the same thing
        const lineWas = self._line; self._line = 0;
        self.error('no screen called ' + mode + ' \u2014 add "to screen ' + mode + '"');
        self._line = lineWas;
        drawText('NO SCREEN: ' + mode, 20, 58, '#ffec27');
        drawText('define "to screen ' + mode + '"', 12, 68, '#fff1e8');
      }

      // Timed presentation effects — the page renders these (`FX.flash` paints the
      // screen, `FX.shake` jitters it), and both skip them under reduced motion.
      // Counted in frames, so the timing is identical in both engines.
      // Built-in dialog UI: the engine draws it every frame while the conversation is
      // active (a dialog shows, or choices are up), so a handler can set it up once;
      // the game ends it by clearing `dialog`.
      {
        const hasText = typeof self.vars.dialog === 'string' && self.vars.dialog !== '';
        const active = !!(self.ui && (hasText || self.ui.labels.length));
        if (active) {
          if (hasText) self.drawDialog(self.vars.dialog, self.ui.box.x, self.ui.box.y);
          if (self.ui.labels.length) self.drawChoices(self.ui.labels, self.ui.choiceBox.x, self.ui.choiceBox.y);
        } else if (self.ui) {
          self.ui = null;
          if (self.vars.choice) self.vars.choice = '';
        }
      }

      if (self.flashFrames > 0) { FX.flash(self.flashColor || 'white'); self.flashFrames--; }
      if (self.shakeFrames > 0) { FX.shake(self.shakeMag || 0); self.shakeFrames--; }
    }
    // Track when a frame last ran, regardless of which driver ran it.
    let lastFrame = performance.now();
    function runFrame() {
      lastFrame = performance.now();
      frame();
      // the host shows whatever the engine just reported (no-op in the headless
      // oracle, where fcPumpDiagnostics does not exist)
      if (typeof fcPumpDiagnostics === 'function') fcPumpDiagnostics();
    }

    // Draw one frame immediately so canvas isn't blank
    runFrame();

    // Primary loop: requestAnimationFrame, vsync-locked => smooth motion.
    function rafTick() {
      if (self.stopped) return;
      runFrame();
      self._rafId = requestAnimationFrame(rafTick);
    }
    self._rafId = requestAnimationFrame(rafTick);

    // Watchdog: some environments (headless / background tabs) never fire
    // rAF. If no frame has run in >32ms (2 missed vsync intervals), drive
    // the loop from setInterval. When rAF is healthy this does nothing.
    self._watchdog = setInterval(function () {
      if (self.stopped) return;
      if (performance.now() - lastFrame > 32) runFrame();
    }, 1000 / 60);
  }

  _autoWalk() {
    // Move every sprite that has walking: true by its dx, dy * speed.
    // Walks the player and any other top-level sprite (e.g. NPCs).
    const speed = (this.vars.speed && typeof this.vars.speed === 'number') ? this.vars.speed : 1;
    const player = this.vars.player;
    if (player && player.walking && typeof player.dx === 'number' && typeof player.dy === 'number') {
      const sp = typeof player.speed === 'number' ? player.speed : speed;
      player.x += player.dx * sp;
      player.y += player.dy * sp;
    }
  }

  _collectAllSprites() {
    // Gather every {x, y} object currently in vars (including list items)
    const sprites = [];
    const walk = (val) => {
      if (!val || typeof val !== 'object') return;
      if (Array.isArray(val)) { for (const item of val) walk(item); return; }
      if (typeof val.x === 'number' && typeof val.y === 'number') sprites.push(val);
    };
    for (const v of Object.values(this.vars)) walk(v);
    return sprites;
  }

  _findEmptySpot(existing) {
    const SIZE = 12; // min center-to-center distance (8px sprites + 4px gap)
    const maxW = Math.max(16, this.world.width - 16);
    const maxH = Math.max(16, this.world.height - 16);
    for (let attempt = 0; attempt < 80; attempt++) {
      const x = 4 + Math.floor(Math.random() * maxW);
      const y = 4 + Math.floor(Math.random() * maxH);
      let ok = true;
      for (const other of existing) {
        if (Math.abs(x - other.x) < SIZE && Math.abs(y - other.y) < SIZE) { ok = false; break; }
      }
      if (ok) return { x, y };
    }
    // Fallback: random without avoidance
    return { x: 4 + Math.floor(Math.random() * maxW), y: 4 + Math.floor(Math.random() * maxH) };
  }

  checkCollisions() {
    const player = this.vars.player;
    if (!player || typeof player.x !== 'number') return;
    const SIZE = 8;
    const overlaps = (a, b) => Math.abs(a.x - b.x) < SIZE && Math.abs(a.y - b.y) < SIZE;

    // 1. Solid: per-axis collision so the player slides along walls instead
    //    of stopping completely on a diagonal collision.
    //    First test x-only restore; then y-only restore.
    const prev = this._prevPositions.player;
    const overlapsAnySolid = (px, py) => {
      const probe = { x: px, y: py };
      for (const listName of this.tags.solid || []) {
        const list = this.vars[listName];
        if (!Array.isArray(list)) continue;
        for (const item of list) {
          if (item && typeof item.x === 'number' && overlaps(probe, item)) {
            return { item, listName };
          }
        }
      }
      if (this.mapSolidBox(px, py)) return { item: this.map, listName: 'map' };
      return null;
    };
    let solidHit = null;
    if (prev) {
      // Test current position against solids; if collision, try restoring axes one at a time
      const hit = overlapsAnySolid(player.x, player.y);
      if (hit) {
        solidHit = hit;
        // Try keeping new x, restoring y
        if (!overlapsAnySolid(player.x, prev.y)) {
          player.y = prev.y;
        } else if (!overlapsAnySolid(prev.x, player.y)) {
          // Try keeping new y, restoring x
          player.x = prev.x;
        } else {
          // Both axes blocked, restore both
          player.x = prev.x;
          player.y = prev.y;
        }
        // Auto-stop walking flag (used by walk verb / auto-walk pattern)
        if (player.walking) player.walking = false;
      }
    }
    // Fire hit handler if a solid was hit (regardless of which axis was restored)
    if (solidHit) {
      const singular = singularize(solidHit.listName);
      const hh = this.hitHandlers[singular];
      if (hh) {
        this.vars[singular] = solidHit.item;
        if (hh.thenStmt) this.exec([hh.thenStmt]);
        if (hh.body && hh.body.length) this.exec(hh.body);
      }
    }

    // 2. Pickups: remove item + fire handler
    for (const listName of this.tags.pickups || []) {
      const list = this.vars[listName];
      if (!Array.isArray(list)) continue;
      for (let i = list.length - 1; i >= 0; i--) {
        const item = list[i];
        if (item && typeof item.x === 'number' && overlaps(player, item)) {
          list.splice(i, 1);
          const singular = singularize(listName);
          const ph = this.pickupHandlers[singular];
          if (ph) {
            this.vars[singular] = item;
            if (ph.thenStmt) this.exec([ph.thenStmt]);
            if (ph.body && ph.body.length) this.exec(ph.body);
          }
        }
      }
    }

    // 3. Hostile: fire hit handler (user handles consequences)
    for (const listName of this.tags.hostile || []) {
      const list = this.vars[listName];
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        if (item && typeof item.x === 'number' && overlaps(player, item)) {
          const singular = singularize(listName);
          const hh = this.hitHandlers[singular];
          if (hh) {
            this.vars[singular] = item;
            if (hh.thenStmt) this.exec([hh.thenStmt]);
            if (hh.body && hh.body.length) this.exec(hh.body);
          }
          break;
        }
      }
    }

    // 4. Deadly: auto-damage + fire handler
    for (const listName of this.tags.deadly || []) {
      const list = this.vars[listName];
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        if (item && typeof item.x === 'number' && overlaps(player, item)) {
          if (typeof player.hp === 'number') player.hp -= 1;
          const singular = singularize(listName);
          const hh = this.hitHandlers[singular];
          if (hh) {
            this.vars[singular] = item;
            if (hh.thenStmt) this.exec([hh.thenStmt]);
            if (hh.body && hh.body.length) this.exec(hh.body);
          }
          break;
        }
      }
    }

    // 5. Projectiles: move bullets, then test against solids and hostiles
    for (const listName of this.tags.projectiles || []) {
      const bullets = this.vars[listName];
      if (!Array.isArray(bullets)) continue;
      // Iterate backwards so we can splice safely
      for (let bi = bullets.length - 1; bi >= 0; bi--) {
        const bullet = bullets[bi];
        if (!bullet || typeof bullet.x !== 'number') continue;
        // Move the bullet by its direction vector × speed (default 2)
        const sp = typeof bullet.speed === 'number' ? bullet.speed : 2;
        if (typeof bullet.dx === 'number') bullet.x += bullet.dx * sp;
        if (typeof bullet.dy === 'number') bullet.y += bullet.dy * sp;
        // Off-world? Despawn
        if (bullet.x < -8 || bullet.x > this.world.width + 8 ||
            bullet.y < -8 || bullet.y > this.world.height + 8) {
          bullets.splice(bi, 1);
          continue;
        }
        // Hit solid? Stop the bullet (no damage to solids)
        let consumed = false;
        for (const solidName of this.tags.solid || []) {
          const solids = this.vars[solidName];
          if (!Array.isArray(solids)) continue;
          for (const solid of solids) {
            if (solid && typeof solid.x === 'number' && overlaps(bullet, solid)) {
              bullets.splice(bi, 1);
              consumed = true;
              break;
            }
          }
          if (consumed) break;
        }
        if (consumed) continue;
        // Hit hostile? Damage them (and despawn bullet)
        for (const hostileName of this.tags.hostile || []) {
          const hostiles = this.vars[hostileName];
          if (!Array.isArray(hostiles)) continue;
          for (let hi = hostiles.length - 1; hi >= 0; hi--) {
            const enemy = hostiles[hi];
            if (enemy && typeof enemy.x === 'number' && overlaps(bullet, enemy)) {
              if (typeof enemy.hp !== 'number') enemy.hp = 1;
              enemy.hp -= 1;
              if (enemy.hp <= 0) {
                hostiles.splice(hi, 1);
                // Fire the "when X is defeated" handler with the slain enemy bound
                const singular = singularize(hostileName);
                const dh = this.defeatHandlers[singular];
                if (dh) {
                  this.vars[singular] = enemy;
                  if (dh.thenStmt) this.exec([dh.thenStmt]);
                  if (dh.body && dh.body.length) this.exec(dh.body);
                }
              }
              bullets.splice(bi, 1);
              consumed = true;
              break;
            }
          }
          if (consumed) break;
        }
      }
    }
  }

  // Process key state for "when" handlers (non-game-loop mode)
  processKeyPress(key) {
    const handler = this.eventHandlers.key[key.toLowerCase()];
    if (handler) {
      if (handler.thenStmt) this.exec([handler.thenStmt]);
      if (handler.body && handler.body.length) this.exec(handler.body);
    }
    for (const h of this.eventHandlers.key_in) {
      if (h.keys.includes(key)) {
        this.vars['key'] = key;
        if (h.thenStmt) this.exec([h.thenStmt]);
        if (h.body && h.body.length) this.exec(h.body);
      }
    }
  }

  processMouseClick(x, y) {
    this.vars['mouse'] = { x, y };
    const handler = this.eventHandlers.mouse['clicked'];
    if (handler) {
      if (handler.thenStmt) this.exec([handler.thenStmt]);
      if (handler.body && handler.body.length) this.exec(handler.body);
    }
  }
}

// ============================================================
// MAIN CONTROLLER
// ============================================================
let runtime = new Runtime();
let debounceTimer = null;


export { parse, Runtime, tokenizeLine, singularize, resolveColor };
