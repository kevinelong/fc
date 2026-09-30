// fc -> Python / JavaScript transpiler (READ-ONLY, illustrative).
//
// Turns the fc AST (the exact same tree `parse()` produces for the engine) into
// clean, idiomatic Python or JavaScript so a learner can SEE the shape of their
// plain-English program in a mainstream language. It is a *teaching mirror*, not
// a runnable export: fantasy-console verbs (draw, play sound, when key ...) are
// rendered as readable helper calls (`draw_rect(...)`, `play_sound(...)`), since
// a faithful runnable port would need the whole console engine.
//
// Source of truth. An identical copy of the region between the FC-TRANSPILE
// sentinels is inlined into index.html; `transpile-embed-check.mjs` asserts the
// two stay byte-identical. Golden output is pinned by `dump-transpile.mjs` +
// `transpile-diff.mjs` across the corpus + examples.

// <FC-TRANSPILE-BEGIN> keep byte-identical with the copy inlined in index.html
function fcTranspile(program, lang) {
  const d = fcTpDialect(['js', 'lua', 'gdscript'].includes(lang) ? lang : 'python');
  const ctx = { d, lists: fcTpCollectLists(program, new Set()), strings: fcTpCollectStrings(program, new Set()), vars: fcTpCollectVars(program, new Set()), funcs: fcTpCollectFuncs(program, new Set()), declared: new Set() };
  const out = [];
  out.push(d.c + ' Illustrative ' + d.name + ' translation of your fc program.');
  out.push(d.c + " Read-only — shows the shape. draw_*/play_sound/etc. are");
  out.push(d.c + ' fantasy-console calls (fc has a built-in game engine).');
  out.push('');
  fcTpEmit(program || [], 0, ctx, out);
  // collapse 3+ blank lines to at most one
  const lines = [];
  for (const ln of out) {
    if (ln === '' && lines.length && lines[lines.length - 1] === '') continue;
    lines.push(ln);
  }
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n') + '\n';
}

// `{var}` interpolation for dialects without native interpolation: Lua joins with
// `..`, GDScript with `+` and `str(...)`.
function fcTpConcatInterp(str, toStr) {
  const parts = String(str).split(/(\{[^}]+\})/).filter(x => x.length);
  if (!parts.length) return JSON.stringify(String(str));
  return parts.map(seg => {
    const m = seg.match(/^\{([^}]+)\}$/);
    if (m) return toStr ? (toStr + '(' + m[1].trim() + ')') : m[1].trim();
    return JSON.stringify(seg);
  }).join(' + ');
}
function fcTpLuaInterp(str) {
  const parts = String(str).split(/(\{[^}]+\})/).filter(x => x.length);
  if (!parts.length) return JSON.stringify(String(str));
  return parts.map(seg => {
    const m = seg.match(/^\{([^}]+)\}$/);
    if (m) return 'tostring(' + m[1].trim() + ')';
    return JSON.stringify(seg);
  }).join(' .. ');
}

