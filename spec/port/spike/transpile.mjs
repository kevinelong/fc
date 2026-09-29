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
  const d = fcTpDialect(lang === 'js' ? 'js' : 'python');
  const ctx = { d, lists: fcTpCollectLists(program, new Set()), funcs: fcTpCollectFuncs(program, new Set()), declared: new Set() };
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

function fcTpDialect(lang) {
  if (lang === 'js') {
    return {
      name: 'JavaScript', lang: 'js', c: '//', unit: '  ',
      TRUE: 'true', FALSE: 'false', NULL: 'null',
      AND: '&&', OR: '||', NOT: '!', EQ: '===', NEQ: '!==',
    };
  }
  return {
    name: 'Python', lang: 'python', unit: '    ', c: '#',
    TRUE: 'True', FALSE: 'False', NULL: 'None',
    AND: 'and', OR: 'or', NOT: 'not ', EQ: '==', NEQ: '!=',
  };
}

// Names first assigned an empty/list literal or a list-of-sprites — so `add X to L`
// reads as append vs `+=`, and `remove X from L` as .remove vs `-=`.
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

// Emit a header + a block body, dialect-aware (`header:` + indent vs `header {}`).
function fcTpBlock(header, body, inlineStmt, indent, ctx, out) {
  const d = ctx.d, pad = fcTpIndent(indent, ctx);
  const stmts = (body && body.length) ? body : (inlineStmt ? [inlineStmt] : []);
  if (d.lang === 'python') {
    out.push(pad + header + ':');
    if (!stmts.length) { out.push(fcTpIndent(indent + 1, ctx) + 'pass'); return; }
    fcTpEmit(stmts, indent + 1, ctx, out);
  } else {
    out.push(pad + header + ' {');
    fcTpEmit(stmts, indent + 1, ctx, out);
    out.push(pad + '}');
  }
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
          const kw = ctx.d.lang === 'python' ? 'elif ' : 'else if (';
          const tail = ctx.d.lang === 'python' ? '' : ')';
          fcTpBlock(kw + fcTpCond(nxt.condition, ctx) + tail, nxt.body, nxt.thenStmt, indent, ctx, out);
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
  const head = d.lang === 'python' ? ('if ' + fcTpCond(s.condition, ctx))
                                   : ('if (' + fcTpCond(s.condition, ctx) + ')');
  fcTpBlock(head, s.body, s.thenStmt, indent, ctx, out);
}

function fcTpStmt(s, indent, ctx, out) {
  const d = ctx.d, pad = fcTpIndent(indent, ctx);
  const push = (t) => out.push(pad + t);
  const semi = d.lang === 'js' ? ';' : '';
  switch (s.type) {
    case 'assign': {
      // In JS, declare a top-level state variable with `let` on first sight so it
      // isn't an implicit global. Python needs no declaration.
      let decl = '';
      if (d.lang === 'js' && indent === 0 && typeof s.target === 'string' && s.target.indexOf('.') === -1) {
        if (!ctx.declared.has(s.target)) { ctx.declared.add(s.target); decl = 'let '; }
      }
      push(decl + fcTpLval(s.target, ctx) + ' = ' + fcTpExpr(s.value, ctx) + semi); return;
    }
    case 'add': {
      if (ctx.lists.has(s.target)) push(fcTpArrPush(s.target, s.value, ctx) + semi);
      else push(fcTpLval(s.target, ctx) + ' += ' + fcTpExpr(s.value, ctx) + semi);
      return;
    }
    case 'remove': {
      if (ctx.lists.has(s.target)) push(fcTpArrRemove(s.target, s.value, ctx) + semi);
      else push(fcTpLval(s.target, ctx) + ' -= ' + fcTpExpr(s.value, ctx) + semi);
      return;
    }
    case 'toggle': push(fcTpLval(s.target, ctx) + ' = ' + d.NOT + fcTpRval(s.target, ctx) + semi); return;
    case 'double': push(fcTpLval(s.target, ctx) + ' *= 2' + semi); return;
    case 'halve': push(fcTpLval(s.target, ctx) + (d.lang === 'python' ? ' //= 2' : ' = Math.floor(' + fcTpRval(s.target, ctx) + ' / 2)') + semi); return;
    case 'repeat_times': {
      const n = fcTpExpr(s.count, ctx);
      const head = d.lang === 'python' ? ('for _ in range(' + n + ')')
                                       : ('for (let _i = 0; _i < ' + n + '; _i++)');
      fcTpBlock(head, s.body, null, indent, ctx, out); return;
    }
    case 'repeat_range': {
      const v = s.varName, from = fcTpExpr(s.from, ctx), to = fcTpExpr(s.to, ctx);
      const head = d.lang === 'python' ? ('for ' + v + ' in range(' + from + ', ' + to + ' + 1)')
                                       : ('for (let ' + v + ' = ' + from + '; ' + v + ' <= ' + to + '; ' + v + '++)');
      fcTpBlock(head, s.body, null, indent, ctx, out); return;
    }
    case 'repeat_while': {
      const head = d.lang === 'python' ? ('while ' + fcTpCond(s.condition, ctx))
                                       : ('while (' + fcTpCond(s.condition, ctx) + ')');
      fcTpBlock(head, s.body, null, indent, ctx, out); return;
    }
    case 'repeat_until': {
      const c = fcTpCond(s.condition, ctx);
      const neg = d.lang === 'python' ? ('not (' + c + ')') : ('!(' + c + ')');
      const head = d.lang === 'python' ? ('while ' + neg) : ('while (' + neg + ')');
      fcTpBlock(head, s.body, null, indent, ctx, out); return;
    }
    case 'forever': {
      const head = d.lang === 'python' ? 'while True' : 'while (true)';
      fcTpBlock(head, s.body, null, indent, ctx, out); return;
    }
    case 'each': {
      const list = fcTpExpr(s.list, ctx);
      let head = d.lang === 'python' ? ('for ' + s.varName + ' in ' + list)
                                     : ('for (const ' + s.varName + ' of ' + list + ')');
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
      const head = d.lang === 'python' ? ('if frame % ' + s.n + ' == 0') : ('if (frame % ' + s.n + ' === 0)');
      out.push(''); push(d.c + ' every ' + s.n + ' ' + s.unit);
      fcTpBlock(head, s.body, null, indent, ctx, out); return;
    }
    case 'funcdef': {
      out.push('');
      let name = s.name, note = '';
      if (typeof name === 'string' && name.indexOf('screen_') === 0) { note = '  ' + d.c + ' shown while mode is "' + name.slice(7) + '"'; }
      const params = (s.params || []).join(', ');
      const head = d.lang === 'python' ? ('def ' + name + '(' + params + ')') : ('function ' + name + '(' + params + ')');
      if (note) push(head + (d.lang === 'python' ? ':' : ' {'));
      // re-emit with note appended to header line
      if (note) {
        out.pop();
        if (d.lang === 'python') { push(head + ':' + note); if (!(s.body && s.body.length)) out.push(fcTpIndent(indent + 1, ctx) + 'pass'); else fcTpEmit(s.body, indent + 1, ctx, out); }
        else { push(head + ' {' + note); fcTpEmit(s.body, indent + 1, ctx, out); push('}'); }
        return;
      }
      fcTpBlock(head, s.body, null, indent, ctx, out); return;
    }
    case 'return': push('return' + (s.value ? (' ' + fcTpExpr(s.value, ctx)) : '') + semi); return;
    case 'stop': push('return' + semi + '  ' + d.c + ' stop'); return;
    case 'call': {
      if (ctx.funcs.has(s.name)) { push(fcTpCall(s.name, s.args, ctx) + semi); return; }
      // unknown verb (fc treats it as a no-op) — show it faithfully as a comment
      const words = (s.args || []).map(t => t && t.type === 'comma' ? ',' : (t && t.value != null ? t.value : '')).join(' ').replace(/ ,/g, ',').trim();
      push(d.c + ' ' + s.name + (words ? (' ' + words) : '') + '  (unknown command — ignored)'); return;
    }
    case 'say': push((d.lang === 'python' ? 'print(' : 'console.log(') + fcTpExpr(s.text, ctx) + ')' + semi); return;
    case 'clearscreen': push('clear_screen(' + fcTpStr(s.color, ctx) + ')' + semi); return;
    case 'clear': push(fcTpLval(s.target, ctx) + (d.lang === 'python' ? '.clear()' : '.length = 0') + semi); return;
    case 'draw': push(fcTpDraw(s, ctx) + semi); return;
    case 'draw_map': push('draw_map()' + semi); return;
    case 'write': push('write_text(' + fcTpExpr(s.text, ctx) + ', ' + fcTpExpr(s.x, ctx) + ', ' + fcTpExpr(s.y, ctx) + ', ' + fcTpStr(s.color, ctx) + ')' + (s.hud ? ('  ' + d.c + ' on HUD') : '') + semi); return;
    case 'button': push('show_button(' + fcTpStr(s.label, ctx) + ', ' + fcTpExpr(s.x, ctx) + ', ' + fcTpExpr(s.y, ctx) + ')' + semi); return;
    case 'meter': push('draw_meter(' + [s.current, s.max, s.x, s.y, s.w, s.h].map(e => fcTpExpr(e, ctx)).join(', ') + ', ' + fcTpStr(s.color, ctx) + ')' + semi); return;
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
    case 'flash': push('flash_screen(' + fcTpStr(s.color, ctx) + ', ' + fcTpExpr(s.frames, ctx) + ')' + semi); return;
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
      const cond = d.lang === 'python' ? ('random.random() < ' + p) : ('Math.random() < ' + p);
      fcTpBlock((d.lang === 'python' ? 'if ' : 'if (') + cond + (d.lang === 'python' ? '' : ')'), null, s.stmt, indent, ctx, out); return;
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
  const head = d.lang === 'python' ? ('if ' + cond) : ('if (' + cond + ')');
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
  const col = a.color ? (', ' + fcTpStr(a.color, ctx)) : '';
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
      if (d.lang === 'python') return [lo + ' <= ' + v + ' <= ' + hi, 20];
      return [v + ' >= ' + lo + ' && ' + v + ' <= ' + hi, 15];
    }
    case 'in': {
      const v = fcTpExpr(node.value, ctx, 21), l = fcTpExpr(node.list, ctx, 21);
      return d.lang === 'python' ? [v + ' in ' + l, 20] : [l + '.includes(' + v + ')', 100];
    }
    case 'inv_has': return ['has_item(' + fcTpStr(node.subject, ctx) + ', ' + fcTpExpr(node.item, ctx) + ')', 100];
    case 'has': {
      const a = fcTpExpr(node.left, ctx, 21), b = fcTpExpr(node.right, ctx, 21);
      return d.lang === 'python' ? [b + ' in ' + a, 20] : [a + '.includes(' + b + ')', 100];
    }
    case 'key_pressed': return ['key_pressed(' + fcTpStr(node.key, ctx) + ')', 100];
    case 'random': return [d.lang === 'python' ? ('random.randint(0, ' + fcTpExpr(node.max, ctx) + ')') : ('Math.floor(Math.random() * (' + fcTpExpr(node.max, ctx) + ' + 1))'), 100];
    case 'count': return [d.lang === 'python' ? ('len(' + fcTpExpr(node.expr, ctx) + ')') : (fcTpExpr(node.expr, ctx, 100) + '.length'), 100];
    case 'item_of': {
      const list = fcTpExpr(node.list, ctx, 100);
      const idx = node.index;
      if (idx && idx.type === 'literal' && typeof idx.value === 'number') return [list + '[' + (idx.value - 1) + ']', 100];
      return [list + '[' + fcTpExpr(idx, ctx) + ' - 1]', 100];
    }
    case 'load': return ['load_save(' + fcTpExpr(node.key, ctx) + ')', 100];
    case 'solid_at': return ['is_solid_at(' + fcTpExpr(node.x, ctx) + ', ' + fcTpExpr(node.y, ctx) + ')', 100];
    case 'listliteral': return ['[' + (node.items || []).map(e => fcTpExpr(e, ctx)).join(', ') + ']', 100];
    case 'object_expr': return [fcTpObject(node.props, ctx), 100];
    case 'sprite_expr': return ['new_sprite(' + fcTpStr(node.position || 'default', ctx) + (node.props ? (', ' + fcTpSpriteProps(node.props, ctx)) : '') + ')', 100];
    case 'list_of_sprites': {
      const one = 'new_sprite(' + (node.props ? fcTpSpriteProps(node.props, ctx) : '') + ')';
      const n = fcTpExpr(node.count, ctx);
      return [d.lang === 'python' ? ('[' + one + ' for _ in range(' + n + ')]') : ('Array.from({length: ' + n + '}, () => ' + one + ')'), 100];
    }
    // inline-safe fallback: no `#` line comment mid-expression (breaks Python)
    default: return [d.lang === 'python' ? 'None' : ('null /* ' + node.type + ' */'), 100];
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
  if (!keys.length) return d.lang === 'python' ? '{}' : '{}';
  const parts = keys.map(k => (d.lang === 'python' ? (JSON.stringify(k) + ': ') : (k + ': ')) + fcTpExpr(props[k], ctx));
  return '{' + parts.join(', ') + '}';
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

// String literal with fc `{var}` interpolation -> f-string / template literal.
function fcTpStrInterp(str, ctx) {
  const d = ctx.d;
  if (str.indexOf('{') !== -1 && /\{[^}]+\}/.test(str)) {
    if (d.lang === 'python') return 'f' + JSON.stringify(str);
    return '`' + str.replace(/`/g, '\\`').replace(/\{([^}]+)\}/g, '${$1}') + '`';
  }
  return JSON.stringify(str);
}

// dotted fc ref -> readable access. Python dicts use ["k"]; JS uses .k
function fcTpRval(name, ctx) {
  if (name == null) return ctx.d.NULL;
  const parts = String(name).split('.');
  if (parts.length === 1) return parts[0];
  if (ctx.d.lang === 'python') return parts[0] + parts.slice(1).map(p => '[' + JSON.stringify(p) + ']').join('');
  return parts.join('.');
}
function fcTpLval(name, ctx) { return fcTpRval(name, ctx); }

function fcTpArrPush(target, value, ctx) {
  const l = fcTpLval(target, ctx);
  return ctx.d.lang === 'python' ? (l + '.append(' + fcTpExpr(value, ctx) + ')') : (l + '.push(' + fcTpExpr(value, ctx) + ')');
}
function fcTpArrRemove(target, value, ctx) {
  const l = fcTpLval(target, ctx), v = fcTpExpr(value, ctx);
  return ctx.d.lang === 'python' ? (l + '.remove(' + v + ')') : (l + '.splice(' + l + '.indexOf(' + v + '), 1)');
}
// <FC-TRANSPILE-END>

export { fcTranspile as transpile };
export default fcTranspile;