function fcTpDialect(lang) {
  // `style` decides how blocks are delimited: 'indent' (Python/GDScript), 'brace'
  // (JS) or 'end' (Lua). Every helper returns a HEAD without its delimiter so
  // fcTpBlock can append the right one (`:`, ` {`, or nothing) — which keeps the
  // statement emitters language-agnostic.
  const D = {};
  if (lang === 'js') {
    Object.assign(D, {
      name: 'JavaScript', lang: 'js', style: 'brace', c: '//', unit: '  ', semi: ';',
      TRUE: 'true', FALSE: 'false', NULL: 'null',
      AND: '&&', OR: '||', NOT: '!', EQ: '===', NEQ: '!==',
    });
    D.ifHead = c => 'if (' + c + ')';
    D.elifHead = c => 'else if (' + c + ')';
    D.whileHead = c => 'while (' + c + ')';
    D.foreverHead = () => 'while (true)';
    D.notCond = c => '!(' + c + ')';
    D.countHead = n => 'for (let _i = 0; _i < ' + n + '; _i++)';
    D.rangeHead = (v, a, b) => 'for (let ' + v + ' = ' + a + '; ' + v + ' <= ' + b + '; ' + v + '++)';
    D.eachHead = (v, l) => 'for (const ' + v + ' of ' + l + ')';
    D.funcHead = (n, pr) => 'function ' + n + '(' + pr + ')';
    D.print = e => 'console.log(' + e + ')';
    D.randomBelow = 'Math.random()';
    D.clearList = t => t + '.length = 0';
    D.halveStmt = t => t + ' = Math.floor(' + t + ' / 2)';
    D.between = (v, lo, hi) => [v + ' >= ' + lo + ' && ' + v + ' <= ' + hi, 15];
    D.inList = (v, l) => [l + '.includes(' + v + ')', 100];
    D.hasItem = (a, b) => [a + '.includes(' + b + ')', 100];
    D.randomInclusive = m => 'Math.floor(Math.random() * (' + m + ' + 1))';
    D.countOf = x => x + '.length';
    D.itemAt = (l, i) => l + '[' + i + ']';
    D.listLit = items => '[' + items.join(', ') + ']';
    D.objEntry = (k, e) => k + ': ' + e;
    D.spritesOf = (n, one) => 'Array.from({length: ' + n + '}, () => ' + one + ')';
    D.fallbackType = t => 'null /* ' + t + ' */';
    D.interp = str => '`' + str.replace(/`/g, '\\`').replace(/\{([^}]+)\}/g, '${$1}') + '`';
    D.rval = parts => parts.join('.');
    D.arrPush = (l, v) => l + '.push(' + v + ')';
    D.arrRemove = (l, v) => l + '.splice(' + l + '.indexOf(' + v + '), 1)';
    D.addStmt = (t, v, isList) => isList ? (t + '.push(' + v + ')') : (t + ' += ' + v);
    D.removeStmt = (t, v, isList) => isList ? (t + '.splice(' + t + '.indexOf(' + v + '), 1)') : (t + ' -= ' + v);
    D.declare = true;
    return D;
  }
  if (lang === 'lua') {
    Object.assign(D, {
      name: 'Lua', lang: 'lua', style: 'end', c: '--', unit: '  ', semi: '',
      TRUE: 'true', FALSE: 'false', NULL: 'nil',
      AND: 'and', OR: 'or', NOT: 'not ', EQ: '==', NEQ: '~=',
    });
    D.ifHead = c => 'if ' + c + ' then';
    D.elifHead = c => 'elseif ' + c + ' then';
    D.whileHead = c => 'while ' + c + ' do';
    D.foreverHead = () => 'while true do';
    D.notCond = c => 'not (' + c + ')';
    D.countHead = n => 'for _i = 0, ' + n + ' - 1 do';
    D.rangeHead = (v, a, b) => 'for ' + v + ' = ' + a + ', ' + b + ' do';
    D.eachHead = (v, l) => 'for _i, ' + v + ' in ipairs(' + l + ') do';
    D.funcHead = (n, pr) => 'function ' + n + '(' + pr + ')';
    D.print = e => 'print(' + e + ')';
    D.randomBelow = 'math.random()';
    D.clearList = t => t + ' = {}';
    D.halveStmt = t => t + ' = math.floor(' + t + ' / 2)';
    D.between = (v, lo, hi) => [v + ' >= ' + lo + ' and ' + v + ' <= ' + hi, 15];
    D.inList = (v, l) => ['contains(' + l + ', ' + v + ')', 100];
    D.hasItem = (a, b) => ['contains(' + a + ', ' + b + ')', 100];
    D.randomInclusive = m => 'math.random(0, ' + m + ')';
    D.countOf = x => '#' + x;
    D.itemAt = (l, i) => l + '[' + i + ']';   // fc indexes from 1, and so does Lua
    D.listLit = items => '{' + items.join(', ') + '}';
    D.objEntry = (k, e) => k + ' = ' + e;
    D.spritesOf = (n, one) => 'list_of(' + n + ', ' + one + ')';
    D.fallbackType = t => 'nil  -- ' + t;
    D.interp = str => fcTpLuaInterp(str);
    D.rval = parts => parts.join('.');
    D.arrPush = (l, v) => 'table.insert(' + l + ', ' + v + ')';
    D.arrRemove = (l, v) => 'list_remove(' + l + ', ' + v + ')';
    D.addStmt = (t, v, isList) => isList ? ('table.insert(' + t + ', ' + v + ')') : (t + ' = ' + t + ' + ' + v);
    D.stringAddStmt = (t, v) => t + ' = ' + t + ' .. ' + v;
    D.removeStmt = (t, v, isList) => isList ? ('list_remove(' + t + ', ' + v + ')') : (t + ' = ' + t + ' - ' + v);
    D.declare = false;
    return D;
  }
  if (lang === 'gdscript') {
    Object.assign(D, {
      name: 'GDScript', lang: 'gdscript', style: 'indent', c: '#', unit: '    ', semi: '',
      TRUE: 'true', FALSE: 'false', NULL: 'null',
      AND: 'and', OR: 'or', NOT: 'not ', EQ: '==', NEQ: '!=',
    });
    D.ifHead = c => 'if ' + c;
    D.elifHead = c => 'elif ' + c;
    D.whileHead = c => 'while ' + c;
    D.foreverHead = () => 'while true';
    D.notCond = c => 'not (' + c + ')';
    D.countHead = n => 'for _i in range(' + n + ')';
    D.rangeHead = (v, a, b) => 'for ' + v + ' in range(' + a + ', ' + b + ' + 1)';
    D.eachHead = (v, l) => 'for ' + v + ' in ' + l;
    D.funcHead = (n, pr) => 'func ' + n + '(' + pr + ')';
    D.print = e => 'print(' + e + ')';
    D.randomBelow = 'randf()';
    D.clearList = t => t + '.clear()';
    D.halveStmt = t => t + ' = int(' + t + ' / 2)';
    D.between = (v, lo, hi) => [v + ' >= ' + lo + ' and ' + v + ' <= ' + hi, 15];
    D.inList = (v, l) => [v + ' in ' + l, 20];
    D.hasItem = (a, b) => [b + ' in ' + a, 20];
    D.randomInclusive = m => 'randi_range(0, ' + m + ')';
    D.countOf = x => x + '.size()';
    D.itemAt = (l, i) => l + '[' + i + ']';
    D.listLit = items => '[' + items.join(', ') + ']';
    D.objEntry = (k, e) => JSON.stringify(k) + ': ' + e;
    D.spritesOf = (n, one) => 'list_of(' + n + ', ' + one + ')';
    D.fallbackType = t => 'null  # ' + t;
    D.interp = str => fcTpConcatInterp(str, 'str');
    D.rval = parts => parts.join('.');
    D.arrPush = (l, v) => l + '.append(' + v + ')';
    D.arrRemove = (l, v) => l + '.erase(' + v + ')';
    D.addStmt = (t, v, isList) => isList ? (t + '.append(' + v + ')') : (t + ' += ' + v);
    D.removeStmt = (t, v, isList) => isList ? (t + '.erase(' + v + ')') : (t + ' -= ' + v);
    D.declare = false;
    return D;
  }
  Object.assign(D, {
    name: 'Python', lang: 'python', style: 'indent', c: '#', unit: '    ', semi: '',
    TRUE: 'True', FALSE: 'False', NULL: 'None',
    AND: 'and', OR: 'or', NOT: 'not ', EQ: '==', NEQ: '!=',
  });
  D.ifHead = c => 'if ' + c;
  D.elifHead = c => 'elif ' + c;
  D.whileHead = c => 'while ' + c;
  D.foreverHead = () => 'while True';
  D.notCond = c => 'not (' + c + ')';
  D.countHead = n => 'for _ in range(' + n + ')';
  D.rangeHead = (v, a, b) => 'for ' + v + ' in range(' + a + ', ' + b + ' + 1)';
  D.eachHead = (v, l) => 'for ' + v + ' in ' + l;
  D.funcHead = (n, pr) => 'def ' + n + '(' + pr + ')';
  D.print = e => 'print(' + e + ')';
  D.randomBelow = 'random.random()';
  D.clearList = t => t + '.clear()';
  D.halveStmt = t => t + ' //= 2';
  D.between = (v, lo, hi) => [lo + ' <= ' + v + ' <= ' + hi, 20];
  D.inList = (v, l) => [v + ' in ' + l, 20];
  D.hasItem = (a, b) => [b + ' in ' + a, 20];
  D.randomInclusive = m => 'random.randint(0, ' + m + ')';
  D.countOf = x => 'len(' + x + ')';
  D.itemAt = (l, i) => l + '[' + i + ']';
  D.listLit = items => '[' + items.join(', ') + ']';
  D.objEntry = (k, e) => JSON.stringify(k) + ': ' + e;
  D.spritesOf = (n, one) => '[' + one + ' for _ in range(' + n + ')]';
  D.fallbackType = t => 'None';
  D.interp = str => 'f' + JSON.stringify(str);
  D.rval = parts => parts[0] + parts.slice(1).map(x => '[' + JSON.stringify(x) + ']').join('');
  D.arrPush = (l, v) => l + '.append(' + v + ')';
  D.arrRemove = (l, v) => l + '.remove(' + v + ')';
  D.addStmt = (t, v, isList) => isList ? (t + '.append(' + v + ')') : (t + ' += ' + v);
  D.removeStmt = (t, v, isList) => isList ? (t + '.remove(' + v + ')') : (t + ' -= ' + v);
  D.declare = false;
  return D;
}

// Names first assigned an empty/list literal or a list-of-sprites — so `add X to L`
// reads as append vs `+=`, and `remove X from L` as .remove vs `-=`.
// Every name the program declares (assignments, loop variables, function names and
// parameters) — so a bare word can be told apart from an fc colour name.
function fcTpCollectVars(stmts, acc) {
  for (const s of (stmts || [])) {
    if (!s || typeof s !== 'object') continue;
    if (typeof s.target === 'string') acc.add(s.target.split('.')[0]);
    if (typeof s.varName === 'string') acc.add(s.varName);
    if (typeof s.subject === 'string' && s.type === 'behavior') acc.add(s.subject);
    if (s.type === 'funcdef') {
      if (typeof s.name === 'string') acc.add(s.name);
      for (const p of (s.params || [])) acc.add(p);
    }
    if (s.type === 'each' && typeof s.varName === 'string') acc.add(s.varName);
    for (const k of ['body', 'parts']) if (Array.isArray(s[k])) fcTpCollectVars(s[k], acc);
    if (s.thenStmt) fcTpCollectVars([s.thenStmt], acc);
  }
  return acc;
}

// fc's palette names (mirrors COLORS in index.html; spec/heal/eval.mjs drift-checks
// this list against the app's).
const FC_TP_COLORS = new Set(['black','dark blue','dark purple','dark green','brown','dark gray','dark grey','light gray','light grey','white','red','orange','yellow','green','blue','indigo','pink','peach','gray','grey','gold','cyan','magenta','purple','lime','sky','coral']);

function fcTpCollectStrings(stmts, acc) {
  for (const s of (stmts || [])) {
    if (!s || typeof s !== 'object') continue;
    if (s.type === 'assign' && s.value && s.value.type === 'literal' && typeof s.value.value === 'string') acc.add(s.target);
    if (s.type === 'add' && s.value && s.value.type === 'literal' && typeof s.value.value === 'string') acc.add(s.target);
    for (const k of ['body', 'parts']) if (Array.isArray(s[k])) fcTpCollectStrings(s[k], acc);
    if (s.thenStmt) fcTpCollectStrings([s.thenStmt], acc);
  }
  return acc;
}

function fcTpCollectLists(stmts, acc) {
  for (const s of (stmts || [])) {
    if (!s || typeof s !== 'object') continue;
    if (s.type === 'assign' && s.value && (s.value.type === 'listliteral' || s.value.type === 'list_of_sprites')) {
      acc.add(s.target);
    }
    for (const k of ['body', 'parts']) if (Array.isArray(s[k])) fcTpCollectLists(s[k], acc);
    if (s.thenStmt) fcTpCollectLists([s.thenStmt], acc);
  }
  return acc;
}

// User-defined function names (from `to <name>` funcdefs) — so a bare `call` to a
// known function renders as a call, while an unknown verb renders as a comment.
function fcTpCollectFuncs(stmts, acc) {
  for (const s of (stmts || [])) {
    if (!s || typeof s !== 'object') continue;
    if (s.type === 'funcdef' && typeof s.name === 'string') acc.add(s.name);
    for (const k of ['body', 'parts']) if (Array.isArray(s[k])) fcTpCollectFuncs(s[k], acc);
  }
  return acc;
}

function fcTpIndent(n, ctx) { return ctx.d.unit.repeat(n); }

// Emit a header + a block body in the dialect's block style. `note` is an optional
// trailing comment placed where that style allows it (before the `:` for indent
// styles, after the `{` for braces, at the end of the head for Lua).
function fcTpBlock(header, body, inlineStmt, indent, ctx, out, note) {
  const d = ctx.d, pad = fcTpIndent(indent, ctx);
  const stmts = (body && body.length) ? body : (inlineStmt ? [inlineStmt] : []);
  const tail = note || '';
  if (d.style === 'indent') {
    out.push(pad + header + ':' + tail);
    if (!stmts.length) { if (d.lang === 'python') out.push(fcTpIndent(indent + 1, ctx) + 'pass'); return; }
    fcTpEmit(stmts, indent + 1, ctx, out);
    return;
  }
  if (d.style === 'end') {
    out.push(pad + header + tail);
    if (stmts.length) fcTpEmit(stmts, indent + 1, ctx, out);
    out.push(pad + 'end');
    return;
  }
  out.push(pad + header + ' {' + tail);
  fcTpEmit(stmts, indent + 1, ctx, out);
  out.push(pad + '}');
}

function fcTpEmit(stmts, indent, ctx, out) {
  for (let i = 0; i < stmts.length; i++) {
    const s = stmts[i];
    if (!s || typeof s !== 'object') continue;
    if (s.type === 'if') {
      // merge following else_if / else siblings into one chain
      fcTpIf(s, indent, ctx, out);
      while (i + 1 < stmts.length && stmts[i + 1] && (stmts[i + 1].type === 'else_if' || stmts[i + 1].type === 'else')) {
        const nxt = stmts[++i];
        if (nxt.type === 'else_if') {
          fcTpBlock(ctx.d.elifHead(fcTpCond(nxt.condition, ctx)), nxt.body, nxt.thenStmt, indent, ctx, out);
        } else {
          fcTpBlock('else', nxt.body, nxt.thenStmt, indent, ctx, out);
        }
      }
      continue;
    }
    if (s.type === 'else_if' || s.type === 'else') continue; // consumed above (defensive)
    fcTpStmt(s, indent, ctx, out);
  }
}

function fcTpIf(s, indent, ctx, out) {
  const d = ctx.d;
  const head = d.ifHead(fcTpCond(s.condition, ctx));
  fcTpBlock(head, s.body, s.thenStmt, indent, ctx, out);
}

function fcTpStmt(s, indent, ctx, out) {
  const d = ctx.d, pad = fcTpIndent(indent, ctx);
  const push = (t) => out.push(pad + t);
  const semi = d.semi;
  switch (s.type) {
    case 'assign': {
      // In JS, declare a top-level state variable with `let` on first sight so it
      // isn't an implicit global. Python needs no declaration.
      let decl = '';
      if (d.declare && indent === 0 && typeof s.target === 'string' && s.target.indexOf('.') === -1) {
        if (!ctx.declared.has(s.target)) { ctx.declared.add(s.target); decl = 'let '; }
      }
      push(decl + fcTpLval(s.target, ctx) + ' = ' + fcTpExpr(s.value, ctx) + semi); return;
    }
    case 'add': {
      const t = fcTpLval(s.target, ctx), v = fcTpExpr(s.value, ctx);
      if (ctx.strings.has(s.target) && d.stringAddStmt) push(d.stringAddStmt(t, v) + semi);
      else push(d.addStmt(t, v, ctx.lists.has(s.target)) + semi);
      return;
    }
    case 'remove': {
      push(d.removeStmt(fcTpLval(s.target, ctx), fcTpExpr(s.value, ctx), ctx.lists.has(s.target)) + semi);
      return;
    }
    case 'toggle': push(fcTpLval(s.target, ctx) + ' = ' + d.NOT + fcTpRval(s.target, ctx) + semi); return;
    case 'double': push(fcTpLval(s.target, ctx) + ' *= 2' + semi); return;
    case 'halve': push(d.halveStmt(fcTpLval(s.target, ctx)) + semi); return;
    case 'repeat_times': {
      const n = fcTpExpr(s.count, ctx);
      const head = d.countHead(n);
      fcTpBlock(head, s.body, null, indent, ctx, out); return;
    }
    case 'repeat_range': {
      const v = s.varName, from = fcTpExpr(s.from, ctx), to = fcTpExpr(s.to, ctx);
      const head = d.rangeHead(v, from, to);
      fcTpBlock(head, s.body, null, indent, ctx, out); return;
    }
    case 'repeat_while': {
      const head = d.whileHead(fcTpCond(s.condition, ctx));
      fcTpBlock(head, s.body, null, indent, ctx, out); return;
    }
    case 'repeat_until': {
      const c = fcTpCond(s.condition, ctx);
      const head = d.whileHead(d.notCond(c));
      fcTpBlock(head, s.body, null, indent, ctx, out); return;
    }
    case 'forever': {
      const head = d.foreverHead();
      fcTpBlock(head, s.body, null, indent, ctx, out); return;
    }
    case 'each': {
      const list = fcTpExpr(s.list, ctx);
      let head = d.eachHead(s.varName, list);
      if (s.where) {
        // filter via a guarded body; keep it readable with an if wrapper
        out.push(''); push(d.c + ' for each ' + s.varName + ' in ' + list + ' where ' + fcTpCond(s.where, ctx));
      }
      const body = s.where
        ? [{ type: 'if', condition: s.where, body: (s.body && s.body.length) ? s.body : (s.thenStmt ? [s.thenStmt] : []), thenStmt: null }]
        : s.body;
      fcTpBlock(head, body, s.where ? null : s.thenStmt, indent, ctx, out); return;
    }
    case 'every': {
      const head = d.ifHead('frame % ' + s.n + ' ' + d.EQ + ' 0');
      out.push(''); push(d.c + ' every ' + s.n + ' ' + s.unit);
      fcTpBlock(head, s.body, null, indent, ctx, out); return;
    }
    case 'funcdef': {
      out.push('');
      const name = s.name;
      const note = (typeof name === 'string' && name.indexOf('screen_') === 0)
        ? ('  ' + d.c + ' shown while mode is "' + name.slice(7) + '"') : '';
      const head = d.funcHead(name, (s.params || []).join(', '));
      fcTpBlock(head, s.body, null, indent, ctx, out, note);
      return;
    }
    case 'return': push('return' + (s.value ? (' ' + fcTpExpr(s.value, ctx)) : '') + semi); return;
    case 'stop': push('return' + semi + '  ' + d.c + ' stop'); return;
    case 'call': {
      if (ctx.funcs.has(s.name)) { push(fcTpCall(s.name, s.args, ctx) + semi); return; }
      // unknown verb (fc treats it as a no-op) — show it faithfully as a comment
      const words = (s.args || []).map(t => t && t.type === 'comma' ? ',' : (t && t.value != null ? t.value : '')).join(' ').replace(/ ,/g, ',').trim();
      push(d.c + ' ' + s.name + (words ? (' ' + words) : '') + '  (unknown command — ignored)'); return;
    }
    case 'say': push(d.print(fcTpExpr(s.text, ctx)) + semi); return;
    case 'clearscreen': push('clear_screen(' + fcTpColor(s.color, ctx) + ')' + semi); return;
    case 'clear': push(d.clearList(fcTpLval(s.target, ctx)) + semi); return;
    case 'draw': push(fcTpDraw(s, ctx) + semi); return;
    case 'draw_map': push('draw_map()' + semi); return;
    case 'write': push('write_text(' + fcTpExpr(s.text, ctx) + ', ' + fcTpExpr(s.x, ctx) + ', ' + fcTpExpr(s.y, ctx) + ', ' + fcTpColor(s.color, ctx) + ')' + (s.hud ? ('  ' + d.c + ' on HUD') : '') + semi); return;
    case 'button': push('show_button(' + fcTpStr(s.label, ctx) + ', ' + fcTpExpr(s.x, ctx) + ', ' + fcTpExpr(s.y, ctx) + ')' + semi); return;
    case 'meter': push('draw_meter(' + [s.current, s.max, s.x, s.y, s.w, s.h].map(e => fcTpExpr(e, ctx)).join(', ') + ', ' + fcTpColor(s.color, ctx) + ')' + semi); return;
    case 'play_sound': push((s.kind === 'music' ? 'play_music(' : 'play_sound(') + fcTpStr(s.name, ctx) + ')' + semi); return;
    case 'stop_music': push('stop_music()' + semi); return;
    case 'rungame': push('run_game(' + (s.funcs || []).join(', ') + ')' + semi); return;
    case 'goto': push('go_to_screen(' + fcTpStr(s.target, ctx) + ')' + semi); return;
    case 'goback': push('go_back()' + semi); return;
    case 'follow': push('camera_follow(' + fcTpStr(s.target, ctx) + ')' + semi); return;
    case 'tag': push('set_tag(' + fcTpStr(s.subject, ctx) + ', ' + fcTpStr(s.tag, ctx) + ')' + semi + '  ' + d.c + ' ' + s.subject + ' are ' + s.tag); return;
    case 'save': push('save_value(' + fcTpExpr(s.value, ctx) + ', ' + fcTpExpr(s.key, ctx) + ')' + semi); return;
    case 'broadcast': push('broadcast(' + fcTpExpr(s.value, ctx) + ')' + semi); return;
    case 'net_join': push('join_room(' + fcTpStr(s.game, ctx) + ', ' + fcTpStr(s.room, ctx) + ')' + semi); return;
    case 'time_limit': push('set_time_limit(' + fcTpExpr(s.value, ctx) + ')  ' + d.c + ' ' + (s.unit || '') + semi); return;
    case 'inventory': push('has_inventory(' + fcTpStr(s.subject, ctx) + ')' + semi); return;
    case 'inv_add': push('add_item(' + fcTpStr(s.subject, ctx) + ', ' + fcTpExpr(s.item, ctx) + ')' + semi); return;
    case 'inv_remove': push('remove_item(' + fcTpStr(s.subject, ctx) + ', ' + fcTpExpr(s.item, ctx) + ')' + semi); return;
    case 'flash': push('flash_screen(' + fcTpColor(s.color, ctx) + ', ' + fcTpExpr(s.frames, ctx) + ')' + semi); return;
    case 'shake': push('shake_camera(' + fcTpExpr(s.frames, ctx) + ', ' + fcTpExpr(s.magnitude, ctx) + ')' + semi); return;
    case 'damage': push('damage(' + fcTpStr(s.target, ctx) + ', ' + fcTpExpr(s.amount, ctx) + ')' + semi); return;
    case 'heal': push('heal(' + fcTpStr(s.target, ctx) + ', ' + fcTpExpr(s.amount, ctx) + ')' + semi); return;
    case 'restore': push('restore(' + fcTpStr(s.target, ctx) + ')' + semi); return;
    case 'jump': push('jump(' + fcTpStr(s.target, ctx) + (s.force != null ? (', ' + fcTpExpr(s.force, ctx)) : '') + ')' + semi); return;
    case 'move_with_arrows': push('move_with_arrows(' + fcTpStr(s.target, ctx) + (s.speed != null ? (', ' + fcTpExpr(s.speed, ctx)) : '') + ')' + semi); return;
    case 'behavior': push('set_behavior(' + fcTpStr(s.subject, ctx) + ', ' + fcTpStr(s.kind, ctx) + ')' + semi); return;
    case 'def_sprite': push('define_sprite(' + fcTpStr(s.name, ctx) + ', ' + fcTpStr(s.hex || '', ctx) + ')' + semi); return;
    case 'def_sfx': push('define_sound(' + fcTpStr(s.name, ctx) + ')' + semi); return;
    case 'def_song': push('define_song(' + fcTpStr(s.name, ctx) + ')' + semi); return;
    case 'with': fcTpEmit(s.body || [], indent, ctx, out); return; // `its X` lines already resolve to subject.X
    case 'chain': fcTpEmit(s.parts || [], indent, ctx, out); return;
    case 'probability': {
      const p = fcTpExpr(s.prob, ctx);
      fcTpBlock(d.ifHead(d.randomBelow + ' < ' + p), null, s.stmt, indent, ctx, out); return;
    }
    case 'when_key': fcTpWhen(d.c + ' when key ' + fcTpStr(s.key, ctx) + ' is pressed', 'key_pressed(' + fcTpStr(s.key, ctx) + ')', s, indent, ctx, out); return;
    case 'when_key_in': fcTpWhen(d.c + ' when an arrow / movement key is pressed', 'any_key_pressed(' + fcTpExpr(s.keys, ctx) + ')', s, indent, ctx, out); return;
    case 'when_mouse': fcTpWhen(d.c + ' when the mouse is ' + s.event, 'mouse_' + s.event + '()', s, indent, ctx, out); return;
    case 'when_button': fcTpWhen(d.c + ' when the "' + s.label + '" button is tapped', 'button_tapped(' + fcTpStr(s.label, ctx) + ')', s, indent, ctx, out); return;
    case 'when_pickup': fcTpWhen(d.c + ' when the player picks up ' + s.itemVar, 'player_picks_up(' + fcTpStr(s.itemVar, ctx) + ')', s, indent, ctx, out); return;
    case 'when_hit': fcTpWhen(d.c + ' when the player hits ' + s.itemVar, 'player_hits(' + fcTpStr(s.itemVar, ctx) + ')', s, indent, ctx, out); return;
    case 'when_defeat': fcTpWhen(d.c + ' when the player defeats ' + s.itemVar, 'player_defeats(' + fcTpStr(s.itemVar, ctx) + ')', s, indent, ctx, out); return;
    case 'when_timeout': fcTpWhen(d.c + ' when the timer runs out', 'timer_ended()', s, indent, ctx, out); return;
    default: {
      // Faithful, clearly-labeled fallback for the rarer console verbs.
      push(d.c + ' ' + s.type + fcTpScalarHint(s, ctx));
      if (Array.isArray(s.body) && s.body.length) fcTpEmit(s.body, indent, ctx, out);
      return;
    }
  }
}

function fcTpWhen(comment, cond, s, indent, ctx, out) {
  const d = ctx.d;
  out.push(''); out.push(fcTpIndent(indent, ctx) + comment);
  const head = d.ifHead(cond);
  fcTpBlock(head, s.body, s.thenStmt, indent, ctx, out);
}

function fcTpScalarHint(s, ctx) {
  const parts = [];
  for (const k of Object.keys(s)) {
    if (k === 'type' || k === 'lineNum' || k === 'body') continue;
    const v = s[k];
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') parts.push(k + '=' + v);
  }
  return parts.length ? (' (' + parts.join(', ') + ')') : '';
}

function fcTpDraw(s, ctx) {
  const a = s.args || {};
  const E = (e) => fcTpExpr(e, ctx);
  const col = a.color ? (', ' + fcTpColor(a.color, ctx)) : '';
  switch (s.shape) {
    case 'sprite': return 'draw_sprite(' + (a.image != null ? (fcTpStr(a.image, ctx) + ', ') : (a.name != null ? fcTpStr(a.name, ctx) + ', ' : '')) + E(a.x) + ', ' + E(a.y) + ')';
    case 'rect': return 'draw_rect(' + E(a.x) + ', ' + E(a.y) + ', ' + E(a.w) + ', ' + E(a.h) + col + ')';
    case 'circle': return 'draw_circle(' + E(a.x) + ', ' + E(a.y) + ', ' + E(a.w) + col + ')';
    case 'line': return 'draw_line(' + E(a.x1) + ', ' + E(a.y1) + ', ' + E(a.x2) + ', ' + E(a.y2) + col + ')';
    default: return 'draw_' + (s.shape || 'shape') + '(' + [a.x, a.y, a.w, a.h].filter(v => v != null).map(E).join(', ') + col + ')';
  }
}

function fcTpCall(name, args, ctx) {
  // call args are raw tokens; render their values, split on commas.
  const groups = [[]];
  for (const t of (args || [])) {
    if (t && t.type === 'comma') groups.push([]);
    else groups[groups.length - 1].push(t && t.value != null ? t.value : String(t));
  }
  const rendered = groups.map(g => g.join(' ').trim()).filter(x => x.length);
  return name + '(' + rendered.join(', ') + ')';
}

// ---- expressions ----
// precedence: atom 100, not 40, * / % 30, + - 25, compare 20, and 15, or 10
function fcTpExpr(node, ctx, minPrec) {
  minPrec = minPrec || 0;
  const [s, p] = fcTpExprP(node, ctx);
  return p < minPrec ? ('(' + s + ')') : s;
}
function fcTpCond(node, ctx) { return fcTpExpr(node, ctx, 0); }

function fcTpExprP(node, ctx) {
  const d = ctx.d;
  if (node == null) return [d.NULL, 100];
  if (typeof node !== 'object') return [fcTpLit(node, ctx), 100];
  switch (node.type) {
    case 'literal': return [fcTpLit(node.value, ctx), 100];
    case 'ref':
      // bare `sprite` is fc's "a new empty sprite" keyword, not a variable
      if (node.name === 'sprite') return ['new_sprite()', 100];
      // A bare word that the program never declares is an fc COLOUR name (fc's own
      // ref semantics: variable first, then palette name), so emit the string; a
      // multi-word name can only ever be a literal.
      if (ctx.vars && !ctx.vars.has(node.name) &&
          (String(node.name).indexOf(' ') !== -1 || FC_TP_COLORS.has(String(node.name).toLowerCase()))) {
        return [JSON.stringify(node.name), 100];
      }
      return [fcTpRval(node.name, ctx), 100];
    case 'math': {
      const prec = (node.op === '*' || node.op === '/' || node.op === '%') ? 30 : 25;
      return [fcTpExpr(node.left, ctx, prec) + ' ' + node.op + ' ' + fcTpExpr(node.right, ctx, prec + 1), prec];
    }
    case 'eq': return [fcTpExpr(node.left, ctx, 21) + ' ' + d.EQ + ' ' + fcTpExpr(node.right, ctx, 21), 20];
    case 'neq': return [fcTpExpr(node.left, ctx, 21) + ' ' + d.NEQ + ' ' + fcTpExpr(node.right, ctx, 21), 20];
    case 'cmp': return [fcTpExpr(node.left, ctx, 21) + ' ' + node.op + ' ' + fcTpExpr(node.right, ctx, 21), 20];
    // and/or are associative — keep the right operand at the same precedence so
    // chains flatten (a and b and c) instead of nesting parens.
    case 'and': return [fcTpExpr(node.left, ctx, 15) + ' ' + d.AND + ' ' + fcTpExpr(node.right, ctx, 15), 15];
    case 'or': return [fcTpExpr(node.left, ctx, 10) + ' ' + d.OR + ' ' + fcTpExpr(node.right, ctx, 10), 10];
    case 'not': return [d.NOT + fcTpExpr(node.expr, ctx, 40), 40];
    case 'between': {
      const v = fcTpExpr(node.value, ctx, 21), lo = fcTpExpr(node.low, ctx, 21), hi = fcTpExpr(node.high, ctx, 21);
      return d.between(v, lo, hi);
    }
    case 'in': {
      const v = fcTpExpr(node.value, ctx, 21), l = fcTpExpr(node.list, ctx, 21);
      return d.inList(v, l);
    }
    case 'inv_has': return ['has_item(' + fcTpStr(node.subject, ctx) + ', ' + fcTpExpr(node.item, ctx) + ')', 100];
    case 'has': {
      const a = fcTpExpr(node.left, ctx, 21), b = fcTpExpr(node.right, ctx, 21);
      return d.hasItem(a, b);
    }
    case 'key_pressed': return ['key_pressed(' + fcTpStr(node.key, ctx) + ')', 100];
    case 'random': return [d.randomInclusive(fcTpExpr(node.max, ctx)), 100];
    case 'count': return [d.countOf(fcTpExpr(node.expr, ctx, 100)), 100];
    case 'item_of': {
      const list = fcTpExpr(node.list, ctx, 100);
      const idx = node.index;
      const oneBased = d.lang === 'lua';   // fc indexes from 1, and so does Lua
      if (idx && idx.type === 'literal' && typeof idx.value === 'number') {
        return [d.itemAt(list, String(oneBased ? idx.value : idx.value - 1)), 100];
      }
      const e = fcTpExpr(idx, ctx);
      return [d.itemAt(list, oneBased ? e : (e + ' - 1')), 100];
    }
    case 'load': return ['load_save(' + fcTpExpr(node.key, ctx) + ')', 100];
    case 'solid_at': return ['is_solid_at(' + fcTpExpr(node.x, ctx) + ', ' + fcTpExpr(node.y, ctx) + ')', 100];
    case 'listliteral': return [d.listLit((node.items || []).map(e => fcTpExpr(e, ctx))), 100];
    case 'object_expr': return [fcTpObject(node.props, ctx), 100];
    case 'sprite_expr': return ['new_sprite(' + fcTpStr(node.position || 'default', ctx) + (node.props ? (', ' + fcTpSpriteProps(node.props, ctx)) : '') + ')', 100];
    case 'list_of_sprites': {
      const one = 'new_sprite(' + (node.props ? fcTpSpriteProps(node.props, ctx) : '') + ')';
      return [d.spritesOf(fcTpExpr(node.count, ctx), one), 100];
    }
    // inline-safe fallback: no `#` line comment mid-expression (breaks Python)
    default: return [d.fallbackType(node.type), 100];
  }
}

// sprite props may be a bare {k: exprNode} map or an object_expr node wrapping one
function fcTpSpriteProps(props, ctx) {
  if (props && props.type === 'object_expr') return fcTpObject(props.props || {}, ctx);
  return fcTpObject(props || {}, ctx);
}

function fcTpObject(props, ctx) {
  const d = ctx.d;
  const keys = Object.keys(props || {});
  if (!keys.length) return '{}';
  return '{' + keys.map(k => d.objEntry(k, fcTpExpr(props[k], ctx))).join(', ') + '}';
}

// value literal (number/bool/string)
function fcTpLit(v, ctx) {
  const d = ctx.d;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? d.TRUE : d.FALSE;
  if (v == null) return d.NULL;
  return fcTpStrInterp(String(v), ctx);
}
// force a string literal (color names, tags, labels held as bare strings)
function fcTpStr(v, ctx) { return fcTpStrInterp(v == null ? '' : String(v), ctx); }

// A COLOUR position: a plain colour word is a string literal, but a word that names
// a declared string variable is a dynamic colour (`shade is green` … `in shade`), so
// pass the variable itself.
function fcTpColor(word, ctx) {
  if (word == null) return ctx.d.NULL;
  const w = String(word);
  if (/^[A-Za-z_]\w*$/.test(w) && ctx.vars && ctx.vars.has(w)) return w;
  return JSON.stringify(w);
}

// String literal with fc `{var}` interpolation -> f-string / template literal.
function fcTpStrInterp(str, ctx) {
  const d = ctx.d;
  if (str.indexOf('{') !== -1 && /\{[^}]+\}/.test(str)) return d.interp(str);
  return JSON.stringify(str);
}

// dotted fc ref -> readable access. Python dicts use ["k"]; JS uses .k
function fcTpRval(name, ctx) {
  if (name == null) return ctx.d.NULL;
  const parts = String(name).split('.');
  if (parts.length === 1) return parts[0];
  return ctx.d.rval(parts);
}
function fcTpLval(name, ctx) { return fcTpRval(name, ctx); }

function fcTpArrPush(target, value, ctx) {
  return ctx.d.arrPush(fcTpLval(target, ctx), fcTpExpr(value, ctx));
}
function fcTpArrRemove(target, value, ctx) {
  return ctx.d.arrRemove(fcTpLval(target, ctx), fcTpExpr(value, ctx));
}
// <FC-TRANSPILE-END>

export { fcTranspile as transpile };
export default fcTranspile;
