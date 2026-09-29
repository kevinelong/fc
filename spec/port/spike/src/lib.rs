//! fc WASM spike — STAGE 1: the lexer, ported faithfully from index.html's
//! tokenizeLine (~L1369). Tokens are emitted as [type:u8, start:u16, len:u16]
//! little-endian, referencing the source bytes the host already holds (no string
//! copying / no allocator needed). Differential-tested against the JS tokenizer.
#![no_std]
extern crate alloc;
use core::panic::PanicInfo;
use core::ptr::{addr_of, addr_of_mut};
#[panic_handler] fn panic(_: &PanicInfo) -> ! { core::arch::wasm32::unreachable() }

// --- Step 0: real reclaiming global allocator (dlmalloc — what std uses on wasm)
// The original bump allocator never freed, which is fine for a one-shot parse but
// fatal for a sustained game loop (per-frame Strings/Vecs accumulate → OOM in ~1s
// at 60fps). dlmalloc reclaims on drop AND grows wasm linear memory on demand, so
// the loop reaches steady state. (The host recreates memory views per call, so the
// buffer detaching on growth is safe.)
#[global_allocator]
static GLOBAL: dlmalloc::GlobalDlmalloc = dlmalloc::GlobalDlmalloc;
// reset_arena is now a no-op: a real allocator frees on drop, so each program's Rt
// (and every per-frame allocation) is reclaimed automatically. Kept for ABI compat.
#[no_mangle] pub extern "C" fn reset_arena() {}

// alloc self-test: sum of squares 0..99 via a heap Vec  (== 328350)
#[no_mangle] pub extern "C" fn alloc_selftest() -> u32 {
    let mut v: Vec<u32> = Vec::new();
    for i in 0..100u32 { v.push(i * i); }
    v.iter().sum()
}

const IN_CAP: usize = 8192;
const TOK_CAP: usize = 16384;
static mut INPUT: [u8; IN_CAP] = [0; IN_CAP];
static mut TOKS: [u8; TOK_CAP] = [0; TOK_CAP];
static mut INDENT: u32 = 0;

const T_STRING: u8 = 1; const T_NUMBER: u8 = 2; const T_WORD: u8 = 3; const T_OP: u8 = 4;
const T_DOT: u8 = 5; const T_COMMA: u8 = 6; const T_LPAREN: u8 = 7; const T_RPAREN: u8 = 8;
const T_LBRACK: u8 = 9; const T_RBRACK: u8 = 10; const T_LBRACE: u8 = 11; const T_RBRACE: u8 = 12;

#[no_mangle] pub extern "C" fn input_ptr() -> *const u8 { addr_of!(INPUT) as *const u8 }
#[no_mangle] pub extern "C" fn tok_ptr() -> *const u8 { addr_of!(TOKS) as *const u8 }
#[no_mangle] pub extern "C" fn indent() -> u32 { unsafe { INDENT } }

fn is_digit(b: u8) -> bool { b >= b'0' && b <= b'9' }
fn is_alpha(b: u8) -> bool { (b >= b'a' && b <= b'z') || (b >= b'A' && b <= b'Z') || b == b'_' }
fn is_op(b: u8) -> bool { matches!(b, b'+' | b'-' | b'*' | b'/' | b'>' | b'<' | b'=' | b'!') }

fn emit(toks: &mut [u8], n: &mut usize, t: u8, start: usize, l: usize) {
    let o = *n * 5;
    if o + 5 <= toks.len() {
        toks[o] = t;
        toks[o + 1] = (start & 0xff) as u8; toks[o + 2] = ((start >> 8) & 0xff) as u8;
        toks[o + 3] = (l & 0xff) as u8;     toks[o + 4] = ((l >> 8) & 0xff) as u8;
        *n += 1;
    }
}

#[no_mangle]
pub extern "C" fn tokenize(len: u32) -> u32 {
    let len = (len as usize).min(IN_CAP);
    unsafe {
        let inp = core::slice::from_raw_parts(addr_of!(INPUT) as *const u8, len);
        let toks = core::slice::from_raw_parts_mut(addr_of_mut!(TOKS) as *mut u8, TOK_CAP);
        let mut i = 0usize;
        let mut indent = 0u32;
        while i < inp.len() && (inp[i] == b' ' || inp[i] == b'\t') { indent += if inp[i] == b'\t' { 2 } else { 1 }; i += 1; }
        INDENT = indent / 2;
        let mut n = 0usize;
        while i < inp.len() {
            let c = inp[i];
            if c == b' ' || c == b'\t' { i += 1; continue; }
            if c == b'-' && i + 1 < inp.len() && inp[i + 1] == b'-' { break; }
            if c == b'"' || c == b'\'' {
                let q = c; i += 1; let start = i;
                while i < inp.len() && inp[i] != q { i += 1; }
                let l = i - start; i += 1;
                emit(toks, &mut n, T_STRING, start, l); continue;
            }
            let prev = if n > 0 { toks[(n - 1) * 5] } else { 0 };
            if is_digit(c) || (c == b'-' && i + 1 < inp.len() && is_digit(inp[i + 1])
                && (n == 0 || prev == T_OP || prev == T_COMMA || prev == T_LPAREN)) {
                let start = i; if inp[i] == b'-' { i += 1; }
                while i < inp.len() && (is_digit(inp[i]) || inp[i] == b'.') { i += 1; }
                emit(toks, &mut n, T_NUMBER, start, i - start); continue;
            }
            match c {
                b'[' => { emit(toks, &mut n, T_LBRACK, i, 1); i += 1; continue; }
                b']' => { emit(toks, &mut n, T_RBRACK, i, 1); i += 1; continue; }
                b'{' => { emit(toks, &mut n, T_LBRACE, i, 1); i += 1; continue; }
                b'}' => { emit(toks, &mut n, T_RBRACE, i, 1); i += 1; continue; }
                b'(' => { emit(toks, &mut n, T_LPAREN, i, 1); i += 1; continue; }
                b')' => { emit(toks, &mut n, T_RPAREN, i, 1); i += 1; continue; }
                b',' => { emit(toks, &mut n, T_COMMA, i, 1); i += 1; continue; }
                b'.' => { emit(toks, &mut n, T_DOT, i, 1); i += 1; continue; }
                _ => {}
            }
            if is_op(c) {
                let start = i; i += 1; let mut l = 1;
                if i < inp.len() && inp[i] == b'=' { i += 1; l = 2; }
                emit(toks, &mut n, T_OP, start, l); continue;
            }
            if is_alpha(c) {
                let start = i;
                while i < inp.len() && (is_alpha(inp[i]) || is_digit(inp[i])) { i += 1; }
                emit(toks, &mut n, T_WORD, start, i - start); continue;
            }
            i += 1;
        }
        n as u32
    }
}

// ============================================================================
// STAGE 2 — parser subset (assign/add/double/call/funcdef/if/else +
// expressions literal/ref/math + conditions eq/cmp/and/or/not/neq/has/bare).
// Emits contract-matching JSON (sorted keys, lineNum stripped, ints w/o decimal,
// explicit null). Unimplemented statements fall back to a `call` node, exactly
// like the JS parser does — so the harness shows real progress, not crashes.
// ============================================================================
use alloc::string::{String, ToString};
use alloc::vec::Vec;
use alloc::boxed::Box;
use alloc::format;

#[derive(Clone)]
enum TokVal { Num(f64), Str(String) }
#[derive(Clone)]
struct Tok { t: u8, v: TokVal }
impl Tok {
    fn sval(&self) -> &str { match &self.v { TokVal::Str(s) => s, _ => "" } }
    fn is_word(&self, w: &str) -> bool { self.t == 3 && self.sval() == w }
}
fn tname(t: u8) -> &'static str {
    match t { 1=>"string",2=>"number",3=>"word",4=>"operator",5=>"dot",6=>"comma",
        7=>"lparen",8=>"rparen",9=>"lbracket",10=>"rbracket",11=>"lbrace",12=>"rbrace",_=>"word" }
}
fn slice_str(b: &[u8], a: usize, c: usize) -> String {
    if a >= c || c > b.len() { return String::new(); }
    core::str::from_utf8(&b[a..c]).unwrap_or("").to_string()
}
fn js_parse_float(s: &str) -> f64 {
    let b = s.as_bytes(); let mut i = 0; let mut dot = false;
    if i < b.len() && b[i] == b'-' { i += 1; }
    while i < b.len() { let c = b[i];
        if c == b'.' { if dot { break; } dot = true; i += 1; }
        else if c.is_ascii_digit() { i += 1; } else { break; } }
    let mut t = &s[..i];
    if t.ends_with('.') { t = &t[..t.len()-1]; }
    t.parse::<f64>().unwrap_or(0.0)
}
fn lex_line(b: &[u8]) -> (u32, Vec<Tok>) {
    let mut toks: Vec<Tok> = Vec::new();
    let mut i = 0; let mut indent = 0u32;
    while i < b.len() && (b[i] == b' ' || b[i] == b'\t') { indent += if b[i]==b'\t' {2} else {1}; i += 1; }
    while i < b.len() {
        let c = b[i];
        if c == b' ' || c == b'\t' { i += 1; continue; }
        if c == b'-' && i+1 < b.len() && b[i+1] == b'-' { break; }
        if c == b'"' || c == b'\'' { let q=c; i+=1; let s0=i; while i<b.len() && b[i]!=q {i+=1;} let s=slice_str(b,s0,i); i+=1; toks.push(Tok{t:1,v:TokVal::Str(s)}); continue; }
        let prev = toks.last().map(|t| t.t).unwrap_or(0);
        if c.is_ascii_digit() || (c==b'-' && i+1<b.len() && b[i+1].is_ascii_digit() && (toks.is_empty() || prev==4 || prev==6 || prev==7)) {
            let s0=i; if b[i]==b'-' {i+=1;} while i<b.len() && (b[i].is_ascii_digit()||b[i]==b'.') {i+=1;}
            toks.push(Tok{t:2, v:TokVal::Num(js_parse_float(&slice_str(b,s0,i)))}); continue;
        }
        let punct = match c { b'['=>Some(9),b']'=>Some(10),b'{'=>Some(11),b'}'=>Some(12),b'('=>Some(7),b')'=>Some(8),b','=>Some(6),b'.'=>Some(5),_=>None };
        if let Some(tt) = punct { toks.push(Tok{t:tt, v:TokVal::Str(slice_str(b,i,i+1))}); i+=1; continue; }
        if matches!(c, b'+'|b'-'|b'*'|b'/'|b'>'|b'<'|b'='|b'!') {
            let s0=i; i+=1; if i<b.len() && b[i]==b'=' { i+=1; }
            toks.push(Tok{t:4, v:TokVal::Str(slice_str(b,s0,i))}); continue;
        }
        if c.is_ascii_alphabetic() || c==b'_' {
            let s0=i; while i<b.len() && (b[i].is_ascii_alphanumeric()||b[i]==b'_') {i+=1;}
            toks.push(Tok{t:3, v:TokVal::Str(slice_str(b,s0,i))}); continue;
        }
        i += 1;
    }
    (indent/2, toks)
}

#[derive(Clone)]
enum LitVal { Num(f64), Str(String), Bool(bool) }
#[derive(Clone)]
enum Expr { Lit(LitVal), Ref(String), Math(String, Box<Expr>, Box<Expr>),
    ListLit(Vec<Expr>), Random(Box<Expr>), ItemOf(Box<Expr>, Box<Expr>),
    Object(Vec<(String, Expr)>), Sprite(String, Box<Expr>), ListOfSprites(Box<Expr>, Box<Expr>), Count(Box<Expr>),
    Load(Box<Expr>), SolidAt(Box<Expr>, Box<Expr>) }
#[derive(Clone)]
enum Cond { Or(Box<Cond>,Box<Cond>), And(Box<Cond>,Box<Cond>), Not(Box<Cond>), NotExpr(Expr),
    Eq(Expr,Expr), Neq(Expr,Expr), Cmp(String,Expr,Expr), Has(Expr,Expr), In(Expr,Expr), InvHas(String,Expr), Bare(Expr), Key(String) }
#[derive(Clone)]
enum Stmt {
    Assign(String, Expr), Add(String, Expr), Remove(String, Expr),
    Simple(&'static str, String), // double/halve/toggle/clear -> {target,type}
    Call(String, Vec<Tok>, Vec<Expr>),
    FuncDef(String, Vec<String>, Vec<Stmt>),
    If(Cond, Option<Box<Stmt>>, Vec<Stmt>), ElseIf(Cond, Option<Box<Stmt>>, Vec<Stmt>), Else(Vec<Stmt>),
    RepeatTimes(Expr, Vec<Stmt>), RepeatRange(String, Expr, Expr, Vec<Stmt>),
    RepeatWhile(Cond, Vec<Stmt>), RepeatUntil(Cond, Vec<Stmt>), Forever(Vec<Stmt>), With(Vec<Stmt>),
    Every(f64, String, Vec<Stmt>, u32),
    Tag(String, String),
    WhenPickup(String, Vec<Stmt>), WhenHit(String, Vec<Stmt>), WhenDefeat(String, Vec<Stmt>),
    WhenKey(String, Option<Box<Stmt>>, Vec<Stmt>), WhenButton(String, Option<Box<Stmt>>, Vec<Stmt>),
    WhenMouse(String, Option<Box<Stmt>>, Vec<Stmt>),
    TimeLimit(Expr, String), WhenTimeout(Option<Box<Stmt>>, Vec<Stmt>),
    Flash(String, Expr, String), Shake(Expr, String, Expr),
    Emit { rate: Expr, x: Option<Expr>, y: Option<Expr>, rf: Option<String>, marker: String, color: String, frames: Expr, unit: String },
    Tween { target: String, from: Expr, to: Expr, frames: Expr, unit: String, ease: String },
    Inventory(String), InvAdd(String, Expr), InvRemove(String, Expr),
    ClearScreen(String), Draw(DrawArgs), Pset(Expr, Expr, String), Write(WriteArgs), Say(Expr),
    Each(String, Expr, Option<Cond>, Option<Box<Stmt>>, Vec<Stmt>),
    RunGame(Vec<String>), Follow(String), Goto(String), GoBack,
    MoveArrows(String, Option<Expr>), MoveBy(String, Expr, Expr, Option<String>),
    PlaySound(String, String), StopSound, Button(String, Expr, Expr), Return(Option<Expr>), Stop,
    Jump(String, f64), Broadcast(Expr), NetJoin(String, String), DefSfx(String, SfxRecipe),
    Meter(Expr, Expr, Expr, Expr, Expr, Expr, String),
    Damage(String, Expr), Heal(String, Expr), Knock(String, String, Expr),
    Save(Expr, Expr), TileDef(String, Expr), MapDef(Vec<String>), DrawMap,
    Behavior(BehaviorArgs), Animate(String, Vec<String>, f64),
    Burst(Expr, Option<Expr>, Option<Expr>, Option<Expr>, Option<String>),
}
#[derive(Clone)]
struct BehaviorArgs { kind: String, subject: String, target: String,
    speed: Option<Expr>, x1: Option<Expr>, x2: Option<Expr>, through: bool,
    within: Option<Expr>, points: Option<Expr> }
#[derive(Clone)]
struct SfxRecipe { tone: bool, wave: String, f0: f64, f1: Option<f64>, dur: f64, notes: Vec<f64> }
#[derive(Clone, Default)]
struct DrawArgs { shape: String, hud: bool, sprite_name: Option<String>, sprite_name_expr: Option<Expr>,
    x: Option<Expr>, y: Option<Expr>, w: Option<Expr>, h: Option<Expr>,
    x1: Option<Expr>, y1: Option<Expr>, x2: Option<Expr>, y2: Option<Expr>, color: Option<String> }
#[derive(Clone)]
struct WriteArgs { text: Expr, x: Option<Expr>, y: Option<Expr>, color: Option<String>, hud: bool }

fn find_word(ts: &[Tok], w: &str) -> Option<usize> { ts.iter().position(|t| t.is_word(w)) }
fn tokens_to_ref(ts: &[Tok]) -> String { let mut s=String::new(); for t in ts { s.push_str(t.sval()); } s }
fn join_dot(ts: &[Tok]) -> String { let mut parts: Vec<&str>=Vec::new(); for t in ts { parts.push(t.sval()); } parts.join(".") }

fn parse_expr(ts: &[Tok]) -> Expr {
    if ts.is_empty() { return Expr::Lit(LitVal::Num(0.0)); }
    // strip a fully-wrapping paren group: ( EXPR ) -> EXPR. only when the opening
    // paren's match is the LAST token (so (a+b)*(c) isn't mis-stripped).
    if ts[0].t==7 {
        let mut depth=0i32; let mut matched=usize::MAX;
        for (i,t) in ts.iter().enumerate() {
            match t.t { 7|9|11 => depth+=1, 8|10|12 => depth-=1, _=>{} }
            if depth==0 { matched=i; break; }
        }
        if matched==ts.len()-1 { return parse_expr(&ts[1..ts.len()-1]); }
    }
    // whole-expression literals first (so internal math isn't mis-split by the flat scan)
    if ts[0].t==9 {
        let inner = if ts.len()>=2 && ts[ts.len()-1].t==10 { &ts[1..ts.len()-1] } else { &ts[1..] };
        let mut items: Vec<Expr> = Vec::new();
        for seg in split_top_commas(inner) { if !seg.is_empty() { items.push(parse_expr(seg)); } }
        return Expr::ListLit(items);
    }
    if ts[0].t==11 { return parse_object(ts); }
    if ts[0].is_word("centered") && ts.len()>=2 && ts[1].is_word("sprite") { return Expr::Sprite("centered".to_string(), Box::new(brace_props(&ts[2..]))); }
    if ts[0].is_word("sprite") && ts.iter().any(|t| t.t==11) { return Expr::Sprite("zero".to_string(), Box::new(brace_props(&ts[1..]))); }
    if ts[0].is_word("list") && ts.len()>=2 && ts[1].is_word("of") {
        let lb = ts.iter().position(|t| t.t==11).unwrap_or(ts.len());
        let count = if ts.len()>=3 { parse_expr(&ts[2..3]) } else { Expr::Lit(LitVal::Num(0.0)) };
        let props = if lb < ts.len() { parse_object(&ts[lb..]) } else { Expr::Object(Vec::new()) };
        return Expr::ListOfSprites(Box::new(count), Box::new(props));
    }
    // phrase atoms that bind LOOSER than math (mirror the JS parser, which checks
    // these before the math split): `random 3 + 2` is random(3+2), `count of xs + 1`
    // is count(xs+1), and `item a + 1 of grid` indexes with a+1. Checked BEFORE the
    // math split so trailing math becomes their operand rather than a split point —
    // in particular `item <expr> of <list>` must claim its `of`-delimited region.
    if ts[0].is_word("random") { return Expr::Random(Box::new(parse_expr(&ts[1..]))); }
    if ts[0].is_word("load") && ts.len()>=2 { return Expr::Load(Box::new(parse_expr(&ts[1..]))); }
    if ts[0].is_word("solid") && ts.len()>=4 && ts[1].is_word("at") {
        let rest=&ts[2..];
        if let Some(ci)=rest.iter().position(|t| t.t==6) { if ci>0 {
            return Expr::SolidAt(Box::new(parse_expr(&rest[..ci])), Box::new(parse_expr(&rest[ci+1..])));
        }}
    }
    if ts[0].is_word("item") { if let Some(k)=find_word(ts,"of") {
        return Expr::ItemOf(Box::new(parse_expr(&ts[1..k])), Box::new(parse_expr(&ts[k+1..]))); } }
    if ts[0].is_word("the") && ts.len()>=3 && ts[1].is_word("number") && ts[2].is_word("of") { return Expr::Count(Box::new(parse_expr(&ts[3..]))); }
    if ts[0].is_word("count") && ts.len()>=2 && ts[1].is_word("of") { return Expr::Count(Box::new(parse_expr(&ts[2..]))); }
    // math splits — at the rightmost TOP-LEVEL operator (depth 0), so operators
    // inside ( ) [ ] { } stay grouped. scan right-to-left for left-associativity.
    let mut depth=0i32; let mut i = ts.len();
    while i > 1 { i -= 1;
        match ts[i].t { 8|10|12 => depth+=1, 7|9|11 => depth-=1, _=>{} }
        if depth==0 && ts[i].t==4 { let o=ts[i].sval(); if o=="+"||o=="-" {
            return Expr::Math(o.to_string(), Box::new(parse_expr(&ts[..i])), Box::new(parse_expr(&ts[i+1..]))); } } }
    let mut depth=0i32; let mut i = ts.len();
    while i > 1 { i -= 1;
        match ts[i].t { 8|10|12 => depth+=1, 7|9|11 => depth-=1, _=>{} }
        if depth==0 {
            let op = if ts[i].t==4 && (ts[i].sval()=="*"||ts[i].sval()=="/") { Some(ts[i].sval().to_string()) }
                     else if ts[i].is_word("mod") { Some("%".to_string()) } else { None };
            if let Some(op)=op { return Expr::Math(op, Box::new(parse_expr(&ts[..i])), Box::new(parse_expr(&ts[i+1..]))); } } }
    if ts[0].t==4 && ts[0].sval()=="-" {
        return Expr::Math("-".to_string(), Box::new(Expr::Lit(LitVal::Num(0.0))), Box::new(parse_expr(&ts[1..]))); }
    if ts.len()==1 {
        let t=&ts[0];
        return match t.t { 2=>Expr::Lit(LitVal::Num(if let TokVal::Num(n)=t.v {n} else {0.0})),
            1=>Expr::Lit(LitVal::Str(t.sval().to_string())),
            3=> if t.sval()=="yes" {Expr::Lit(LitVal::Bool(true))} else if t.sval()=="no" {Expr::Lit(LitVal::Bool(false))} else {Expr::Ref(t.sval().to_string())},
            _=>Expr::Ref(t.sval().to_string()) };
    }
    // property access a.b.c — mirrors the JS parseExpression branch: only a DOT
    // after the first token makes a dotted ref. Treating any all-word sequence as
    // one and concatenating it turned the two-word color `dark gray` into the
    // undefined ref `darkgray`.
    if ts.len() >= 3 && ts[1].t == 5 {
        let mut name = ts[0].sval().to_string();
        let mut i = 1;
        while i < ts.len() && ts[i].t == 5 {
            if i + 1 >= ts.len() { break; }
            name.push('.');
            name.push_str(ts[i+1].sval());
            i += 2;
        }
        if i >= ts.len() { return Expr::Ref(name); }
        // tokens after the property path: re-parse as [ref, rest...] (JS does the same)
        let mut nt: Vec<Tok> = Vec::new();
        nt.push(Tok { t: 3, v: TokVal::Str(name) });
        nt.extend_from_slice(&ts[i..]);
        return parse_expr(&nt);
    }
    // multi-word fallthrough -> ref joined with spaces (numbers included, like the
    // JS `tokens.map(t => t.value).join(' ')`)
    Expr::Ref(tok_text_join(ts))
}
fn split_top_commas(ts: &[Tok]) -> Vec<&[Tok]> {
    let mut out = Vec::new(); let mut depth = 0i32; let mut start = 0;
    for (i,t) in ts.iter().enumerate() { match t.t {
        9|11|7 => depth += 1, 10|12|8 => depth -= 1,
        6 if depth == 0 => { out.push(&ts[start..i]); start = i+1; }, _=>{} } }
    out.push(&ts[start..]); out
}
// Collapse English comparison phrases into operator tokens (mirrors the JS collapseCmp):
// "is more/greater than"->>, "is less/fewer than" / "is under/below"-><, "is over/above"->>,
// "is at least"->>=, "is at most"-><=. Leaves `is not`, `is in`, `is between`, plain `is`.
fn collapse_cmp(ts: &[Tok]) -> Vec<Tok> {
    let mut out: Vec<Tok> = Vec::new();
    let mut i = 0;
    while i < ts.len() {
        if ts[i].is_word("is") {
            let a = ts.get(i + 1).filter(|t| t.t == 3).map(|t| t.sval());
            let b = ts.get(i + 2).filter(|t| t.t == 3).map(|t| t.sval());
            let (op, skip): (Option<&str>, usize) = match (a, b) {
                (Some("more"), Some("than")) | (Some("greater"), Some("than")) => (Some(">"), 2),
                (Some("less"), Some("than")) | (Some("fewer"), Some("than")) => (Some("<"), 2),
                (Some("at"), Some("least")) => (Some(">="), 2),
                (Some("at"), Some("most")) => (Some("<="), 2),
                (Some("under"), _) | (Some("below"), _) => (Some("<"), 1),
                (Some("over"), _) | (Some("above"), _) => (Some(">"), 1),
                _ => (None, 0),
            };
            if let Some(sym) = op {
                out.push(Tok { t: 4, v: TokVal::Str(sym.to_string()) });
                i += 1 + skip;
                continue;
            }
        }
        out.push(ts[i].clone());
        i += 1;
    }
    out
}

fn parse_cond(ts: &[Tok]) -> Cond {
    let owned = collapse_cmp(ts);
    let ts: &[Tok] = &owned;
    // `not X` negates a whole CONDITION (so `not a and b` is `not (a and b)`, per the
    // JS parseCondition); `no X` negates an EXPRESSION (e.g. `no enemies`).
    if !ts.is_empty() && ts[0].is_word("not") { return Cond::Not(Box::new(parse_cond(&ts[1..]))); }
    if !ts.is_empty() && ts[0].is_word("no") { return Cond::NotExpr(parse_expr(&ts[1..])); }
    if let Some(k)=find_word(ts,"or") { return Cond::Or(Box::new(parse_cond(&ts[..k])), Box::new(parse_cond(&ts[k+1..]))); }
    if let Some(k)=find_word(ts,"and") { return Cond::And(Box::new(parse_cond(&ts[..k])), Box::new(parse_cond(&ts[k+1..]))); }
    if !ts.is_empty() && ts[0].is_word("key") { return Cond::Key(ts.get(1).map(|t| t.sval().to_string()).unwrap_or_default()); }
    for i in 0..ts.len() { if ts[i].t==4 { let o=ts[i].sval(); if matches!(o, ">"|"<"|">="|"<="|"!="|"==") {
        return Cond::Cmp(o.to_string(), parse_expr(&ts[..i]), parse_expr(&ts[i+1..])); } } }
    if let Some(k)=find_word(ts,"is") {
        if k+1<ts.len() && ts[k+1].is_word("not") {
            // `X is not in [..]` negates membership; plain `X is not Y` is inequality
            if k+2<ts.len() && ts[k+2].is_word("in") {
                return Cond::Not(Box::new(Cond::In(parse_expr(&ts[..k]), parse_expr(safe(ts,k+3,ts.len())))));
            }
            return Cond::Neq(parse_expr(&ts[..k]), parse_expr(&ts[k+2..]));
        }
        // `X is in [..]` — list membership
        if k+1<ts.len() && ts[k+1].is_word("in") {
            return Cond::In(parse_expr(&ts[..k]), parse_expr(safe(ts,k+2,ts.len())));
        }
        return Cond::Eq(parse_expr(&ts[..k]), parse_expr(&ts[k+1..]));
    }
    // `player has "key" in inventory`
    if ts.len() >= 5 && ts[ts.len()-1].is_word("inventory") && ts[ts.len()-2].is_word("in") {
        if let Some(k) = find_word(ts, "has") { if k > 0 {
            return Cond::InvHas(tokens_to_ref(&ts[..k]), parse_expr(&ts[k+1..ts.len()-2]));
        }}
    }
    if let Some(k)=find_word(ts,"has") { return Cond::Has(parse_expr(&ts[..k]), parse_expr(&ts[k+1..])); }
    Cond::Bare(parse_expr(ts))
}
fn call_fallback(ts: &[Tok]) -> Stmt {
    let name = ts.get(0).map(|t| t.sval().to_string()).unwrap_or_default();
    let args: Vec<Tok> = ts.get(1..).unwrap_or(&[]).to_vec();
    Stmt::Call(name, args.clone(), call_arg_exprs(&args))
}
// Split a user-function call's argument tokens at TOP-LEVEL commas and the
// at/with/in connectors (`fill at 2 with 9` -> [[2],[9]]), mirroring the JS
// parseCallArgs. Shared by the AST (argExprs) and the call binding.
fn call_arg_segments(a: &[Tok]) -> Vec<Vec<Tok>> {
    let mut segs: Vec<Vec<Tok>> = Vec::new();
    let mut cur: Vec<Tok> = Vec::new();
    let mut depth = 0i32;
    for t in a.iter() {
        match t.t {
            7|9|11 => { depth += 1; cur.push(t.clone()); }
            8|10|12 => { depth -= 1; cur.push(t.clone()); }
            6 if depth==0 => { if !cur.is_empty() { segs.push(core::mem::take(&mut cur)); } }
            3 if depth==0 && (t.sval()=="at"||t.sval()=="with"||t.sval()=="in") => { if !cur.is_empty() { segs.push(core::mem::take(&mut cur)); } }
            _ => cur.push(t.clone()),
        }
    }
    if !cur.is_empty() { segs.push(cur); }
    segs
}
fn call_arg_exprs(a: &[Tok]) -> Vec<Expr> {
    let mut out: Vec<Expr> = Vec::new();
    for seg in call_arg_segments(a) { out.push(parse_expr(&seg)); }
    out
}
fn parse_line(ts: &[Tok]) -> Stmt {
    if ts.is_empty() { return Stmt::Call(String::new(), Vec::new(), Vec::new()); }
    let first = ts[0].sval();
    if first=="to" && ts.len()>=2 {
        if ts.len()>=3 && ts[1].is_word("screen") {
            let params: Vec<String> = ts[3..].iter().filter(|t| t.t==3 && t.sval()!="at" && t.sval()!="with" && t.sval()!="in").map(|t| t.sval().to_string()).collect();
            return Stmt::FuncDef(format!("screen_{}", ts[2].sval().to_lowercase()), params, Vec::new());
        }
        let params: Vec<String> = ts[2..].iter().filter(|t| t.t==3 && t.sval()!="at" && t.sval()!="with" && t.sval()!="in").map(|t| t.sval().to_string()).collect();
        return Stmt::FuncDef(ts[1].sval().to_string(), params, Vec::new());
    }
    if first=="if" { return parse_if(&ts[1..], false); }
    if first=="else" {
        if ts.len()>=2 && ts[1].is_word("if") { return parse_if(&ts[2..], true); }
        return Stmt::Else(Vec::new());
    }
    if first=="repeat" { return parse_repeat(ts); }
    if first=="every" && ts.len()>=3 {
        let n = if let TokVal::Num(n)=ts[1].v { n } else { 0.0 };
        // unique per-statement id so each `every` keeps its OWN execution counter
        // (JS keys these by source line) — see the exec arm and EVERY_ID.
        let id = unsafe { let i = EVERY_ID; EVERY_ID += 1; i };
        return Stmt::Every(n, ts[2].sval().to_string(), Vec::new(), id);
    }
    if first=="time" && ts.get(1).map_or(false, |t| t.is_word("limit")) {
        let start = find_word(ts, "is").map(|i| i+1).unwrap_or(2);
        let mut end = ts.len(); let mut unit = "seconds";
        if end > start && ts[end-1].is_word("seconds") { end -= 1; }
        else if end > start && ts[end-1].is_word("frames") { unit = "frames"; end -= 1; }
        return Stmt::TimeLimit(parse_expr(&ts[start..end]), unit.to_string());
    }

    // -- flash screen [COLOR] [for N [seconds|frames]]  (host-rendered overlay) --
    if first=="flash" && ts.get(1).map_or(false, |t| t.is_word("screen")) {
        let for_i = find_word(ts, "for").unwrap_or(ts.len());
        let color = word_join(&ts[2..for_i]);
        let (frames, unit) = if for_i < ts.len() { duration_tail(&ts[for_i+1..]) } else { (Expr::Lit(LitVal::Num(6.0)), "frames".to_string()) };
        let color = if color.is_empty() { "white".to_string() } else { color };
        return Stmt::Flash(color, frames, unit);
    }
    // -- shake camera [for N [seconds|frames]] [by N [pixels]] --
    if first=="shake" && ts.get(1).map_or(false, |t| t.is_word("camera")) {
        let for_i = find_word(ts, "for").unwrap_or(ts.len());
        let by_i = find_word(ts, "by").unwrap_or(ts.len());
        let (frames, unit) = if for_i < ts.len() {
            let stop = if by_i > for_i { by_i } else { ts.len() };
            duration_tail(&ts[for_i+1..stop])
        } else { (Expr::Lit(LitVal::Num(12.0)), "frames".to_string()) };
        let magnitude = if by_i < ts.len() {
            let rest: Vec<Tok> = ts[by_i+1..].iter().filter(|t| !t.is_word("pixels")).cloned().collect();
            parse_expr(&rest)
        } else { Expr::Lit(LitVal::Num(2.0)) };
        return Stmt::Shake(frames, unit, magnitude);
    }
    if first=="when" { return parse_when(ts); }
    // -- player has inventory · add "key" to player inventory · remove … --
    if ts.len()==3 && ts[0].t==3 && ts[1].is_word("has") && ts[2].is_word("inventory") {
        return Stmt::Inventory(ts[0].sval().to_string());
    }
    if (first=="add" || first=="remove") && ts.len()>=4 && ts[ts.len()-1].is_word("inventory") {
        let kw = if first=="add" { find_word(ts, "to") } else { find_word(ts, "from") };
        if let Some(k) = kw { if k > 0 && k + 1 < ts.len() - 1 {
            let item = parse_expr(&ts[1..k]);
            let subject = tokens_to_ref(&ts[k+1..ts.len()-1]);
            return if first=="add" { Stmt::InvAdd(subject, item) } else { Stmt::InvRemove(subject, item) };
        }}
    }
    if first=="add" { if let Some(k)=find_word(ts,"to") { return Stmt::Add(tokens_to_ref(&ts[k+1..]), parse_expr(&ts[1..k])); } return call_fallback(ts); }
    if first=="remove" { if let Some(k)=find_word(ts,"from") { return Stmt::Remove(tokens_to_ref(&ts[k+1..]), parse_expr(&ts[1..k])); } return call_fallback(ts); }
    // increase X [by N] / decrease X [by N] — plain-English aliases; desugar to add/remove
    if first=="increase" || first=="decrease" {
        let (target, value) = match find_word(ts, "by") {
            Some(k) => (tokens_to_ref(&ts[1..k]), parse_expr(&ts[k+1..])),
            None => (tokens_to_ref(&ts[1..]), Expr::Lit(LitVal::Num(1.0))),
        };
        return if first=="increase" { Stmt::Add(target, value) } else { Stmt::Remove(target, value) };
    }
    // with X : a block whose `its <field>` lines resolve to X.<field> (rewritten in parse_block)
    if first=="with" && ts.len()>=2 { return Stmt::With(Vec::new()); }
    if first=="double" && ts.len()>=2 { return Stmt::Simple("double", join_dot(&ts[1..])); }
    if first=="halve" && ts.len()>=2 { return Stmt::Simple("halve", join_dot(&ts[1..])); }
    if first=="toggle" && ts.len()>=2 { return Stmt::Simple("toggle", join_dot(&ts[1..])); }
    if first=="clear" && ts.len()>=2 && ts[1].is_word("screen") {
        let color = if let Some(k)=find_word(ts,"to") { word_join(&ts[k+1..]) } else { String::new() };
        return Stmt::ClearScreen(color);
    }
    if first=="save" { if let Some(ai)=find_word(ts,"as") { if ai>=2 {
        return Stmt::Save(parse_expr(&ts[1..ai]), parse_expr(&ts[ai+1..]));
    }}}
    if first=="tile" && ts.len()>=4 && ts[1].t==1 && ts[2].is_word("is") {
        return Stmt::TileDef(ts[1].sval().to_string(), parse_expr(&ts[3..]));
    }
    if first=="map" && ts.len()==2 && ts[1].is_word("is") { return Stmt::MapDef(Vec::new()); }
    if first=="draw" && ts.len()==2 && ts[1].is_word("map") { return Stmt::DrawMap; }
    if ts.len()>=2 && ts[0].t==3 && ts[1].t==3 &&
        matches!(ts[1].sval(), "chase"|"chases"|"wander"|"wanders"|"patrol"|"patrols"|"flee"|"flees") {
        let twi = ts.iter().enumerate().position(|(i,t)| t.is_word("through") &&
            ts.get(i+1).map_or(false,|n| n.is_word("walls")));
        let through = twi.is_some();
        let toks: Vec<Tok> = if let Some(i)=twi { let mut v=ts[..i].to_vec(); v.extend_from_slice(&ts[i+2..]); v } else { ts.to_vec() };
        let subject = toks[0].sval().to_string();
        let verb_owned = toks[1].sval().trim_end_matches('s').to_string();
        let verb = verb_owned.as_str();
        let sp = find_word(&toks, "speed");
        // `end` bounds the clauses BEFORE speed (target / x1 / x2); the speed
        // expression has its own bound so a trailing `when within N` isn't swallowed.
        let end = sp.unwrap_or(toks.len());
        let speed = sp.map(|i| {
            let after = &toks[i+1..];
            let stop = after.iter().position(|t| t.t==3 && matches!(t.sval(), "when"|"within"|"through"|"and"|"with"));
            parse_expr(match stop { Some(k) if k > 0 => &after[..k], _ => after })
        });
        if verb=="chase" {
            let target = toks.get(2).filter(|t| t.t==3).map(|t| t.sval().to_string()).unwrap_or_else(|| "player".to_string());
            return Stmt::Behavior(BehaviorArgs{kind:"chase".into(), subject, target, speed, x1:None, x2:None, through, within:None, points:None});
        }
        if verb=="flee" {
            // `flees FROM player` — the target follows `from`; bare `flees player` works too.
            let fi = find_word(&toks, "from");
            let target = match fi {
                Some(k) => toks.get(k+1).filter(|t| t.t==3).map(|t| t.sval().to_string()).unwrap_or_else(|| "player".to_string()),
                None => match toks.get(2).filter(|t| t.t==3 && !matches!(t.sval(), "speed"|"when"|"through"|"from")) {
                    Some(t) => t.sval().to_string(),
                    None => "player".to_string(),
                },
            };
            let within = find_word(&toks, "within").map(|wi| {
                let after = &toks[wi+1..];
                let stop = after.iter().position(|t| t.t==3 && matches!(t.sval(), "speed"|"when"|"through"|"and"|"with"));
                parse_expr(match stop { Some(k) if k > 0 => &after[..k], _ => after })
            });
            return Stmt::Behavior(BehaviorArgs{kind:"flee".into(), subject, target, speed, x1:None, x2:None, through, within, points:None});
        }
        if verb=="wander" {
            return Stmt::Behavior(BehaviorArgs{kind:"wander".into(), subject, target:String::new(), speed, x1:None, x2:None, through, within:None, points:None});
        }
        if verb=="patrol" {
            if let Some(li)=find_word(&toks,"along") { if li>0 {
                return Stmt::Behavior(BehaviorArgs{kind:"patrol_points".into(), subject, target:String::new(), speed,
                    x1:None, x2:None, through, within:None, points:Some(parse_expr(safe(&toks, li+1, end)))});
            }}
            if let (Some(bi), Some(ai)) = (find_word(&toks,"between"), find_word(&toks,"and")) { if bi>0 && ai>bi {
                return Stmt::Behavior(BehaviorArgs{kind:"patrol".into(), subject, target:String::new(), speed,
                    x1:Some(parse_expr(&toks[bi+1..ai])), x2:Some(parse_expr(&toks[ai+1..end])), through, within:None, points:None});
            }}
        }
    }
    if first=="animate" && ts.len()>=4 && ts[1].t==3 && ts[2].is_word("with") {
        let mut frames=Vec::new(); let mut i=3usize;
        while i<ts.len() && ts[i].t==1 { frames.push(ts[i].sval().to_string()); i+=1; }
        let mut every=10.0;
        if i<ts.len() && ts[i].is_word("every") { if let Some(t)=ts.get(i+1) { if let TokVal::Num(n)=t.v { every=n; } } }
        if !frames.is_empty() { return Stmt::Animate(ts[1].sval().to_string(), frames, every); }
    }
    // -- emit sparks [rising|falling] (at X, Y | from REF) [in COLOR] [for N [seconds|frames]] --
    // A SUSTAINED emitter: spawns particles every frame (same model/random draw order
    // as `burst`) for the duration, following REF when one is named.
    if first=="emit" {
        let kw = |w: &str| ts.iter().enumerate().position(|(i,t)| i > 1 && t.is_word(w));
        let at_i = kw("at"); let from_i = kw("from"); let in_i = kw("in"); let for_i = kw("for");
        let marker_i = ts.iter().enumerate().position(|(i,t)| i > 1 && (t.is_word("rising") || t.is_word("falling")));
        let mut starts: Vec<usize> = Vec::new();
        for o in [at_i, from_i, in_i, for_i].iter() { if let Some(v) = *o { starts.push(v); } }
        starts.sort();
        let noun_end = starts.first().copied().unwrap_or(ts.len()).min(marker_i.unwrap_or(ts.len()));
        let rate = ts[1..noun_end].iter().find(|t| t.t==2)
            .map(|t| Expr::Lit(LitVal::Num(if let TokVal::Num(n) = t.v { n } else { 0.0 })))
            .unwrap_or(Expr::Lit(LitVal::Num(2.0)));
        let mut x = None; let mut y = None; let mut rf = None;
        if let Some(fi) = from_i { rf = Some(ts.get(fi+1).map(|t| t.sval().to_string()).unwrap_or_else(|| "player".to_string())); }
        else if let Some(ai) = at_i {
            let stop = starts.iter().filter(|i| **i > ai).copied().min().unwrap_or(ts.len());
            let seg = safe(ts, ai+1, stop);
            match seg.iter().position(|t| t.t==6) {
                Some(ci) if ci > 0 => { x = Some(parse_expr(&seg[..ci])); y = Some(parse_expr(&seg[ci+1..])); }
                _ => { x = Some(parse_expr(seg)); y = Some(Expr::Lit(LitVal::Num(0.0))); }
            }
        }
        let color_end = if let (Some(ii), Some(fi)) = (in_i, for_i) { if fi > ii { fi } else { ts.len() } }
                        else if in_i.is_some() { ts.len() } else { ts.len() };
        let color = in_i.map(|ii| word_join(&ts[ii+1..color_end])).unwrap_or_default();
        let (frames, unit) = if let Some(fi) = for_i { duration_tail(&ts[fi+1..]) } else { (Expr::Lit(LitVal::Num(30.0)), "frames".to_string()) };
        let color = if color.is_empty() { "orange".to_string() } else { color };
        let marker = marker_i.map(|mi| ts[mi].sval().to_string()).unwrap_or_default();
        return Stmt::Emit { rate, x, y, rf, marker, color, frames, unit };
    }
    // -- tween X.y from A to B over N [seconds|frames] [ease in|out|in out|bounce] --
    if first=="tween" {
        let kw = |w: &str| ts.iter().enumerate().position(|(i,t)| i > 1 && t.is_word(w));
        let from_i = kw("from"); let to_i = kw("to"); let over_i = kw("over"); let ease_i = kw("ease");
        let end = |a: usize, b: usize| if b > a { b } else { ts.len() };
        let t_end = from_i.unwrap_or(end(0, to_i.unwrap_or(0)));
        let target = tokens_to_ref(&ts[1..t_end]);
        let from = from_i.map(|fi| parse_expr(&ts[fi+1..end(fi, to_i.unwrap_or(0))])).unwrap_or(Expr::Lit(LitVal::Num(0.0)));
        let to = to_i.map(|ti| parse_expr(&ts[ti+1..end(ti, over_i.unwrap_or(0))])).unwrap_or(Expr::Lit(LitVal::Num(0.0)));
        let (frames, unit) = over_i.map(|oi| {
            let stop = if ease_i.map(|e| e > oi).unwrap_or(false) { ease_i.unwrap() } else { ts.len() };
            duration_tail(&ts[oi+1..stop])
        }).unwrap_or((Expr::Lit(LitVal::Num(60.0)), "frames".to_string()));
        let ease = ease_i.map(|ei| word_join(&ts[ei+1..]).to_lowercase()).unwrap_or_default();
        return Stmt::Tween { target, from, to, frames, unit, ease };
    }
    if first=="burst" {
        if let Some(ai)=find_word(ts,"at") { if ai>1 {
            let ii = ts.iter().enumerate().position(|(k,t)| k>ai && t.is_word("in"));
            let place_end = ii.unwrap_or(ts.len());
            let place = &ts[ai+1..place_end];
            let color = ii.map(|k| ts[k+1..].iter().map(|t| t.sval().to_string()).collect::<Vec<_>>().join(" "));
            let count_end = core::cmp::max(2, ai.saturating_sub(1)).min(ai);
            let count = parse_expr(&ts[1..count_end]);
            if let Some(ci)=place.iter().position(|t| t.t==6) { if ci>0 {
                return Stmt::Burst(count, Some(parse_expr(&place[..ci])), Some(parse_expr(&place[ci+1..])), None, color);
            }}
            return Stmt::Burst(count, None, None, Some(parse_expr(place)), color);
        }}
    }
    if first=="draw" { return parse_draw(ts); }
    if first=="pset" { return parse_pset(ts); }
    if first=="write" { return parse_write(ts); }
    // `say "text"` / `say <expr>` — a script-mode line (host paints the buffer when
    // there is no game loop, exactly like the JS core's sayBuffer)
    if first=="say" {
        let text = if ts.len()>=2 && ts[1].t==1 { Expr::Lit(LitVal::Str(ts[1].sval().to_string())) }
                   else { parse_expr(safe(ts,1,ts.len())) };
        return Stmt::Say(text);
    }
    if first=="each" { return parse_each(ts); }
    if first=="run" && ts.len()>=2 && ts[1].is_word("game") {
        let funcs: Vec<String> = ts[2..].iter().filter(|t| t.t==3 && t.sval()!="with" && t.sval()!="and").map(|t| t.sval().to_string()).collect();
        return Stmt::RunGame(funcs);
    }
    if first=="follow" { return Stmt::Follow(ts.get(1).map(|t| t.sval().to_string()).unwrap_or_default()); }
    if first=="go" {
        if ts.len()>=2 && ts[1].is_word("back") { return Stmt::GoBack; }
        if ts.len()>=3 && ts[1].is_word("to") { return Stmt::Goto(ts[2].sval().to_string()); }
    }
    if first=="move" && ts.len()>=2 {
        let target = ts[1].sval().to_string();
        if find_word(ts,"arrows").is_some() {
            let speed = find_word(ts,"speed").map(|k| parse_expr(&ts[k+1..]));
            return Stmt::MoveArrows(target, speed);
        }
        if let Some(byk)=find_word(ts,"by") {
            let mut rest_end = ts.len(); let mut blocked = None;
            if let Some(bk)=find_word(ts,"blocked") { rest_end = bk; if let Some(t)=ts.get(bk+2) { blocked = Some(t.sval().to_string()); } }
            let segs = split_top_commas(&ts[byk+1..rest_end]);
            let dx = parse_expr(segs.get(0).copied().unwrap_or(&[]));
            let dy = if segs.len()>1 { parse_expr(segs[1]) } else { Expr::Lit(LitVal::Num(0.0)) };
            return Stmt::MoveBy(target, dx, dy, blocked);
        }
    }
    if first=="define" && ts.len()>=2 && ts[1].is_word("sound") { return parse_def_sfx(ts); }
    if first=="play" && ts.len()>=3 { return Stmt::PlaySound(ts[1].sval().to_string(), ts[2].sval().to_string()); }
    if first=="show" && ts.len()>=2 && ts[1].is_word("button") { return parse_button(ts); }
    if first=="show" && ts.len()>=2 && ts[1].is_word("meter") { return parse_meter(ts); }
    if first=="damage" || first=="heal" {
        let (target, mut astart) = match ts.get(1) { Some(t) if t.t==3 && !t.is_word("by") => (t.sval().to_string(), 2), _ => ("player".to_string(), 1) };
        if ts.get(astart).map(|t| t.is_word("by")).unwrap_or(false) { astart += 1; }
        let amount = if astart < ts.len() { parse_expr(&ts[astart..]) } else { Expr::Lit(LitVal::Num(1.0)) };
        return if first=="damage" { Stmt::Damage(target, amount) } else { Stmt::Heal(target, amount) };
    }
    if first=="knock" {
        let target = ts.get(1).filter(|t| t.t==3).map(|t| t.sval().to_string()).unwrap_or_else(|| "player".to_string());
        let source = if let Some(k)=find_word(ts,"from") { ts.get(k+1).map(|t| t.sval().to_string()).unwrap_or_else(|| "enemy".to_string()) } else { "enemy".to_string() };
        let distance = if let Some(k)=find_word(ts,"distance") { parse_expr(&ts[k+1..]) } else { Expr::Lit(LitVal::Num(4.0)) };
        return Stmt::Knock(target, source, distance);
    }
    if first=="broadcast" { return Stmt::Broadcast(parse_expr(&ts[1..])); }
    if first=="join" { return Stmt::NetJoin(string_after(ts,"game"), string_after(ts,"room")); }
    if first=="return" { if ts.len()>1 { return Stmt::Return(Some(parse_expr(&ts[1..]))); } return Stmt::Return(None); }
    if first=="stop" && ts.len()==1 { return Stmt::Stop; }
    // `stop music` / `stop sound` -> stop_music (the JS parser maps both to one node)
    if first=="stop" && ts.len()>=2 && (ts[1].is_word("music") || ts[1].is_word("sound")) { return Stmt::StopSound; }
    if first=="jump" {
        let target = ts.get(1).filter(|t| t.t==3 && !t.is_word("by")).map(|t| t.sval().to_string()).unwrap_or_else(|| "player".to_string());
        let force = ts.iter().skip(1).find_map(|t| if let TokVal::Num(n)=t.v { Some(n) } else { None }).unwrap_or(4.5);
        return Stmt::Jump(target, force);
    }
    if first=="reverse" && ts.len()>=2 {
        let name = tokens_to_ref(&ts[1..]);
        return Stmt::Assign(name.clone(), Expr::Math("-".to_string(), Box::new(Expr::Lit(LitVal::Num(0.0))), Box::new(Expr::Ref(name))));
    }
    if let Some(k)=find_word(ts,"are") { return Stmt::Tag(tokens_to_ref(&ts[..k]), word_join(&ts[k+1..]).to_lowercase()); }
    if let Some(k)=find_word(ts,"is") { return Stmt::Assign(tokens_to_ref(&ts[..k]), parse_expr(&ts[k+1..])); }
    call_fallback(ts)
}
fn parse_repeat(ts: &[Tok]) -> Stmt {
    if ts.len()>=2 && ts[1].is_word("with") {
        let var = ts.get(2).map(|t| t.sval().to_string()).unwrap_or_default();
        if let (Some(fi), Some(ti)) = (find_word(ts,"from"), find_word(ts,"to")) {
            return Stmt::RepeatRange(var, parse_expr(&ts[fi+1..ti]), parse_expr(&ts[ti+1..]), Vec::new());
        }
    }
    if ts.len()>=2 && ts[1].is_word("while") { return Stmt::RepeatWhile(parse_cond(&ts[2..]), Vec::new()); }
    if ts.len()>=2 && ts[1].is_word("until") { return Stmt::RepeatUntil(parse_cond(&ts[2..]), Vec::new()); }
    if let Some(k)=find_word(ts,"times") { return Stmt::RepeatTimes(parse_expr(&ts[1..k]), Vec::new()); }
    Stmt::Forever(Vec::new())
}
fn parse_when(ts: &[Tok]) -> Stmt {
    let has = |w: &str| ts.iter().any(|t| t.is_word(w));
    let last = || ts.last().map(|t| t.sval().to_string()).unwrap_or_default();
    let first_str = || ts.iter().find(|t| t.t==1).map(|t| t.sval().to_string()).unwrap_or_default();
    let inline_after = |w: &str| ts.iter().position(|t| t.is_word(w)).and_then(|k| if k+1 < ts.len() { Some(Box::new(parse_line(&ts[k+1..]))) } else { None });
    if has("time") && has("runs") && has("out") { return Stmt::WhenTimeout(inline_after("out"), Vec::new()); }
    if has("picks") && has("up") { return Stmt::WhenPickup(last(), Vec::new()); }
    if has("hits") { return Stmt::WhenHit(last(), Vec::new()); }
    if has("defeated") { return Stmt::WhenDefeat(ts.get(1).map(|t| t.sval().to_string()).unwrap_or_default(), Vec::new()); }
    if has("mouse") {
        // 'when mouse is EVENT' — checked before pressed/clicked since those words follow 'is'
        let event = ts.iter().position(|t| t.is_word("is")).and_then(|i| ts.get(i+1)).map(|t| t.sval().to_string()).unwrap_or_default();
        let then = ts.iter().position(|t| t.is_word("is")).and_then(|i| if i+2 < ts.len() { Some(Box::new(parse_line(&ts[i+2..]))) } else { None });
        return Stmt::WhenMouse(event, then, Vec::new());
    }
    if has("button") && has("clicked") { return Stmt::WhenButton(first_str(), inline_after("clicked"), Vec::new()); }
    if has("pressed") { return Stmt::WhenKey(first_str(), inline_after("pressed"), Vec::new()); }
    call_fallback(ts)
}
fn set_body(s: &mut Stmt, body: Vec<Stmt>) {
    match s { Stmt::FuncDef(_,_,b)|Stmt::If(_,_,b)|Stmt::ElseIf(_,_,b)|Stmt::Else(b)
        |Stmt::RepeatTimes(_,b)|Stmt::RepeatRange(_,_,_,b)|Stmt::RepeatWhile(_,b)|Stmt::RepeatUntil(_,b)
        |Stmt::Forever(b)|Stmt::With(b)|Stmt::Every(_,_,b,_)|Stmt::WhenPickup(_,b)|Stmt::WhenHit(_,b)|Stmt::WhenDefeat(_,b)
        |Stmt::WhenKey(_,_,b)|Stmt::WhenButton(_,_,b)|Stmt::WhenMouse(_,_,b)|Stmt::WhenTimeout(_,b)|Stmt::Each(_,_,_,_,b) => *b=body, _=>{} }
}
struct Line { indent: u32, toks: Vec<Tok> }
// Rewrite `its <field>` -> `<subj> . <field>` inside a `with` block (dot = token type 5).
fn rewrite_its(toks: &[Tok], subj: &[Tok]) -> Vec<Tok> {
    let mut out: Vec<Tok> = Vec::new();
    for k in 0..toks.len() {
        if toks[k].is_word("its") {
            for st in subj { out.push(st.clone()); }
            if toks.get(k+1).map(|t| t.t==3).unwrap_or(false) { out.push(Tok { t: 5, v: TokVal::Str(".".to_string()) }); }
        } else { out.push(toks[k].clone()); }
    }
    out
}
fn parse_block(lines: &[Line], start: usize, min_indent: u32, subj: Option<&[Tok]>) -> Vec<Stmt> {
    let mut out = Vec::new(); let mut i = start;
    while i < lines.len() && lines[i].indent >= min_indent {
        if lines[i].indent > min_indent { i += 1; continue; }
        let toks: Vec<Tok> = match subj { Some(s) => rewrite_its(&lines[i].toks, s), None => lines[i].toks.clone() };
        let mut stmt = parse_line(&toks);
        let mut j = i + 1;
        while j < lines.len() && lines[j].indent > min_indent { j += 1; }
        if j > i + 1 {
            if let Stmt::MapDef(rows) = &mut stmt {
                for l in &lines[i+1..j] {
                    if l.toks.len()==1 && l.toks[0].t==1 { rows.push(l.toks[0].sval().to_string()); }
                }
            } else {
                let child_subj: Option<&[Tok]> = if matches!(stmt, Stmt::With(_)) { Some(&toks[1..]) } else { subj };
                let body = parse_block(lines, i+1, min_indent+1, child_subj);
                set_body(&mut stmt, body);
            }
        }
        out.push(stmt);
        i = if j > i + 1 { j } else { i + 1 };
    }
    out
}
static mut EVERY_ID: u32 = 0;   // monotonic id source for `every` statements (reset per program)
fn parse_program(src: &[u8]) -> Vec<Stmt> {
    unsafe { EVERY_ID = 0; }
    let mut lines: Vec<Line> = Vec::new();
    for raw in src.split(|&b| b == b'\n') {
        let (indent, toks) = lex_line(raw);
        if toks.is_empty() { continue; }
        lines.push(Line { indent, toks });
    }
    // two-pass: collect user function names so they count as command words in the
    // parseIf / splitOnAnd boundary checks.
    unsafe {
        // Fresh Vec, NOT clear(): the previous program's buffer points into arena
        // memory that reset_arena() has since recycled — reusing it corrupts this parse.
        UFUNCS = Vec::new();
        for ln in &lines {
            let t = &ln.toks;
            if t.len() >= 2 && t[0].is_word("to") {
                if t.len() >= 3 && t[1].is_word("screen") { UFUNCS.push(format!("screen_{}", t[2].sval().to_lowercase())); }
                else if t[1].t == 3 { UFUNCS.push(t[1].sval().to_lowercase()); }
            }
        }
    }
    parse_block(&lines, 0, 0, None)
}

// --- JSON emission (contract: sorted keys, no lineNum, ints w/o decimal, null) ---
fn json_str(s: &str, out: &mut String) {
    out.push('"');
    for c in s.chars() { match c {
        '"'=>out.push_str("\\\""), '\\'=>out.push_str("\\\\"),
        '\n'=>out.push_str("\\n"), '\r'=>out.push_str("\\r"), '\t'=>out.push_str("\\t"),
        c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
        c => out.push(c) } }
    out.push('"');
}
fn json_num(n: f64, out: &mut String) {
    // NaN/Infinity -> null, matching JSON.stringify (JSON has no NaN literal).
    if n != n || n == f64::INFINITY || n == f64::NEG_INFINITY { out.push_str("null"); return; }
    // no_std: f64::fract/abs/is_finite are std-only, so test integrality via i64 round-trip.
    if n >= -9e15 && n <= 9e15 { let i = n as i64; if i as f64 == n { out.push_str(&format!("{}", i)); return; } }
    out.push_str(&format!("{}", n));
}
fn emit_lit(l: &LitVal, out: &mut String) {
    out.push_str("{\"type\":\"literal\",\"value\":");
    match l { LitVal::Num(n)=>json_num(*n,out), LitVal::Str(s)=>json_str(s,out), LitVal::Bool(b)=>out.push_str(if *b {"true"} else {"false"}) }
    out.push('}');
}
fn emit_expr(e: &Expr, out: &mut String) {
    match e {
        Expr::Lit(l)=>emit_lit(l,out),
        Expr::Ref(n)=>{ out.push_str("{\"name\":"); json_str(n,out); out.push_str(",\"type\":\"ref\"}"); }
        Expr::Math(op,l,r)=>{ out.push_str("{\"left\":"); emit_expr(l,out); out.push_str(",\"op\":"); json_str(op,out); out.push_str(",\"right\":"); emit_expr(r,out); out.push_str(",\"type\":\"math\"}"); }
        Expr::ListLit(items)=>{ out.push_str("{\"items\":["); for (i,e) in items.iter().enumerate(){ if i>0 {out.push(',');} emit_expr(e,out);} out.push_str("],\"type\":\"listliteral\"}"); }
        Expr::Random(m)=>{ out.push_str("{\"max\":"); emit_expr(m,out); out.push_str(",\"type\":\"random\"}"); }
        Expr::Load(k)=>{ out.push_str("{\"key\":"); emit_expr(k,out); out.push_str(",\"type\":\"load\"}"); }
        Expr::SolidAt(x,y)=>{ out.push_str("{\"type\":\"solid_at\",\"x\":"); emit_expr(x,out); out.push_str(",\"y\":"); emit_expr(y,out); out.push('}'); }
        Expr::ItemOf(idx,l)=>{ out.push_str("{\"index\":"); emit_expr(idx,out); out.push_str(",\"list\":"); emit_expr(l,out); out.push_str(",\"type\":\"item_of\"}"); }
        Expr::Object(props)=>{ out.push_str("{\"props\":{");
            let mut kv: Vec<&(String,Expr)> = props.iter().collect(); kv.sort_by(|a,b| a.0.as_str().cmp(b.0.as_str()));
            for (i,(k,v)) in kv.iter().enumerate() { if i>0 {out.push(',');} json_str(k,out); out.push(':'); emit_expr(v,out); }
            out.push_str("},\"type\":\"object_expr\"}"); }
        Expr::Sprite(pos,props)=>{ out.push_str("{\"position\":"); json_str(pos,out); out.push_str(",\"props\":"); emit_expr(props,out); out.push_str(",\"type\":\"sprite_expr\"}"); }
        Expr::ListOfSprites(c,p)=>{ out.push_str("{\"count\":"); emit_expr(c,out); out.push_str(",\"props\":"); emit_expr(p,out); out.push_str(",\"type\":\"list_of_sprites\"}"); }
        Expr::Count(e)=>{ out.push_str("{\"expr\":"); emit_expr(e,out); out.push_str(",\"type\":\"count\"}"); }
    }
}
fn expr_json(e: &Expr) -> String { let mut s = String::new(); emit_expr(e, &mut s); s }
fn emit_then(t: &Option<Box<Stmt>>, out: &mut String) { match t { Some(s)=>emit_stmt(s,out), None=>out.push_str("null") } }
fn emit_cond(c: &Cond, out: &mut String) {
    match c {
        Cond::Or(a,b)=>{ out.push_str("{\"left\":"); emit_cond(a,out); out.push_str(",\"right\":"); emit_cond(b,out); out.push_str(",\"type\":\"or\"}"); }
        Cond::And(a,b)=>{ out.push_str("{\"left\":"); emit_cond(a,out); out.push_str(",\"right\":"); emit_cond(b,out); out.push_str(",\"type\":\"and\"}"); }
        Cond::Not(a)=>{ out.push_str("{\"expr\":"); emit_cond(a,out); out.push_str(",\"type\":\"not\"}"); }
        Cond::NotExpr(e)=>{ out.push_str("{\"expr\":"); emit_expr(e,out); out.push_str(",\"type\":\"not\"}"); }
        Cond::Eq(l,r)=>{ out.push_str("{\"left\":"); emit_expr(l,out); out.push_str(",\"right\":"); emit_expr(r,out); out.push_str(",\"type\":\"eq\"}"); }
        Cond::Neq(l,r)=>{ out.push_str("{\"left\":"); emit_expr(l,out); out.push_str(",\"right\":"); emit_expr(r,out); out.push_str(",\"type\":\"neq\"}"); }
        Cond::Cmp(op,l,r)=>{ out.push_str("{\"left\":"); emit_expr(l,out); out.push_str(",\"op\":"); json_str(op,out); out.push_str(",\"right\":"); emit_expr(r,out); out.push_str(",\"type\":\"cmp\"}"); }
        Cond::Has(l,r)=>{ out.push_str("{\"left\":"); emit_expr(l,out); out.push_str(",\"right\":"); emit_expr(r,out); out.push_str(",\"type\":\"has\"}"); }
        Cond::InvHas(subject,item)=>{ out.push_str("{\"item\":"); emit_expr(item,out); out.push_str(",\"subject\":"); json_str(subject,out); out.push_str(",\"type\":\"inv_has\"}"); }
        Cond::In(v,l)=>{ out.push_str("{\"list\":"); emit_expr(l,out); out.push_str(",\"type\":\"in\",\"value\":"); emit_expr(v,out); out.push('}'); }
        Cond::Bare(e)=>emit_expr(e,out),
        Cond::Key(k)=>{ out.push_str("{\"key\":"); json_str(k,out); out.push_str(",\"type\":\"key_pressed\"}"); }
    }
}
fn emit_tok(t: &Tok, out: &mut String) {
    out.push_str("{\"type\":\""); out.push_str(tname(t.t)); out.push_str("\",\"value\":");
    match &t.v { TokVal::Num(n)=>json_num(*n,out), TokVal::Str(s)=>json_str(s,out) }
    out.push('}');
}
fn emit_stmts(v: &[Stmt], out: &mut String) {
    out.push('[');
    for (i,s) in v.iter().enumerate() { if i>0 {out.push(',');} emit_stmt(s,out); }
    out.push(']');
}
fn emit_stmt(s: &Stmt, out: &mut String) {
    match s {
        Stmt::Assign(t,v)=>{ out.push_str("{\"target\":"); json_str(t,out); out.push_str(",\"type\":\"assign\",\"value\":"); emit_expr(v,out); out.push('}'); }
        Stmt::Add(t,v)=>{ out.push_str("{\"target\":"); json_str(t,out); out.push_str(",\"type\":\"add\",\"value\":"); emit_expr(v,out); out.push('}'); }
        Stmt::Remove(t,v)=>{ out.push_str("{\"target\":"); json_str(t,out); out.push_str(",\"type\":\"remove\",\"value\":"); emit_expr(v,out); out.push('}'); }
        Stmt::Simple(ty,t)=>{ out.push_str("{\"target\":"); json_str(t,out); out.push_str(",\"type\":\""); out.push_str(ty); out.push_str("\"}"); }
        Stmt::Call(n,args,arg_exprs)=>{ out.push_str("{\"args\":["); for (i,a) in args.iter().enumerate() { if i>0 {out.push(',');} emit_tok(a,out); } out.push_str("],\"argExprs\":["); for (i,e) in arg_exprs.iter().enumerate() { if i>0 {out.push(',');} emit_expr(e,out); } out.push_str("],\"name\":"); json_str(n,out); out.push_str(",\"type\":\"call\"}"); }
        Stmt::FuncDef(n,params,body)=>{ out.push_str("{\"body\":"); emit_stmts(body,out); out.push_str(",\"name\":"); json_str(n,out); out.push_str(",\"params\":["); for (i,p) in params.iter().enumerate() { if i>0 {out.push(',');} json_str(p,out); } out.push_str("],\"type\":\"funcdef\"}"); }
        Stmt::If(c,then,body)=>{ out.push_str("{\"body\":"); emit_stmts(body,out); out.push_str(",\"condition\":"); emit_cond(c,out); out.push_str(",\"thenStmt\":"); emit_then(then,out); out.push_str(",\"type\":\"if\"}"); }
        Stmt::ElseIf(c,then,body)=>{ out.push_str("{\"body\":"); emit_stmts(body,out); out.push_str(",\"condition\":"); emit_cond(c,out); out.push_str(",\"thenStmt\":"); emit_then(then,out); out.push_str(",\"type\":\"else_if\"}"); }
        Stmt::Else(body)=>{ out.push_str("{\"body\":"); emit_stmts(body,out); out.push_str(",\"type\":\"else\"}"); }
        Stmt::RepeatTimes(c,b)=>{ out.push_str("{\"body\":"); emit_stmts(b,out); out.push_str(",\"count\":"); emit_expr(c,out); out.push_str(",\"type\":\"repeat_times\"}"); }
        Stmt::RepeatRange(v,f,t,b)=>{ out.push_str("{\"body\":"); emit_stmts(b,out); out.push_str(",\"from\":"); emit_expr(f,out); out.push_str(",\"to\":"); emit_expr(t,out); out.push_str(",\"type\":\"repeat_range\",\"varName\":"); json_str(v,out); out.push('}'); }
        Stmt::RepeatWhile(c,b)=>{ out.push_str("{\"body\":"); emit_stmts(b,out); out.push_str(",\"condition\":"); emit_cond(c,out); out.push_str(",\"type\":\"repeat_while\"}"); }
        Stmt::RepeatUntil(c,b)=>{ out.push_str("{\"body\":"); emit_stmts(b,out); out.push_str(",\"condition\":"); emit_cond(c,out); out.push_str(",\"type\":\"repeat_until\"}"); }
        Stmt::Forever(b)=>{ out.push_str("{\"body\":"); emit_stmts(b,out); out.push_str(",\"type\":\"forever\"}"); }
        Stmt::With(b)=>{ out.push_str("{\"body\":"); emit_stmts(b,out); out.push_str(",\"type\":\"with\"}"); }
        Stmt::Every(n,u,b,_)=>{ out.push_str("{\"body\":"); emit_stmts(b,out); out.push_str(",\"n\":"); json_num(*n,out); out.push_str(",\"type\":\"every\",\"unit\":"); json_str(u,out); out.push('}'); }
        Stmt::Tag(s,t)=>{ out.push_str("{\"subject\":"); json_str(s,out); out.push_str(",\"tag\":"); json_str(t,out); out.push_str(",\"type\":\"tag\"}"); }
        Stmt::WhenPickup(iv,b)=>{ out.push_str("{\"body\":"); emit_stmts(b,out); out.push_str(",\"itemVar\":"); json_str(iv,out); out.push_str(",\"thenStmt\":null,\"type\":\"when_pickup\"}"); }
        Stmt::WhenHit(iv,b)=>{ out.push_str("{\"body\":"); emit_stmts(b,out); out.push_str(",\"itemVar\":"); json_str(iv,out); out.push_str(",\"thenStmt\":null,\"type\":\"when_hit\"}"); }
        Stmt::WhenDefeat(iv,b)=>{ out.push_str("{\"body\":"); emit_stmts(b,out); out.push_str(",\"itemVar\":"); json_str(iv,out); out.push_str(",\"thenStmt\":null,\"type\":\"when_defeat\"}"); }
        Stmt::WhenKey(k,then,b)=>{ out.push_str("{\"body\":"); emit_stmts(b,out); out.push_str(",\"key\":"); json_str(k,out); out.push_str(",\"thenStmt\":"); emit_then(then,out); out.push_str(",\"type\":\"when_key\"}"); }
        Stmt::WhenTimeout(then,b)=>{ out.push_str("{\"body\":"); emit_stmts(b,out); out.push_str(",\"thenStmt\":"); emit_then(then,out); out.push_str(",\"type\":\"when_timeout\"}"); }
        Stmt::Flash(color,f,u)=>{ out.push_str("{\"color\":"); json_str(color,out); out.push_str(",\"frames\":"); emit_expr(f,out); out.push_str(",\"type\":\"flash\",\"unit\":"); json_str(u,out); out.push('}'); }
        Stmt::Inventory(subject)=>{ out.push_str("{\"subject\":"); json_str(subject,out); out.push_str(",\"type\":\"inventory\"}"); }
        Stmt::InvAdd(subject,item)=>{ out.push_str("{\"item\":"); emit_expr(item,out); out.push_str(",\"subject\":"); json_str(subject,out); out.push_str(",\"type\":\"inv_add\"}"); }
        Stmt::InvRemove(subject,item)=>{ out.push_str("{\"item\":"); emit_expr(item,out); out.push_str(",\"subject\":"); json_str(subject,out); out.push_str(",\"type\":\"inv_remove\"}"); }
        Stmt::Tween{target,from,to,frames,unit,ease}=>{
            out.push_str("{\"ease\":"); json_str(ease,out);
            out.push_str(",\"from\":"); emit_expr(from,out);
            out.push_str(",\"frames\":"); emit_expr(frames,out);
            out.push_str(",\"target\":"); json_str(target,out);
            out.push_str(",\"to\":"); emit_expr(to,out);
            out.push_str(",\"type\":\"tween\",\"unit\":"); json_str(unit,out);
            out.push('}');
        }
        Stmt::Emit{rate,x,y,rf,marker,color,frames,unit}=>{
            out.push_str("{\"color\":"); json_str(color,out);
            out.push_str(",\"frames\":"); emit_expr(frames,out);
            out.push_str(",\"marker\":"); json_str(marker,out);
            out.push_str(",\"rate\":"); emit_expr(rate,out);
            out.push_str(",\"ref\":"); match rf { Some(r)=>json_str(r,out), None=>out.push_str("null") }
            out.push_str(",\"type\":\"emit\",\"unit\":"); json_str(unit,out);
            out.push_str(",\"x\":"); match x { Some(e)=>emit_expr(e,out), None=>out.push_str("null") }
            out.push_str(",\"y\":"); match y { Some(e)=>emit_expr(e,out), None=>out.push_str("null") }
            out.push('}');
        }
        Stmt::Shake(f,u,m)=>{ out.push_str("{\"frames\":"); emit_expr(f,out); out.push_str(",\"magnitude\":"); emit_expr(m,out); out.push_str(",\"type\":\"shake\",\"unit\":"); json_str(u,out); out.push('}'); }
        Stmt::TimeLimit(v,u)=>{ out.push_str("{\"type\":\"time_limit\",\"unit\":"); json_str(u,out); out.push_str(",\"value\":"); emit_expr(v,out); out.push('}'); }
        Stmt::WhenButton(l,then,b)=>{ out.push_str("{\"body\":"); emit_stmts(b,out); out.push_str(",\"label\":"); json_str(l,out); out.push_str(",\"thenStmt\":"); emit_then(then,out); out.push_str(",\"type\":\"when_button\"}"); }
        Stmt::WhenMouse(ev,then,b)=>{ out.push_str("{\"body\":"); emit_stmts(b,out); out.push_str(",\"event\":"); json_str(ev,out); out.push_str(",\"thenStmt\":"); emit_then(then,out); out.push_str(",\"type\":\"when_mouse\"}"); }
        Stmt::Say(e)=>{ out.push_str("{\"text\":"); emit_expr(e,out); out.push_str(",\"type\":\"say\"}"); }
        Stmt::ClearScreen(c)=>{ out.push_str("{\"color\":"); json_str(c,out); out.push_str(",\"type\":\"clearscreen\"}"); }
        Stmt::Draw(a)=>{
            out.push_str("{\"args\":{");
            let mut kv: Vec<(&str, String)> = Vec::new();
            if let Some(c)=&a.color { let mut s=String::new(); json_str(c,&mut s); kv.push(("color", s)); }
            if let Some(e)=&a.h { kv.push(("h", expr_json(e))); }
            if let Some(s)=&a.sprite_name { let mut j=String::new(); json_str(s,&mut j); kv.push(("spriteName", j)); }
            if let Some(e)=&a.sprite_name_expr { kv.push(("spriteNameExpr", expr_json(e))); }
            if let Some(e)=&a.w { kv.push(("w", expr_json(e))); }
            if let Some(e)=&a.x { kv.push(("x", expr_json(e))); }
            if let Some(e)=&a.x1 { kv.push(("x1", expr_json(e))); }
            if let Some(e)=&a.x2 { kv.push(("x2", expr_json(e))); }
            if let Some(e)=&a.y { kv.push(("y", expr_json(e))); }
            if let Some(e)=&a.y1 { kv.push(("y1", expr_json(e))); }
            if let Some(e)=&a.y2 { kv.push(("y2", expr_json(e))); }
            kv.sort_by(|p,q| p.0.cmp(q.0));
            for (i,(k,v)) in kv.iter().enumerate() { if i>0 {out.push(',');} json_str(k,out); out.push(':'); out.push_str(v); }
            out.push_str("},\"hud\":"); out.push_str(if a.hud {"true"} else {"false"});
            out.push_str(",\"shape\":"); json_str(&a.shape,out); out.push_str(",\"type\":\"draw\"}");
        }
        Stmt::Pset(x,y,color)=>{
            out.push_str("{\"color\":"); json_str(color,out);
            out.push_str(",\"type\":\"pset\",\"x\":"); emit_expr(x,out);
            out.push_str(",\"y\":"); emit_expr(y,out); out.push('}');
        }
        Stmt::Write(w)=>{
            out.push('{'); let mut sep=false;
            if let Some(c)=&w.color { out.push_str("\"color\":"); json_str(c,out); sep=true; }
            if sep { out.push(','); } out.push_str("\"hud\":"); out.push_str(if w.hud {"true"} else {"false"});
            out.push_str(",\"text\":"); emit_expr(&w.text,out); out.push_str(",\"type\":\"write\"");
            if let Some(e)=&w.x { out.push_str(",\"x\":"); emit_expr(e,out); }
            if let Some(e)=&w.y { out.push_str(",\"y\":"); emit_expr(e,out); }
            out.push('}');
        }
        Stmt::Each(var,list,wc,then,b)=>{
            out.push_str("{\"body\":"); emit_stmts(b,out); out.push_str(",\"list\":"); emit_expr(list,out);
            out.push_str(",\"thenStmt\":"); emit_then(then,out);
            out.push_str(",\"type\":\"each\",\"varName\":"); json_str(var,out);
            out.push_str(",\"where\":"); match wc { Some(c)=>emit_cond(c,out), None=>out.push_str("null") }
            out.push('}');
        }
        Stmt::RunGame(fs)=>{ out.push_str("{\"funcs\":["); for (i,f) in fs.iter().enumerate() { if i>0 {out.push(',');} json_str(f,out); } out.push_str("],\"type\":\"rungame\"}"); }
        Stmt::Follow(t)=>{ out.push_str("{\"target\":"); json_str(t,out); out.push_str(",\"type\":\"follow\"}"); }
        Stmt::Goto(t)=>{ out.push_str("{\"target\":"); json_str(t,out); out.push_str(",\"type\":\"goto\"}"); }
        Stmt::GoBack=>{ out.push_str("{\"type\":\"goback\"}"); }
        Stmt::MoveArrows(t,sp)=>{ out.push_str("{\"speed\":"); match sp { Some(e)=>emit_expr(e,out), None=>out.push_str("null") } out.push_str(",\"target\":"); json_str(t,out); out.push_str(",\"type\":\"move_with_arrows\"}"); }
        Stmt::MoveBy(t,dx,dy,bl)=>{ out.push_str("{\"blockedBy\":"); match bl { Some(s)=>json_str(s,out), None=>out.push_str("null") } out.push_str(",\"dx\":"); emit_expr(dx,out); out.push_str(",\"dy\":"); emit_expr(dy,out); out.push_str(",\"target\":"); json_str(t,out); out.push_str(",\"type\":\"move_by\"}"); }
        Stmt::PlaySound(k,n)=>{ out.push_str("{\"kind\":"); json_str(k,out); out.push_str(",\"name\":"); json_str(n,out); out.push_str(",\"type\":\"play_sound\"}"); }
        Stmt::Button(l,x,y)=>{ out.push_str("{\"label\":"); json_str(l,out); out.push_str(",\"type\":\"button\",\"x\":"); emit_expr(x,out); out.push_str(",\"y\":"); emit_expr(y,out); out.push('}'); }
        Stmt::Return(v)=>{ out.push_str("{\"type\":\"return\",\"value\":"); match v { Some(e)=>emit_expr(e,out), None=>out.push_str("null") } out.push('}'); }
        Stmt::StopSound=>{ out.push_str("{\"type\":\"stop_music\"}"); }
        Stmt::Stop=>{ out.push_str("{\"type\":\"stop\"}"); }
        Stmt::Jump(t,f)=>{ out.push_str("{\"force\":"); json_num(*f,out); out.push_str(",\"target\":"); json_str(t,out); out.push_str(",\"type\":\"jump\"}"); }
        Stmt::Broadcast(v)=>{ out.push_str("{\"type\":\"broadcast\",\"value\":"); emit_expr(v,out); out.push('}'); }
        Stmt::NetJoin(g,r)=>{ out.push_str("{\"game\":"); json_str(g,out); out.push_str(",\"room\":"); json_str(r,out); out.push_str(",\"type\":\"net_join\"}"); }
        Stmt::Knock(t,src,d)=>{ out.push_str("{\"distance\":"); emit_expr(d,out); out.push_str(",\"source\":"); json_str(src,out); out.push_str(",\"target\":"); json_str(t,out); out.push_str(",\"type\":\"knock\"}"); }
        Stmt::Damage(t,a)=>{ out.push_str("{\"amount\":"); emit_expr(a,out); out.push_str(",\"target\":"); json_str(t,out); out.push_str(",\"type\":\"damage\"}"); }
        Stmt::Heal(t,a)=>{ out.push_str("{\"amount\":"); emit_expr(a,out); out.push_str(",\"target\":"); json_str(t,out); out.push_str(",\"type\":\"heal\"}"); }
        Stmt::Save(v,k)=>{ out.push_str("{\"key\":"); emit_expr(k,out); out.push_str(",\"type\":\"save\",\"value\":"); emit_expr(v,out); out.push('}'); }
        Stmt::TileDef(c,p)=>{ out.push_str("{\"ch\":"); json_str(c,out); out.push_str(",\"props\":"); emit_expr(p,out); out.push_str(",\"type\":\"tile_def\"}"); }
        Stmt::MapDef(rows)=>{ out.push_str("{\"body\":["); for (i,r) in rows.iter().enumerate() { if i>0 {out.push(',');} out.push_str("{\"type\":\"literal\",\"value\":"); json_str(r,out); out.push('}'); } out.push_str("],\"type\":\"map_def\"}"); }
        Stmt::DrawMap=>{ out.push_str("{\"type\":\"draw_map\"}"); }
        Stmt::Behavior(b)=>{
            out.push_str("{\"kind\":"); json_str(&b.kind,out);
            out.push_str(",\"speed\":"); match &b.speed { Some(e)=>emit_expr(e,out), None=>out.push_str("null") }
            out.push_str(",\"subject\":"); json_str(&b.subject,out);
            if b.kind=="chase" { out.push_str(",\"target\":"); json_str(&b.target,out); }
            out.push_str(",\"through\":"); out.push_str(if b.through {"true"} else {"false"});
            out.push_str(",\"type\":\"behavior\"");
            if b.kind=="patrol" {
                out.push_str(",\"x1\":"); match &b.x1 { Some(e)=>emit_expr(e,out), None=>out.push_str("null") }
                out.push_str(",\"x2\":"); match &b.x2 { Some(e)=>emit_expr(e,out), None=>out.push_str("null") }
            }
            if b.kind=="flee" {
                out.push_str(",\"target\":"); json_str(&b.target,out);
                out.push_str(",\"within\":"); match &b.within { Some(e)=>emit_expr(e,out), None=>out.push_str("null") }
            }
            if b.kind=="patrol_points" {
                out.push_str(",\"points\":"); match &b.points { Some(e)=>emit_expr(e,out), None=>out.push_str("null") }
            }
            out.push('}');
        }
        Stmt::Animate(s2,f,e)=>{ out.push_str("{\"every\":"); json_num(*e,out); out.push_str(",\"frames\":["); for (i,x) in f.iter().enumerate() { if i>0 {out.push(',');} json_str(x,out); } out.push_str("],\"subject\":"); json_str(s2,out); out.push_str(",\"type\":\"animate\"}"); }
        Stmt::Burst(c,x,y,r,col)=>{
            out.push_str("{\"color\":"); match col { Some(cs)=>json_str(cs,out), None=>out.push_str("null") }
            out.push_str(",\"count\":"); emit_expr(c,out);
            if let Some(e)=r { out.push_str(",\"ref\":"); emit_expr(e,out); }
            out.push_str(",\"type\":\"burst\"");
            if let Some(e)=x { out.push_str(",\"x\":"); emit_expr(e,out); }
            if let Some(e)=y { out.push_str(",\"y\":"); emit_expr(e,out); }
            out.push('}');
        }
        Stmt::Meter(cur,mx,x,y,w,h,color)=>{ out.push_str("{\"color\":"); json_str(color,out); out.push_str(",\"current\":"); emit_expr(cur,out); out.push_str(",\"h\":"); emit_expr(h,out); out.push_str(",\"max\":"); emit_expr(mx,out); out.push_str(",\"type\":\"meter\",\"w\":"); emit_expr(w,out); out.push_str(",\"x\":"); emit_expr(x,out); out.push_str(",\"y\":"); emit_expr(y,out); out.push('}'); }
        Stmt::DefSfx(name,rec)=>{
            out.push_str("{\"name\":"); json_str(name,out); out.push_str(",\"recipe\":{");
            if rec.tone {
                out.push_str("\"dur\":"); json_num(rec.dur,out);
                out.push_str(",\"f0\":"); json_num(rec.f0,out);
                out.push_str(",\"f1\":"); match rec.f1 { Some(f)=>json_num(f,out), None=>out.push_str("null") }
                out.push_str(",\"kind\":\"tone\",\"wave\":"); json_str(&rec.wave,out);
            } else {
                out.push_str("\"dur\":"); json_num(rec.dur,out);
                out.push_str(",\"kind\":\"notes\",\"notes\":[");
                for (i,n) in rec.notes.iter().enumerate() { if i>0 {out.push(',');} json_num(*n,out); }
                out.push(']');
            }
            out.push_str("},\"type\":\"def_sfx\"}");
        }
    }
}

const SRC_CAP: usize = 65536;
const OUT_CAP: usize = 1 << 20;
static mut SRC: [u8; SRC_CAP] = [0; SRC_CAP];
static mut OUT: [u8; OUT_CAP] = [0; OUT_CAP];
#[no_mangle] pub extern "C" fn src_ptr() -> *const u8 { addr_of!(SRC) as *const u8 }
#[no_mangle] pub extern "C" fn out_ptr() -> *const u8 { addr_of!(OUT) as *const u8 }
#[no_mangle] pub extern "C" fn parse_to_json(len: u32) -> u32 {
    reset_arena();
    let n = (len as usize).min(SRC_CAP);
    let src = unsafe { core::slice::from_raw_parts(addr_of!(SRC) as *const u8, n) }.to_vec();
    let program = parse_program(&src);
    let mut s = String::new();
    emit_stmts(&program, &mut s);
    let bytes = s.as_bytes();
    let m = bytes.len().min(OUT_CAP);
    unsafe { let out = core::slice::from_raw_parts_mut(addr_of_mut!(OUT) as *mut u8, OUT_CAP); out[..m].copy_from_slice(&bytes[..m]); }
    m as u32
}

// --- game sub-parsers ---------------------------------------------------------
static mut UFUNCS: Vec<String> = Vec::new();
fn is_command_word(w: &str) -> bool {
    const CMDS: &[&str] = &["move","draw","write","say","add","remove","increase","decrease","clear","play","stop","jump",
        "walk","face","go","follow","run","when","repeat","every","each","toggle","double","halve",
        "broadcast","join","knock","damage","heal","show","pset","return","set","reverse","restore","block","to"];
    if CMDS.contains(&w) { return true; }
    unsafe { UFUNCS.iter().any(|f| f == w) }
}
fn word_join(ts: &[Tok]) -> String { let mut p: Vec<&str> = Vec::new(); for t in ts { p.push(t.sval()); } p.join(" ") }
// Join TOKEN VALUES with spaces, mirroring the JS `tokens.map(t => t.value).join(' ')`
// used for unquoted `write` text and color words. Numbers use JS String(n) form.
fn tok_text_join(ts: &[Tok]) -> String {
    let mut out = String::new();
    for (i, t) in ts.iter().enumerate() {
        if i > 0 { out.push(' '); }
        match &t.v { TokVal::Num(n) => json_num(*n, &mut out), TokVal::Str(s) => out.push_str(s) }
    }
    out
}
fn string_after(ts: &[Tok], w: &str) -> String {
    if let Some(k) = find_word(ts, w) { if let Some(t) = ts.get(k+1) { return t.sval().to_string(); } } String::new()
}
fn parse_object(ts: &[Tok]) -> Expr { // ts INCLUDING braces or inner; returns Object(props)
    let inner = if !ts.is_empty() && ts[0].t==11 {
        if ts[ts.len()-1].t==12 { &ts[1..ts.len()-1] } else { &ts[1..] }
    } else { ts };
    let mut props: Vec<(String, Expr)> = Vec::new();
    for seg in split_top_commas(inner) {
        if seg.is_empty() { continue; }
        // key is first word; ':' was dropped by the lexer, value = rest
        let key = seg[0].sval().to_string();
        props.push((key, parse_expr(&seg[1..])));
    }
    Expr::Object(props)
}
fn parse_if(ts: &[Tok], is_elseif: bool) -> Stmt {
    // locate where the condition ends and an inline statement begins (seenCompare heuristic)
    let mut cond_end = ts.len();
    let mut seen_compare = false;
    let mut i = 0;
    while i < ts.len() {
        let t = &ts[i];
        if t.t==4 && matches!(t.sval(), ">"|"<"|">="|"<="|"!="|"==") { seen_compare = true; }
        else if t.is_word("and") || t.is_word("or") { seen_compare = false; }
        else if t.is_word("is") {
            // walk back over the assignment target (dotted ref) before `is`
            let mut s = i;
            if s > 0 { s -= 1; while s >= 2 && ts[s-1].t==5 { s -= 2; } }
            if seen_compare {
                cond_end = s; break;       // `is` begins an inline assignment
            } else if s == 0 {
                seen_compare = true;       // target is the whole left -> this `is` is the comparison
            } else {
                let b = &ts[s-1];
                let continuation = b.t==4 || b.t==5 || b.is_word("of") || b.is_word("mod") || b.is_word("and") || b.is_word("or");
                if continuation { seen_compare = true; }
                else { cond_end = s; break; }  // self-contained boolean before -> split
            }
        } else if t.t==3 && i > 0 && is_command_word(t.sval()) {
            let p = &ts[i-1];
            if !(p.is_word("is")||p.is_word("not")||p.is_word("and")||p.is_word("or")||p.is_word("in")||p.is_word("between")) {
                cond_end = i; break;
            }
        }
        i += 1;
    }
    let cond = parse_cond(&ts[..cond_end]);
    let then = if cond_end < ts.len() { Some(Box::new(parse_line(&ts[cond_end..]))) } else { None };
    if is_elseif { Stmt::ElseIf(cond, then, Vec::new()) } else { Stmt::If(cond, then, Vec::new()) }
}
fn parse_pset(ts: &[Tok]) -> Stmt {
    // `pset x, y in color` — plot a single pixel (mirrors the JS parsePset).
    let in_idx = find_word(ts, "in").filter(|&k| k > 0);
    let end = in_idx.unwrap_or(ts.len());
    let seg = &ts[1..end];
    let (x, y) = if let Some(ci) = seg.iter().position(|t| t.t == 6) {
        (parse_expr(&seg[..ci]), parse_expr(&seg[ci+1..]))
    } else {
        (parse_expr(seg), Expr::Lit(LitVal::Num(0.0)))
    };
    let color = match in_idx {
        Some(k) => ts[k+1..].iter().map(|t| t.sval()).collect::<Vec<_>>().join(" "),
        None => "white".to_string(),
    };
    Stmt::Pset(x, y, color)
}
fn parse_draw(ts: &[Tok]) -> Stmt {
    let mut a = DrawArgs::default();
    // hud suffix: trailing 'on hud' / 'on screen'
    let mut end = ts.len();
    if end >= 2 && ts[end-2].is_word("on") && (ts[end-1].is_word("hud")||ts[end-1].is_word("screen")) { a.hud = true; end -= 2; }
    let body = &ts[1..end]; // after 'draw'
    let mut idx = 0;
    if !body.is_empty() && body[0].is_word("sprite") {
        a.shape = "sprite".to_string();
        // draw sprite NAME/EXPR  — name lowercased, spaces->_ ; here usually a string or ref
        idx = 1;
        // sprite name = the token(s) after 'sprite' up to 'at': a static name (string
        // or all-words) -> spriteName; a dotted/expr name (e.g. tree.image) -> spriteNameExpr
        let at = body.iter().position(|t| t.is_word("at")).unwrap_or(body.len());
        let nm = &body[idx..at];
        if nm.len()==1 && nm[0].t==1 { a.sprite_name = Some(nm[0].sval().to_lowercase()); }
        else if !nm.is_empty() { a.sprite_name_expr = Some(parse_expr(nm)); }
        idx = at;
    } else if !body.is_empty() {
        a.shape = body[0].sval().to_string(); // rect/circle/line
        idx = 1;
    }
    // landmark args from idx onward
    let mut j = idx;
    while j < body.len() {
        let kw = body[j].sval();
        let seg_start = j + 1;
        // collect tokens until next landmark word
        let mut k = seg_start;
        while k < body.len() && !matches!(body[k].sval(), "at"|"size"|"from"|"to"|"in") { k += 1; }
        let seg = &body[seg_start..k];
        match kw {
            "at" => { let p = split_top_commas(seg); a.x = p.get(0).map(|s| parse_expr(s)); a.y = p.get(1).map(|s| parse_expr(s)); }
            "size" => { let p = split_top_commas(seg); a.w = p.get(0).map(|s| parse_expr(s)); a.h = p.get(1).map(|s| parse_expr(s)).or_else(|| a.w.clone()); }
            "from" => { let p = split_top_commas(seg); a.x1 = p.get(0).map(|s| parse_expr(s)); a.y1 = p.get(1).map(|s| parse_expr(s)); }
            "to" => { let p = split_top_commas(seg); a.x2 = p.get(0).map(|s| parse_expr(s)); a.y2 = p.get(1).map(|s| parse_expr(s)); }
            "in" => { a.color = Some(word_join(seg)); }
            _ => {}
        }
        j = k;
    }
    Stmt::Draw(a)
}
fn parse_write(ts: &[Tok]) -> Stmt {
    let mut end = ts.len(); let mut hud = false;
    if end >= 2 && ts[end-2].is_word("on") && (ts[end-1].is_word("hud")||ts[end-1].is_word("screen")) { hud = true; end -= 2; }
    let body = &ts[1..end];
    let at = body.iter().position(|t| t.is_word("at"));
    let inw = body.iter().position(|t| t.is_word("in"));
    // Text is either a quoted string or the raw words up to `at` — bare tokens are
    // NOT evaluated as an expression (mirrors the JS parseWrite; `write <expr>` is
    // not fc: dynamic text is written as `write "{expr-var}" at …`).
    let text = if body.first().map(|t| t.t == 1).unwrap_or(false) {
        Expr::Lit(LitVal::Str(body[0].sval().to_string()))
    } else {
        match at { Some(k) if k > 0 => Expr::Lit(LitVal::Str(tok_text_join(&body[..k]))), _ => Expr::Lit(LitVal::Str(String::new())) }
    };
    let (mut x, mut y, mut color) = (None, None, None);
    if let Some(ak) = at { let stop = inw.filter(|&i| i>ak).unwrap_or(body.len()); let p = split_top_commas(&body[ak+1..stop]); x = p.get(0).map(|s| parse_expr(s)); y = p.get(1).map(|s| parse_expr(s)); }
    if let Some(ik) = inw { color = Some(word_join(&body[ik+1..])); }
    Stmt::Write(WriteArgs { text, x, y, color, hud })
}
fn safe<'a>(ts: &'a [Tok], a: usize, b: usize) -> &'a [Tok] { if a <= b && b <= ts.len() { &ts[a..b] } else { &[] } }
fn parse_meter(ts: &[Tok]) -> Stmt {
    // show meter CURRENT of MAX at x, y [size w, h] [in color]
    // Mirrors the JS parseMeter exactly, including its quirks:
    //  - keywords only count from index > 1
    //  - `size` needs a comma to take effect (a single value is ignored)
    //  - defaults: current→(expr) up to `of`/`at`, max 1, x/y 2, w/h 40x5, color green
    //  - the x,y segment stops at `size` OR `in`, whichever comes first
    let idx_of = |w: &str| ts.iter().enumerate().position(|(i, t)| i > 1 && t.is_word(w));
    let of_i = idx_of("of");
    let at_i = idx_of("at");
    let size_i = idx_of("size");
    let in_i = idx_of("in");
    let num = |v: f64| Expr::Lit(LitVal::Num(v));

    let cur_end = of_i.or(at_i).unwrap_or(ts.len());
    let current = parse_expr(safe(ts, 2, cur_end));
    let max = match of_i {
        Some(o) => parse_expr(safe(ts, o + 1, at_i.unwrap_or(ts.len()))),
        None => num(1.0),
    };

    let mut x = num(2.0);
    let mut y = num(2.0);
    if let Some(a) = at_i {
        let xy_end = match (size_i, in_i) {
            (Some(s), Some(i2)) => s.min(i2),
            (Some(s), None) => s,
            (None, Some(i2)) => i2,
            (None, None) => ts.len(),
        };
        let xy = split_top_commas(safe(ts, a + 1, xy_end));
        if xy.len() > 1 { x = parse_expr(xy[0]); y = parse_expr(xy[1]); }
        else if let Some(s0) = xy.get(0) { x = parse_expr(s0); }
    }

    let mut w = num(40.0);
    let mut h = num(5.0);
    if let Some(sz_i) = size_i {
        if in_i.map(|i2| i2 > sz_i).unwrap_or(true) {
            let sz = split_top_commas(safe(ts, sz_i + 1, in_i.unwrap_or(ts.len())));
            if sz.len() > 1 { w = parse_expr(sz[0]); h = parse_expr(sz[1]); }
        }
    }

    let color = match in_i { Some(i2) => word_join(&ts[i2 + 1..]), None => "green".to_string() };
    Stmt::Meter(current, max, x, y, w, h, color)
}
// Parse `N`, `N frames`, `N seconds` (and the singular words) into (expr, unit) —
// the same units every timed verb uses.
fn duration_tail(ts: &[Tok]) -> (Expr, String) {
    let mut body: &[Tok] = ts;
    let mut unit = "frames";
    if let Some(last) = body.last() {
        if last.is_word("seconds") || last.is_word("second") { unit = "seconds"; body = &body[..body.len()-1]; }
        else if last.is_word("frames") || last.is_word("frame") { body = &body[..body.len()-1]; }
    }
    (parse_expr(body), unit.to_string())
}
fn parse_button(ts: &[Tok]) -> Stmt {
    // show button "label" at X, Y
    let label = ts.iter().find(|t| t.t==1).map(|t| t.sval().to_string()).unwrap_or_default();
    let (mut x, mut y) = (Expr::Lit(LitVal::Num(0.0)), Expr::Lit(LitVal::Num(0.0)));
    if let Some(ak) = find_word(ts, "at") { let p = split_top_commas(&ts[ak+1..]); if let Some(s)=p.get(0) { x = parse_expr(s); } if let Some(s)=p.get(1) { y = parse_expr(s); } }
    Stmt::Button(label, x, y)
}
fn parse_each(ts: &[Tok]) -> Stmt {
    // each VAR in LIST [where COND] [INLINE-STMT]
    let var = ts.get(1).map(|t| t.sval().to_string()).unwrap_or_default();
    let in_i = find_word(ts, "in").unwrap_or(1);
    // list ends at 'where' or the first command word
    let mut list_end = ts.len();
    let mut where_i = None;
    let mut i = in_i + 1;
    while i < ts.len() {
        if ts[i].is_word("where") { where_i = Some(i); list_end = i; break; }
        if ts[i].t==3 && i > in_i+1 && is_command_word(ts[i].sval()) { list_end = i; break; }
        i += 1;
    }
    let list = parse_expr(&ts[in_i+1..list_end]);
    let mut where_c = None;
    let mut then_start = list_end;
    if let Some(wi) = where_i {
        let mut cond_end = ts.len(); let mut j = wi + 1;
        while j < ts.len() { if ts[j].t==3 && j > wi+1 && is_command_word(ts[j].sval()) { cond_end = j; break; } j += 1; }
        where_c = Some(parse_cond(&ts[wi+1..cond_end]));
        then_start = cond_end;
    }
    let then = if then_start < ts.len() { Some(Box::new(parse_line(&ts[then_start..]))) } else { None };
    Stmt::Each(var, list, where_c, then, Vec::new())
}
fn parse_def_sfx(ts: &[Tok]) -> Stmt {
    // define sound "NAME" as WAVE from F0 to F1 over DUR  |  ... as notes N.. over DUR
    let name = ts.iter().find(|t| t.t==1).map(|t| t.sval().to_string()).unwrap_or_default();
    let num_after = |w: &str, d: f64| find_word(ts, w).and_then(|k| ts.get(k+1)).and_then(|t| if let TokVal::Num(n)=t.v { Some(n) } else { None }).unwrap_or(d);
    let opt_after = |w: &str| find_word(ts, w).and_then(|k| ts.get(k+1)).and_then(|t| if let TokVal::Num(n)=t.v { Some(n) } else { None });
    let as_i = find_word(ts, "as");
    let is_notes = as_i.and_then(|k| ts.get(k+1)).map(|t| t.is_word("notes")).unwrap_or(false);
    if is_notes {
        let over_i = find_word(ts, "over").unwrap_or(ts.len());
        let start = as_i.unwrap_or(0) + 2;
        let mut notes: Vec<f64> = Vec::new();
        for t in &ts[start.min(ts.len())..over_i.min(ts.len())] { if let TokVal::Num(n)=t.v { notes.push(n); } }
        Stmt::DefSfx(name, SfxRecipe { tone: false, wave: String::new(), f0: 0.0, f1: None, dur: num_after("over", 0.15), notes })
    } else {
        let wave = as_i.and_then(|k| ts.get(k+1)).map(|t| t.sval().to_string()).unwrap_or_else(|| "square".to_string());
        Stmt::DefSfx(name, SfxRecipe { tone: true, wave, f0: num_after("from", 440.0), f1: opt_after("to"), dur: num_after("over", 0.15), notes: Vec::new() })
    }
}
fn brace_props(ts: &[Tok]) -> Expr {
    if let Some(lb) = ts.iter().position(|t| t.t == 11) { parse_object(&ts[lb..]) } else { Expr::Object(Vec::new()) }
}

// ============================================================================
// STAGE 3 — runtime (exec). Value model + eval + exec, producing {say,vars,errors}
// diffed against corpus/_goldens.json. Reference: index.html Runtime (~L2633).
// ============================================================================
use alloc::rc::Rc;
use core::cell::RefCell;
use alloc::collections::BTreeMap;

#[derive(Clone)]
enum Val { Num(f64), Str(String), Bool(bool), List(Rc<RefCell<Vec<Val>>>), Obj(Rc<RefCell<BTreeMap<String, Val>>>), Undef }

fn truthy(v: &Val) -> bool {
    match v { Val::Undef=>false, Val::Bool(b)=>*b, Val::Num(n)=>*n!=0.0,
        Val::Str(s)=>!s.is_empty() && s!="no",
        Val::List(l)=>!l.borrow().is_empty(), Val::Obj(o)=>!o.borrow().is_empty() }
}
fn as_num(v: &Val) -> f64 { match v {
    Val::Num(n)=>*n, Val::Str(s)=>js_parse_float(s), Val::Bool(b)=>if *b {1.0} else {0.0},
    // match JS Number(): undefined/object -> NaN; [] -> 0, [x] -> Number(x), [x,..] -> NaN
    Val::Undef=>f64::NAN, Val::Obj(_)=>f64::NAN,
    Val::List(l)=>{ let b=l.borrow(); match b.len() { 0=>0.0, 1=>as_num(&b[0]), _=>f64::NAN } },
} }
fn to_number(s: &str) -> Option<f64> { let t=s.trim(); if t.is_empty() { Some(0.0) } else { t.parse::<f64>().ok() } }
// Minimal JSON -> Val for incoming multiplayer peer states (the bridge feeds
// JSON.stringify(NET.peers) each frame). Numbers via the same f64 parse the
// lexer uses; strings are UTF-8-lossy. Mirrors the Val shapes emit_val produces.
fn json_to_val(s: &str) -> Val { let b = s.as_bytes(); let mut i = 0usize; jv_value(b, &mut i) }
fn jv_ws(b: &[u8], i: &mut usize) { while *i < b.len() && matches!(b[*i], b' '|b'\t'|b'\n'|b'\r') { *i += 1; } }
fn jv_value(b: &[u8], i: &mut usize) -> Val {
    jv_ws(b, i);
    if *i >= b.len() { return Val::Undef; }
    match b[*i] {
        b'{' => jv_obj(b, i),
        b'[' => jv_arr(b, i),
        b'"' => Val::Str(jv_string(b, i)),
        b't' => { *i += 4.min(b.len() - *i); Val::Bool(true) }
        b'f' => { *i += 5.min(b.len() - *i); Val::Bool(false) }
        b'n' => { *i += 4.min(b.len() - *i); Val::Undef }
        _ => jv_number(b, i),
    }
}
fn jv_string(b: &[u8], i: &mut usize) -> String {
    *i += 1;
    let mut out: Vec<u8> = Vec::new();
    while *i < b.len() && b[*i] != b'"' {
        if b[*i] == b'\\' && *i + 1 < b.len() { *i += 1; match b[*i] { b'n'=>out.push(b'\n'), b't'=>out.push(b'\t'), b'r'=>out.push(b'\r'), c=>out.push(c) } }
        else { out.push(b[*i]); }
        *i += 1;
    }
    if *i < b.len() { *i += 1; }
    String::from_utf8_lossy(&out).into_owned()
}
fn jv_number(b: &[u8], i: &mut usize) -> Val {
    let start = *i;
    while *i < b.len() && matches!(b[*i], b'0'..=b'9'|b'-'|b'+'|b'.'|b'e'|b'E') { *i += 1; }
    Val::Num(core::str::from_utf8(&b[start..*i]).unwrap_or("0").parse::<f64>().unwrap_or(0.0))
}
fn jv_arr(b: &[u8], i: &mut usize) -> Val {
    *i += 1; let mut v = Vec::new();
    loop { jv_ws(b, i); if *i >= b.len() || b[*i] == b']' { if *i < b.len() { *i += 1; } break; } v.push(jv_value(b, i)); jv_ws(b, i); if *i < b.len() && b[*i] == b',' { *i += 1; } }
    Val::List(Rc::new(RefCell::new(v)))
}
fn jv_obj(b: &[u8], i: &mut usize) -> Val {
    *i += 1; let mut m = BTreeMap::new();
    loop {
        jv_ws(b, i); if *i >= b.len() || b[*i] == b'}' { if *i < b.len() { *i += 1; } break; }
        if b[*i] != b'"' { break; }
        let key = jv_string(b, i); jv_ws(b, i); if *i < b.len() && b[*i] == b':' { *i += 1; }
        m.insert(key, jv_value(b, i)); jv_ws(b, i); if *i < b.len() && b[*i] == b',' { *i += 1; }
    }
    Val::Obj(Rc::new(RefCell::new(m)))
}
fn display(v: &Val) -> String {
    match v { Val::Num(n)=>{ let mut s=String::new(); json_num(*n,&mut s); s } Val::Str(s)=>s.clone(),
        Val::Bool(b)=>if *b {"true".to_string()} else {"false".to_string()}, _=>String::new() }
}
// JS === / Array.includes semantics (no coercion): `"1" is in [1]` is false.
fn strict_eq(a: &Val, b: &Val) -> bool {
    match (a, b) {
        (Val::Num(x), Val::Num(y)) => x==y,
        (Val::Str(x), Val::Str(y)) => x==y,
        (Val::Bool(x), Val::Bool(y)) => x==y,
        (Val::Undef, Val::Undef) => true,
        (Val::Obj(x), Val::Obj(y)) => Rc::ptr_eq(x, y),
        (Val::List(x), Val::List(y)) => Rc::ptr_eq(x, y),
        _ => false,
    }
}
fn loose_eq(a: &Val, b: &Val) -> bool {
    match (a, b) {
        (Val::Num(x), Val::Num(y)) => x==y,
        (Val::Str(x), Val::Str(y)) => x==y,
        (Val::Bool(x), Val::Bool(y)) => x==y,
        (Val::Undef, Val::Undef) => true,
        (Val::Bool(x), _) => loose_eq(&Val::Num(if *x {1.0} else {0.0}), b),
        (_, Val::Bool(y)) => loose_eq(a, &Val::Num(if *y {1.0} else {0.0})),
        (Val::Num(x), Val::Str(s)) => to_number(s).map(|n| *x==n).unwrap_or(false),
        (Val::Str(s), Val::Num(y)) => to_number(s).map(|n| n==*y).unwrap_or(false),
        // objects/lists compare by REFERENCE identity, like JS === (so
        // `remove tail from body` matches the exact element item N returned)
        (Val::Obj(x), Val::Obj(y)) => Rc::ptr_eq(x, y),
        (Val::List(x), Val::List(y)) => Rc::ptr_eq(x, y),
        _ => false,
    }
}
// JSON-round-trip semantics for the save/load STORE (mirrors the JS stub).
fn deep_clone(v: &Val) -> Val {
    match v {
        Val::List(l) => Val::List(Rc::new(RefCell::new(l.borrow().iter().map(deep_clone).collect()))),
        Val::Obj(o) => Val::Obj(Rc::new(RefCell::new(o.borrow().iter().map(|(k,x)| (k.clone(), deep_clone(x))).collect()))),
        _ => v.clone(),
    }
}

struct Rt { vars: BTreeMap<String, Val>, funcs: BTreeMap<String, (Vec<String>, Vec<Stmt>)>, seed: u32, ops: u64, stopped: bool, returning: bool, cmds: Vec<Cmd>, camera: (f64,f64), tick: u64,
    store: BTreeMap<String, Val>, tile_defs: BTreeMap<String, Val>, map_rows: Vec<String>, follow: Option<String>,
    tags: BTreeMap<String, Vec<String>>, pickup_handlers: BTreeMap<String, Vec<Stmt>>, hit_handlers: BTreeMap<String, Vec<Stmt>>, defeat_handlers: BTreeMap<String, Vec<Stmt>>, every_counts: BTreeMap<u32, u64>, run_fs: Vec<String>, behavior_subjects: Vec<String>, key_state: BTreeMap<String, bool>, key_handlers: BTreeMap<String, (Option<Stmt>, Vec<Stmt>)>, time_limit_frames: Option<i64>, time_left: i64, timeout_fired: bool, timeout_handler: Option<(Option<Stmt>, Vec<Stmt>)>, particles: Vec<Particle>,
    button_handlers: BTreeMap<String, (Option<Stmt>, Vec<Stmt>)>, mouse_handlers: BTreeMap<String, (Option<Stmt>, Vec<Stmt>)>,
    buttons: Vec<(String, f64, f64, f64, f64)>, screen_stack: Vec<String>, mouse: (f64, f64, bool),
    says: Vec<String>, has_game: bool, flash_frames: i64, flash_color: String, shake_frames: i64, shake_mag: f64, emitters: Vec<Emitter>, tweens: Vec<Tween> }
// Particle pool created by `burst`; mirrors the JS {x,y,vx,vy,life,color} fields.
struct Particle { x: f64, y: f64, vx: f64, vy: f64, life: i32, color: String }
// A sustained emitter created by `emit … for N frames`; spawns `rate` particles per
// frame at its point (or at the referenced sprite), following the same random draw
// order as `burst`.
struct Emitter { rf: Option<String>, x: f64, y: f64, color: String, marker: String, rate: i64, frames: i64 }
// A frame-counted property tween created by `tween X.y from A to B over N`.
struct Tween { target: String, from: f64, to: f64, frames: i64, tick: i64, ease: String }
impl Rt {
    fn new(seed: u32) -> Self { Rt { vars: BTreeMap::new(), funcs: BTreeMap::new(), seed, ops: 0, stopped: false, returning: false, cmds: Vec::new(), camera: (0.0,0.0), tick: 0,
        store: BTreeMap::new(), tile_defs: BTreeMap::new(), map_rows: Vec::new(), follow: None,
        tags: BTreeMap::new(), pickup_handlers: BTreeMap::new(), hit_handlers: BTreeMap::new(), defeat_handlers: BTreeMap::new(), every_counts: BTreeMap::new(), run_fs: Vec::new(), behavior_subjects: Vec::new(), key_state: BTreeMap::new(), key_handlers: BTreeMap::new(), time_limit_frames: None, time_left: 0, timeout_fired: false, timeout_handler: None, particles: Vec::new(),
        button_handlers: BTreeMap::new(), mouse_handlers: BTreeMap::new(),
        buttons: Vec::new(), screen_stack: Vec::new(), mouse: (0.0, 0.0, false), says: Vec::new(), has_game: false, flash_frames: 0, flash_color: String::new(), shake_frames: 0, shake_mag: 0.0, emitters: Vec::new(), tweens: Vec::new() } }
    fn interpolate(&self, s: &str) -> String {
        // replace {expr} with the value of expr (a var path), like the JS engine
        // copy literal runs as UTF-8 slices (not byte-by-byte) so multi-byte
        // chars like '·' survive; '{' and '}' are ASCII so byte-scanning is safe.
        let mut out = String::new(); let bytes = s.as_bytes(); let mut i = 0; let mut seg = 0;
        while i < bytes.len() {
            if bytes[i] == b'{' { if let Some(close) = s[i+1..].find('}') {
                out.push_str(&s[seg..i]);
                let inner = &s[i+1..i+1+close];
                out.push_str(&display(&self.get_var(inner.trim())));
                i += close + 2; seg = i; continue;
            } }
            i += 1;
        }
        out.push_str(&s[seg..]);
        out
    }
    fn rng(&mut self) -> f64 {
        self.seed = self.seed.wrapping_add(0x6D2B79F5);
        let a = self.seed;
        let mut t = (a ^ (a >> 15)).wrapping_mul(1 | a);
        t = t.wrapping_add((t ^ (t >> 7)).wrapping_mul(61 | t)) ^ t;
        ((t ^ (t >> 14)) as f64) / 4294967296.0
    }
    // Move/age the particle pool and emit one rect per live particle. JS iterates
    // from the end down, splicing dead ones — so command order is reverse-index.
    fn apply_tweens(&mut self) {
        if self.tweens.is_empty() { return; }
        let mut i = self.tweens.len();
        while i > 0 {
            i -= 1;
            let p = { let t = &self.tweens[i]; if t.frames <= 0 { 1.0 } else { (t.tick as f64 / t.frames as f64).min(1.0) } };
            let (target, from, to, ease) = { let t = &self.tweens[i]; (t.target.clone(), t.from, t.to, t.ease.clone()) };
            let e = ease_curve(&ease, p);
            self.set_var(&target, Val::Num(from + (to - from) * e));
            self.tweens[i].tick += 1;
            if p >= 1.0 { self.tweens.remove(i); }
        }
    }
    fn update_emitters(&mut self) {
        if self.emitters.is_empty() { return; }
        let mut i = self.emitters.len();
        while i > 0 {
            i -= 1;
            let (px, py, col, marker, rate) = {
                let e = &self.emitters[i];
                let (mut sx, mut sy) = (e.x, e.y);
                if let Some(r) = &e.rf {
                    match self.get_var(r) {
                        Val::Obj(o) => match (Self::obj_num(&o, "x"), Self::obj_num(&o, "y")) {
                            (Some(ox), Some(oy)) => { sx = ox + 4.0; sy = oy + 4.0; }
                            _ => { self.emitters.remove(i); continue; }
                        },
                        _ => { self.emitters.remove(i); continue; }
                    }
                }
                (sx, sy, e.color.clone(), e.marker.clone(), e.rate)
            };
            let bias = if marker == "rising" { -1.0 } else if marker == "falling" { 1.0 } else { 0.0 };
            for _ in 0..rate {
                let a = self.rng() * core::f64::consts::PI * 2.0;
                let sp = 0.4 + self.rng() * 1.4;
                let vy = if bias != 0.0 { (bias * libm::fabs(libm::sin(a) * sp)) + (bias * 0.3) } else { libm::sin(a) * sp };
                let life = 16 + (self.rng() * 18.0) as i32;
                self.particles.push(Particle { x: px, y: py, vx: libm::cos(a) * sp, vy, life, color: col.clone() });
            }
            self.emitters[i].frames -= 1;
            if self.emitters[i].frames <= 0 { self.emitters.remove(i); }
        }
        while self.particles.len() > 400 { self.particles.remove(0); }
    }
    fn update_particles(&mut self) {
        if self.particles.is_empty() { return; }
        let (ox, oy) = self.camera;
        let mut i = self.particles.len();
        while i > 0 {
            i -= 1;
            let (px, py);
            { let p = &mut self.particles[i]; p.x += p.vx; p.y += p.vy; p.vx *= 0.96; p.vy *= 0.96; p.life -= 1; px = p.x; py = p.y; }
            if self.particles[i].life <= 0 { self.particles.remove(i); continue; }
            let s = if self.particles[i].life > 10 { 2.0 } else { 1.0 };
            let color = self.particles[i].color.clone();
            self.cmds.push(Cmd::Rect(libm::floor(px - ox), libm::floor(py - oy), s, s, color));
        }
    }
    // Inventories are ordinary fc lists on the subject (`player.inventory`); this
    // returns the LIVE list handle so callers can mutate it in place.
    fn inventory_handle(&mut self, name: &str) -> Rc<RefCell<Vec<Val>>> {
        let obj = match self.get_var(name) {
            Val::Obj(o) => o,
            _ => {
                let mut m = BTreeMap::new();
                let l: Rc<RefCell<Vec<Val>>> = Rc::new(RefCell::new(Vec::new()));
                m.insert("inventory".to_string(), Val::List(l.clone()));
                let o = Rc::new(RefCell::new(m));
                self.vars.insert(name.to_string(), Val::Obj(o.clone()));
                return l;
            }
        };
        let existing = match obj.borrow().get("inventory") { Some(Val::List(l)) => Some(l.clone()), _ => None };
        match existing {
            Some(l) => l,
            None => {
                let l: Rc<RefCell<Vec<Val>>> = Rc::new(RefCell::new(Vec::new()));
                obj.borrow_mut().insert("inventory".to_string(), Val::List(l.clone()));
                l
            }
        }
    }
    fn get_var(&self, path: &str) -> Val {
        let parts: Vec<&str> = path.split('.').collect();
        let mut cur = match self.vars.get(parts[0]) { Some(v)=>v.clone(), None=>return Val::Undef };
        for p in &parts[1..] {
            cur = match cur {
                Val::Obj(o) => o.borrow().get(*p).cloned().unwrap_or(Val::Undef),
                Val::List(l) => if *p=="count"||*p=="length" { Val::Num(l.borrow().len() as f64) } else { return Val::Undef },
                _ => return Val::Undef,
            };
        }
        cur
    }
    fn set_var(&mut self, path: &str, val: Val) {
        let parts: Vec<&str> = path.split('.').collect();
        if parts.len()==1 { self.vars.insert(parts[0].to_string(), val); return; }
        let root = self.vars.entry(parts[0].to_string()).or_insert_with(|| Val::Obj(Rc::new(RefCell::new(BTreeMap::new()))));
        if !matches!(root, Val::Obj(_)) { *root = Val::Obj(Rc::new(RefCell::new(BTreeMap::new()))); }
        let mut cur = if let Val::Obj(o)=root { o.clone() } else { return };
        for p in &parts[1..parts.len()-1] {
            let next = cur.borrow().get(*p).cloned();
            let obj = match next { Some(Val::Obj(o))=>o, _=>{ let o=Rc::new(RefCell::new(BTreeMap::new())); cur.borrow_mut().insert(p.to_string(), Val::Obj(o.clone())); o } };
            cur = obj;
        }
        cur.borrow_mut().insert(parts[parts.len()-1].to_string(), val);
    }
    fn eval(&mut self, e: &Expr) -> Val {
        match e {
            Expr::Lit(LitVal::Num(n)) => Val::Num(*n),
            Expr::Lit(LitVal::Str(s)) => Val::Str(s.clone()),
            Expr::Lit(LitVal::Bool(b)) => Val::Bool(*b),
            Expr::Ref(n) => { let v = self.get_var(n); if !matches!(v, Val::Undef) { v } else if color_hex(&n.to_lowercase()).is_some() { Val::Str(n.clone()) } else { Val::Undef } }
            Expr::Math(op, l, r) => {
                let a = as_num(&self.eval(l)); let b = as_num(&self.eval(r));
                Val::Num(match op.as_str() { "+"=>a+b, "-"=>a-b, "*"=>a*b, "/"=>if b!=0.0 {a/b} else {0.0}, "%"=>if b!=0.0 {a%b} else {0.0}, _=>0.0 })
            }
            Expr::ListLit(items) => { let mut v=Vec::new(); for it in items { v.push(self.eval(it)); } Val::List(Rc::new(RefCell::new(v))) }
            Expr::Random(m) => { let max = as_num(&self.eval(m)); let r = self.rng(); Val::Num((r * (max + 1.0)) as i64 as f64) }
            Expr::ItemOf(idx, list) => { let i = as_num(&self.eval(idx)) as i64; match self.eval(list) { Val::List(l) => { let b=l.borrow(); if i>=1 && (i as usize)<=b.len() { b[(i-1) as usize].clone() } else { Val::Undef } } _=>Val::Undef } }
            Expr::Object(props) => { let mut m=BTreeMap::new(); for (k,v) in props { let val=self.eval(v); m.insert(k.clone(), val); } Val::Obj(Rc::new(RefCell::new(m))) }
            Expr::Count(e) => match self.eval(e) { Val::List(l)=>Val::Num(l.borrow().len() as f64), Val::Str(s)=>Val::Num(s.chars().count() as f64), _=>Val::Num(0.0) },
            Expr::Load(k) => { let key = display(&self.eval(k)); match self.store.get(&key) { Some(v)=>deep_clone(v), None=>Val::Num(0.0) } }
            Expr::SolidAt(x, y) => {
                let xv = as_num(&self.eval(x)); let yv = as_num(&self.eval(y));
                if self.map_rows.is_empty() { return Val::Bool(false); }
                if xv < 0.0 || yv < 0.0 { return Val::Bool(false); }   // JS: rows[-1] is undefined
                let row = match self.map_rows.get((yv / 8.0) as usize) { Some(r)=>r, None=>return Val::Bool(false) };
                let ch = match row.chars().nth((xv / 8.0) as usize) { Some(c)=>c, None=>return Val::Bool(false) };
                let solid = match self.tile_defs.get(&ch.to_string()) {
                    Some(Val::Obj(o)) => o.borrow().get("solid").map(|v| truthy(v)).unwrap_or(false),
                    _ => false,
                };
                Val::Bool(solid)
            }
            Expr::Sprite(pos, props) => {
                let (ww, wh) = self.world_dims();
                let mut m = BTreeMap::new();
                if pos == "centered" {
                    m.insert("x".to_string(), Val::Num(js_floor((ww - 8.0) / 2.0)));
                    m.insert("y".to_string(), Val::Num(js_floor((wh - 8.0) / 2.0)));
                } else { m.insert("x".to_string(), Val::Num(0.0)); m.insert("y".to_string(), Val::Num(0.0)); }
                if let Val::Obj(p) = self.eval(props) { for (k, v) in p.borrow().iter() { m.insert(k.clone(), v.clone()); } }
                // facing -> dx/dy (so projectiles/walking work before the first face verb)
                if let Some(Val::Str(f)) = m.get("facing").cloned() {
                    let (dx, dy) = dir_vec(&f);
                    if dx != 0.0 || dy != 0.0 { m.entry("dx".to_string()).or_insert(Val::Num(dx)); m.entry("dy".to_string()).or_insert(Val::Num(dy)); }
                }
                Val::Obj(Rc::new(RefCell::new(m)))
            }
            Expr::ListOfSprites(count, props) => {
                let n = as_num(&self.eval(count)) as i64;
                let (ww, wh) = self.world_dims();
                let mut existing = self.collect_sprite_positions();
                let mut items = Vec::new();
                let mut i = 0;
                while i < n {
                    let (px, py) = self.find_empty_spot(&existing, ww, wh);
                    let mut m = BTreeMap::new();
                    m.insert("x".to_string(), Val::Num(px)); m.insert("y".to_string(), Val::Num(py));
                    if let Val::Obj(p) = self.eval(props) { for (k, v) in p.borrow().iter() { m.insert(k.clone(), v.clone()); } }
                    items.push(Val::Obj(Rc::new(RefCell::new(m))));
                    existing.push((px, py));
                    i += 1;
                }
                Val::List(Rc::new(RefCell::new(items)))
            }
            _ => Val::Undef,
        }
    }
    fn eval_cond(&mut self, c: &Cond) -> bool {
        match c {
            Cond::Eq(l, r) => { let a=self.eval(l); let b=self.eval(r); loose_eq(&a,&b) }
            Cond::Neq(l, r) => { let a=self.eval(l); let b=self.eval(r); !loose_eq(&a,&b) }
            Cond::Cmp(op, l, r) => { let a=as_num(&self.eval(l)); let b=as_num(&self.eval(r)); match op.as_str() { ">"=>a>b, "<"=>a<b, ">="=>a>=b, "<="=>a<=b, "!="=>a!=b, "=="=>a==b, _=>false } }
            Cond::And(a, b) => self.eval_cond(a) && self.eval_cond(b),
            Cond::Or(a, b) => self.eval_cond(a) || self.eval_cond(b),
            Cond::Not(c) => !self.eval_cond(c),
            Cond::NotExpr(e) => { let v=self.eval(e); !truthy(&v) }
            Cond::Bare(e) => { let v=self.eval(e); truthy(&v) }
            Cond::Has(l, r) => { let a=display(&self.eval(l)); let b=display(&self.eval(r)); a.contains(&b) }
            // `X is in [..]` — JS uses Array.includes (STRICT equality), and a
            // non-list list operand is simply false.
            Cond::InvHas(subject, item) => {
                let v = self.eval(item);
                match self.get_var(subject) {
                    Val::Obj(o) => match o.borrow().get("inventory") {
                        Some(Val::List(l)) => l.borrow().iter().any(|x| strict_eq(x, &v)),
                        _ => false,
                    },
                    _ => false,
                }
            }
            Cond::In(v, l) => { let val=self.eval(v); match self.eval(l) { Val::List(items) => items.borrow().iter().any(|it| strict_eq(it, &val)), _ => false } }
            Cond::Key(k) => *self.key_state.get(&k.to_lowercase()).unwrap_or(&false),
        }
    }
    fn exec_block(&mut self, stmts: &[Stmt]) {
        let mut last_if: Option<bool> = None;
        for s in stmts {
            if self.stopped || self.returning || self.ops > 100000 { return; }
            self.ops += 1;
            match s {
                Stmt::If(c, then, body) => { let r=self.eval_cond(c); last_if=Some(r); if r { self.run_then(then, body); } }
                Stmt::ElseIf(c, then, body) => { if last_if==Some(false) { let r=self.eval_cond(c); last_if=Some(r); if r { self.run_then(then, body); } } }
                Stmt::Else(body) => { if last_if==Some(false) { self.exec_block(body); } last_if=None; }
                _ => { last_if=None; self.exec_one(s); }
            }
        }
    }
    fn run_then(&mut self, then: &Option<Box<Stmt>>, body: &[Stmt]) {
        if let Some(t)=then { self.exec_one(t); }
        if !body.is_empty() { self.exec_block(body); }
    }
    fn world_dims(&mut self) -> (f64, f64) {
        if let Val::Obj(o) = self.get_var("world") {
            let b = o.borrow();
            let w = match b.get("width") { Some(Val::Num(n)) => *n, _ => 128.0 };
            let h = match b.get("height") { Some(Val::Num(n)) => *n, _ => 128.0 };
            (w, h)
        } else { (128.0, 128.0) }
    }
    // every {x,y} object currently in vars (incl. list items) — for sprite placement
    fn collect_sprite_positions(&self) -> Vec<(f64, f64)> {
        fn pos_of(o: &Rc<RefCell<BTreeMap<String, Val>>>) -> Option<(f64, f64)> {
            let b = o.borrow();
            match (b.get("x"), b.get("y")) { (Some(Val::Num(x)), Some(Val::Num(y))) => Some((*x, *y)), _ => None }
        }
        let mut out = Vec::new();
        for v in self.vars.values() { match v {
            Val::Obj(o) => { if let Some(p) = pos_of(o) { out.push(p); } }
            Val::List(l) => { for it in l.borrow().iter() { if let Val::Obj(o) = it { if let Some(p) = pos_of(o) { out.push(p); } } } }
            _ => {}
        } }
        out
    }
    // mirror JS _findEmptySpot: random spot >=12px from existing (80 tries, then fallback)
    fn find_empty_spot(&mut self, existing: &[(f64, f64)], ww: f64, wh: f64) -> (f64, f64) {
        let max_w = if ww - 16.0 > 16.0 { ww - 16.0 } else { 16.0 };
        let max_h = if wh - 16.0 > 16.0 { wh - 16.0 } else { 16.0 };
        for _ in 0..80 {
            let x = 4.0 + js_floor(self.rng() * max_w);
            let y = 4.0 + js_floor(self.rng() * max_h);
            if existing.iter().all(|(ox, oy)| libm::fabs(x - ox) >= 12.0 || libm::fabs(y - oy) >= 12.0) { return (x, y); }
        }
        (4.0 + js_floor(self.rng() * max_w), 4.0 + js_floor(self.rng() * max_h))
    }
    fn map_solid_box(&self, x: f64, y: f64) -> bool {
        if self.map_rows.is_empty() || x + 7.0 < 0.0 || y + 7.0 < 0.0 { return false; }
        let r0 = if y < 0.0 { 0 } else { (y / 8.0) as usize };
        let r1 = ((y + 7.0) / 8.0) as usize;
        let c0 = if x < 0.0 { 0 } else { (x / 8.0) as usize };
        for r in r0..=r1.min(self.map_rows.len().saturating_sub(1)) {
            let row = &self.map_rows[r];
            let c1 = ((x + 7.0) / 8.0) as usize;
            for c in c0..=c1.min(row.chars().count().saturating_sub(1)) {
                if let Some(ch) = row.chars().nth(c) {
                    if let Some(Val::Obj(o)) = self.tile_defs.get(&ch.to_string()) {
                        if o.borrow().get("solid").map(|v| truthy(v)).unwrap_or(false) { return true; }
                    }
                }
            }
        }
        false
    }
    fn obj_num(o: &Rc<RefCell<BTreeMap<String, Val>>>, k: &str) -> Option<f64> {
        match o.borrow().get(k) { Some(Val::Num(n)) => Some(*n), _ => None }
    }
    // ONE frame, mirroring index.html startGameLoop frame() — the headless slice
    // (skipped, like the JS record run: input handlers, autowalk, tag collisions).
    fn frame_step(&mut self, fs: &[String]) {
        // optional match timer (JS frame() order: right after peers/connected, before keys)
        if self.time_limit_frames.is_some() {
            if self.time_left > 0 { self.time_left -= 1; }
            let left = if self.time_left < 0 { 0 } else { self.time_left };
            self.set_var("timer", Val::Num(((left + 59) / 60) as f64));
            if self.time_left <= 0 && !self.timeout_fired {
                self.timeout_fired = true;
                if let Some((then, body)) = self.timeout_handler.clone() {
                    if let Some(t) = then { self.exec_block(&[t]); self.returning = false; }
                    if !body.is_empty() { self.exec_block(&body); self.returning = false; }
                }
            }
        }
        // when "<key>" is pressed — fire each held key's handler (JS frame() order: first)
        let held: Vec<String> = self.key_handlers.keys().filter(|k| *self.key_state.get(*k).unwrap_or(&false)).cloned().collect();
        for k in held {
            if let Some((then, body)) = self.key_handlers.get(&k).cloned() {
                if let Some(t) = then { self.exec_block(&[t]); self.returning = false; }
                if !body.is_empty() { self.exec_block(&body); self.returning = false; }
            }
        }
        // button clicks + generic mouse handler — uses self.buttons from the
        // PREVIOUS frame's draw (JS frame() order: keys → buttons → mouse)
        if self.mouse.2 {
            let (mx, my) = (self.mouse.0, self.mouse.1);
            let mobj = Rc::new(RefCell::new(BTreeMap::new()));
            mobj.borrow_mut().insert("x".to_string(), Val::Num(mx));
            mobj.borrow_mut().insert("y".to_string(), Val::Num(my));
            self.vars.insert("mouse".to_string(), Val::Obj(mobj));
            let hit = self.buttons.iter()
                .find(|(_, bx, by, bw, bh)| mx >= *bx && mx < *bx + *bw && my >= *by && my < *by + *bh)
                .map(|(l, _, _, _, _)| l.clone());
            if let Some(label) = hit {
                if let Some((then, body)) = self.button_handlers.get(&label).cloned() {
                    if let Some(t) = then { self.exec_block(&[t]); self.returning = false; }
                    if !body.is_empty() { self.exec_block(&body); self.returning = false; }
                }
            }
            if let Some((then, body)) = self.mouse_handlers.get("clicked").cloned() {
                if let Some(t) = then { self.exec_block(&[t]); self.returning = false; }
                if !body.is_empty() { self.exec_block(&body); self.returning = false; }
            }
            self.mouse.2 = false;   // consume the click
        }
        self.tick += 1;
        let prev: Option<(f64, f64)> = match self.get_var("player") {
            Val::Obj(ref o) => match (Self::obj_num(o, "x"), Self::obj_num(o, "y")) { (Some(x), Some(y)) => Some((x, y)), _ => None },
            _ => None,
        };
        if let Some(f0) = fs.get(0) { if let Some(b) = self.funcs.get(f0).cloned() { self.exec_block(&b.1); self.returning = false; } }
        // autowalk: any sprite with walking:true advances by dx,dy * speed
        let gspeed = match self.get_var("speed") { Val::Num(n)=>n, _=>1.0 };
        if let Val::Obj(p) = self.get_var("player") {
            let walking = matches!(p.borrow().get("walking"), Some(Val::Bool(true)));
            if walking {
                let dx = Self::obj_num(&p,"dx").unwrap_or(0.0); let dy = Self::obj_num(&p,"dy").unwrap_or(0.0);
                let sp = Self::obj_num(&p,"speed").unwrap_or(gspeed);
                let x = Self::obj_num(&p,"x").unwrap_or(0.0); let y = Self::obj_num(&p,"y").unwrap_or(0.0);
                p.borrow_mut().insert("x".into(), Val::Num(x + dx*sp));
                p.borrow_mut().insert("y".into(), Val::Num(y + dy*sp));
            }
        }
        // behaviors motion (chase/patrol; wander needs rng — excluded from frame tests)
        let names: Vec<String> = self.behavior_subjects.clone();   // JS iterates registered subjects only
        let (ww, wh) = self.world_dims();
        for name in names {
            let items: Vec<Val> = match self.get_var(&name) { Val::List(l) => l.borrow().clone(), v @ Val::Obj(_) => { let mut t = Vec::new(); t.push(v); t } _ => Vec::new() };
            for it in items { if let Val::Obj(o) = it {
                let b = match o.borrow().get("behavior") { Some(Val::Obj(bo)) => bo.clone(), _ => continue };
                let (mx, my) = match (Self::obj_num(&o, "x"), Self::obj_num(&o, "y")) { (Some(a), Some(c)) => (a, c), _ => continue };
                let spd = Self::obj_num(&b, "speed").unwrap_or(0.5);
                let kind = match b.borrow().get("kind") { Some(Val::Str(k)) => k.clone(), _ => continue };
                let through = b.borrow().get("through").map(|v| truthy(v)).unwrap_or(false);
                let (mut vx, mut vy) = (0.0, 0.0);
                if kind == "chase" {
                    let tname = match b.borrow().get("target") { Some(Val::Str(t)) => t.clone(), _ => continue };
                    if let Val::Obj(t) = self.get_var(&tname) {
                        if let (Some(tx), Some(ty)) = (Self::obj_num(&t, "x"), Self::obj_num(&t, "y")) {
                            let (dx, dy) = (tx - mx, ty - my);
                            let len = libm::sqrt(dx * dx + dy * dy);
                            if len < 1.0 { continue; }
                            vx = dx / len * spd; vy = dy / len * spd;
                        } else { continue; }
                    } else { continue; }
                } else if kind == "flee" {
                    let tname = match b.borrow().get("target") { Some(Val::Str(t)) => t.clone(), _ => continue };
                    let within = Self::obj_num(&b, "within").unwrap_or(0.0);
                    if let Val::Obj(t) = self.get_var(&tname) {
                        if let (Some(tx), Some(ty)) = (Self::obj_num(&t, "x"), Self::obj_num(&t, "y")) {
                            let (dx, dy) = (mx - tx, my - ty);
                            let len = libm::sqrt(dx * dx + dy * dy);
                            if len < 1.0 { continue; }
                            if within > 0.0 && len > within { continue; }   // out of range: hold still
                            vx = dx / len * spd; vy = dy / len * spd;
                        } else { continue; }
                    } else { continue; }
                } else if kind == "patrol_points" {
                    let pts: Vec<Val> = match b.borrow().get("points") { Some(Val::List(l)) => l.borrow().clone(), _ => Vec::new() };
                    if pts.is_empty() { continue; }
                    let mut idx = Self::obj_num(&b, "idx").unwrap_or(0.0) as i64;
                    if idx < 0 { idx = 0; }
                    let pt = &pts[(idx as usize) % pts.len()];
                    let (px, py) = match pt { Val::Obj(po) => (Self::obj_num(po, "x"), Self::obj_num(po, "y")), _ => (None, None) };
                    match (px, py) {
                        (Some(px), Some(py)) => {
                            let (dx, dy) = (px - mx, py - my);
                            let len = libm::sqrt(dx * dx + dy * dy);
                            if len < spd { b.borrow_mut().insert("idx".to_string(), Val::Num(((idx as usize + 1) % pts.len()) as f64)); }
                            else { vx = dx / len * spd; vy = dy / len * spd; }
                        }
                        _ => { b.borrow_mut().insert("idx".to_string(), Val::Num(((idx as usize + 1) % pts.len()) as f64)); continue; }
                    }
                } else if kind == "patrol" {
                    let x1 = Self::obj_num(&b, "x1").unwrap_or(0.0); let x2 = Self::obj_num(&b, "x2").unwrap_or(0.0);
                    let (lo, hi) = (if x1 < x2 { x1 } else { x2 }, if x1 > x2 { x1 } else { x2 });
                    let mut dir = Self::obj_num(&b, "dir").unwrap_or(0.0);
                    if dir == 0.0 { dir = 1.0; }
                    if mx <= lo { dir = 1.0; }
                    if mx >= hi { dir = -1.0; }
                    b.borrow_mut().insert("dir".to_string(), Val::Num(dir));
                    vx = dir * spd;
                } else if kind == "wander" {
                    // JS short-circuit: when both vx,vy are 0/undefined the 0.02
                    // rng check is SKIPPED and only the angle draw happens — so the
                    // rng draw order matches `(!b.vx && !b.vy) || Math.random()<0.02`.
                    let bvx = Self::obj_num(&b, "vx").unwrap_or(0.0);
                    let bvy = Self::obj_num(&b, "vy").unwrap_or(0.0);
                    let (mut nvx, mut nvy) = (bvx, bvy);
                    let need = if bvx == 0.0 && bvy == 0.0 { true } else { self.rng() < 0.02 };
                    if need {
                        let a = self.rng() * core::f64::consts::PI * 2.0;
                        nvx = libm::cos(a); nvy = libm::sin(a);
                    }
                    b.borrow_mut().insert("vx".to_string(), Val::Num(nvx));
                    b.borrow_mut().insert("vy".to_string(), Val::Num(nvy));
                    vx = nvx * spd; vy = nvy * spd;
                } else { continue; }
                let is_wander = kind == "wander";
                let (nx, ny) = (mx + vx, my + vy);
                let (mut fx, mut fy) = (mx, my);
                if through || !self.map_solid_box(nx, ny) { fx = nx; fy = ny; }
                else if !self.map_solid_box(nx, my) { fx = nx; if is_wander { let v = -Self::obj_num(&b, "vy").unwrap_or(0.0); b.borrow_mut().insert("vy".to_string(), Val::Num(v)); } }
                else if !self.map_solid_box(mx, ny) { fy = ny; if is_wander { let v = -Self::obj_num(&b, "vx").unwrap_or(0.0); b.borrow_mut().insert("vx".to_string(), Val::Num(v)); } }
                else if is_wander { let nvx = -Self::obj_num(&b, "vx").unwrap_or(0.0); let nvy = -Self::obj_num(&b, "vy").unwrap_or(0.0); b.borrow_mut().insert("vx".to_string(), Val::Num(nvx)); b.borrow_mut().insert("vy".to_string(), Val::Num(nvy)); }
                if fx < 0.0 { fx = 0.0; } if fy < 0.0 { fy = 0.0; }
                let (mxw, myw) = (ww - 8.0, wh - 8.0);
                if fx > mxw { fx = mxw;
                    let bvx = Self::obj_num(&b, "vx").unwrap_or(0.0); if bvx != 0.0 { b.borrow_mut().insert("vx".to_string(), Val::Num(-bvx)); }
                    let d = Self::obj_num(&b, "dir").unwrap_or(0.0); if d != 0.0 { b.borrow_mut().insert("dir".to_string(), Val::Num(-1.0)); }
                }
                if fy > myw { fy = myw;
                    let bvy = Self::obj_num(&b, "vy").unwrap_or(0.0); if bvy != 0.0 { b.borrow_mut().insert("vy".to_string(), Val::Num(-bvy)); }
                }
                o.borrow_mut().insert("x".to_string(), Val::Num(fx));
                o.borrow_mut().insert("y".to_string(), Val::Num(fy));
            }}
        }
        // animations: image = frames[floor(tick/every) % n]
        let anames: Vec<String> = self.vars.iter().filter_map(|(k, v)| match v {
            Val::Obj(o) if o.borrow().contains_key("animation") => Some(k.clone()), _ => None }).collect();
        for name in anames {
            if let Val::Obj(o) = self.get_var(&name) {
                let a = match o.borrow().get("animation") { Some(Val::Obj(ao)) => ao.clone(), _ => continue };
                let every = Self::obj_num(&a, "every").unwrap_or(10.0);
                let frames: Vec<String> = match a.borrow().get("frames") { Some(Val::List(l)) => l.borrow().iter().filter_map(|f| if let Val::Str(s) = f { Some(s.clone()) } else { None }).collect(), _ => continue };
                if frames.is_empty() { continue; }
                let idx = ((self.tick as f64 / every) as u64 as usize) % frames.len();
                o.borrow_mut().insert("image".to_string(), Val::Str(frames[idx].clone()));
            }
        }
        self.apply_tweens();
        // gravity → clamp → map-solid axis restore (player)
        if let Val::Obj(p) = self.get_var("player") {
            let g = as_num(&self.get_var("gravity"));
            if g > 0.0 { if let Some(py) = Self::obj_num(&p, "y") {
                let dy = Self::obj_num(&p, "dy").unwrap_or(0.0) + g;
                p.borrow_mut().insert("dy".to_string(), Val::Num(dy));
                p.borrow_mut().insert("y".to_string(), Val::Num(py + dy));
            }}
            if let (Some(mut px), Some(mut py)) = (Self::obj_num(&p, "x"), Self::obj_num(&p, "y")) {
                let (mxw, myw) = (ww - 8.0, wh - 8.0);
                if px < 0.0 { px = 0.0; } if py < 0.0 { py = 0.0; p.borrow_mut().insert("dy".to_string(), Val::Num(0.0)); }
                if px > mxw { px = mxw; } if py > myw { py = myw; p.borrow_mut().insert("dy".to_string(), Val::Num(0.0)); }
                if let Some((ox, oy)) = prev {
                    if self.map_solid_box(px, py) {
                        if !self.map_solid_box(px, oy) { py = oy; }
                        else if !self.map_solid_box(ox, py) { px = ox; }
                        else { px = ox; py = oy; }
                    }
                }
                p.borrow_mut().insert("x".to_string(), Val::Num(px));
                p.borrow_mut().insert("y".to_string(), Val::Num(py));
            }
        }
        // tag collisions: pickups (remove + handler) then hostile (handler), mirroring checkCollisions
        if let Val::Obj(p) = self.get_var("player") {
            if let (Some(px), Some(py)) = (Self::obj_num(&p, "x"), Self::obj_num(&p, "y")) {
                let pickup_lists = self.tags.get("pickups").cloned().unwrap_or_default();
                for ln in pickup_lists {
                    if let Val::List(l) = self.get_var(&ln) {
                        let mut i = l.borrow().len();
                        while i > 0 { i -= 1;
                            let hit = { let b = l.borrow(); match &b[i] { Val::Obj(o) => match (Self::obj_num(o, "x"), Self::obj_num(o, "y")) {
                                (Some(ix), Some(iy)) => (px - ix).abs() < 8.0 && (py - iy).abs() < 8.0, _ => false }, _ => false } };
                            if hit {
                                let item = l.borrow_mut().remove(i);
                                let sing = singularize(&ln);
                                if let Some(body) = self.pickup_handlers.get(&sing).cloned() {
                                    self.vars.insert(sing, item);
                                    self.exec_block(&body); self.returning = false;
                                } else { self.vars.insert(sing, item); }
                            }
                        }
                    }
                }
                let hostile_lists = self.tags.get("hostile").cloned().unwrap_or_default();
                for ln in hostile_lists {
                    if let Val::List(l) = self.get_var(&ln) {
                        let mut touched: Option<Val> = None;
                        for it in l.borrow().iter() { if let Val::Obj(o) = it {
                            if let (Some(ix), Some(iy)) = (Self::obj_num(o, "x"), Self::obj_num(o, "y")) {
                                if (px - ix).abs() < 8.0 && (py - iy).abs() < 8.0 { touched = Some(it.clone()); break; }
                            }
                        }}
                        if let Some(item) = touched {
                            let sing = singularize(&ln);
                            if let Some(body) = self.hit_handlers.get(&sing).cloned() {
                                self.vars.insert(sing, item);
                                self.exec_block(&body); self.returning = false;
                            }
                        }
                    }
                }
                // projectiles: move each bullet by dir*speed, despawn off-world or on a
                // solid, damage+defeat a hostile it hits. Mirrors JS checkCollisions'
                // projectile pass (runs after pickups/hostile). Was entirely absent, so
                // bullets/arrows never moved in the wasm core (space-invaders, coin-quest).
                let proj_lists = self.tags.get("projectiles").cloned().unwrap_or_default();
                let solid_lists = self.tags.get("solid").cloned().unwrap_or_default();
                let host_lists = self.tags.get("hostile").cloned().unwrap_or_default();
                for ln in proj_lists {
                    if let Val::List(l) = self.get_var(&ln) {
                        let mut bi = l.borrow().len();
                        while bi > 0 { bi -= 1;
                            let bullet = { let b = l.borrow(); if bi >= b.len() { continue; } b[bi].clone() };
                            let o = match bullet { Val::Obj(ref oo) => oo.clone(), _ => continue };
                            if Self::obj_num(&o, "x").is_none() { continue; }
                            let sp = Self::obj_num(&o, "speed").unwrap_or(2.0);
                            if let Some(dx) = Self::obj_num(&o, "dx") { let x = Self::obj_num(&o, "x").unwrap_or(0.0); o.borrow_mut().insert("x".into(), Val::Num(x + dx * sp)); }
                            if let Some(dy) = Self::obj_num(&o, "dy") { let y = Self::obj_num(&o, "y").unwrap_or(0.0); o.borrow_mut().insert("y".into(), Val::Num(y + dy * sp)); }
                            let nx = Self::obj_num(&o, "x").unwrap_or(0.0);
                            let ny = Self::obj_num(&o, "y").unwrap_or(0.0);
                            if nx < -8.0 || nx > ww + 8.0 || ny < -8.0 || ny > wh + 8.0 { l.borrow_mut().remove(bi); continue; }
                            // solid hit -> despawn (no damage)
                            let mut consumed = false;
                            for sn in &solid_lists {
                                if let Val::List(sl) = self.get_var(sn) {
                                    for s in sl.borrow().iter() { if let Val::Obj(so) = s {
                                        if let (Some(sx), Some(sy)) = (Self::obj_num(so, "x"), Self::obj_num(so, "y")) {
                                            if (nx - sx).abs() < 8.0 && (ny - sy).abs() < 8.0 { consumed = true; break; }
                                        }
                                    }}
                                }
                                if consumed { break; }
                            }
                            if consumed { l.borrow_mut().remove(bi); continue; }
                            // hostile hit -> damage; defeat fires "when X is defeated"
                            for hn in &host_lists {
                                if consumed { break; }
                                if let Val::List(hl) = self.get_var(hn) {
                                    let mut hi = hl.borrow().len();
                                    while hi > 0 { hi -= 1;
                                        let enemy = { let hb = hl.borrow(); if hi >= hb.len() { continue; } hb[hi].clone() };
                                        let eo = match enemy { Val::Obj(ref e) => e.clone(), _ => continue };
                                        let (ex, ey) = match (Self::obj_num(&eo, "x"), Self::obj_num(&eo, "y")) { (Some(a), Some(b)) => (a, b), _ => continue };
                                        if (nx - ex).abs() < 8.0 && (ny - ey).abs() < 8.0 {
                                            let hp = Self::obj_num(&eo, "hp").unwrap_or(1.0) - 1.0;
                                            eo.borrow_mut().insert("hp".into(), Val::Num(hp));
                                            if hp <= 0.0 {
                                                hl.borrow_mut().remove(hi);
                                                let sing = singularize(hn);
                                                if let Some(body) = self.defeat_handlers.get(&sing).cloned() {
                                                    self.vars.insert(sing, enemy.clone());
                                                    self.exec_block(&body); self.returning = false;
                                                }
                                            }
                                            l.borrow_mut().remove(bi);
                                            consumed = true; break;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        // camera follow (clamped to world)
        if let Some(t) = self.follow.clone() {
            if let Val::Obj(o) = self.get_var(&t) {
                if let (Some(tx), Some(ty)) = (Self::obj_num(&o, "x"), Self::obj_num(&o, "y")) {
                    let cx = tx - 64.0; let cy = ty - 64.0;
                    let cx = if cx < 0.0 { 0.0 } else if cx > ww - 128.0 { ww - 128.0 } else { cx };
                    let cy = if cy < 0.0 { 0.0 } else if cy > wh - 128.0 { wh - 128.0 } else { cy };
                    self.camera = (cx, cy);
                }
            }
        }
        // draw fns, then particles on top of the game layer, then screen dispatch
        // by mode (mirrors JS render order).
        self.buttons.clear();   // repopulated by Button stmts in the draw fns below
        for f in fs.iter().skip(1) { if let Some(b) = self.funcs.get(f).cloned() { self.exec_block(&b.1); self.returning = false; } }
        self.update_emitters();
        self.update_particles();
        if let Val::Str(mode) = self.get_var("mode") {
            let sname = alloc::format!("screen_{}", mode);
            if let Some(b) = self.funcs.get(&sname).cloned() { self.exec_block(&b.1); self.returning = false; }
        }

        // Timed presentation effects — the page renders these (and skips them under
        // reduced motion). Counted in frames, emitted at the END of the frame so the
        // overlay lands on top (same position as the JS core's frame()).
        if self.flash_frames > 0 {
            let c = self.flash_color.clone();
            self.cmds.push(Cmd::Flash(c));
            self.flash_frames -= 1;
        }
        if self.shake_frames > 0 {
            let m = self.shake_mag;
            self.cmds.push(Cmd::Shake(m));
            self.shake_frames -= 1;
        }
    }

    fn exec_one(&mut self, s: &Stmt) {
        if self.stopped || self.returning { return; }
        match s {
            Stmt::Assign(t, v) => { let val=self.eval(v); self.set_var(t, val); }
            Stmt::Add(t, v) => {
                let val=self.eval(v); let cur=self.get_var(t);
                // amount mirrors JS: `typeof val==='string' ? parseFloat(val)||0 : val`
                let amount = match &val { Val::Str(s) => { let p = js_parse_float(s); if p != p { 0.0 } else { p } }, Val::Undef => f64::NAN, o => as_num(o) };
                match cur {
                    Val::List(l) => l.borrow_mut().push(val),
                    Val::Str(s) => self.set_var(t, Val::Str(s + &display(&val))),
                    // JS `(current || 0) + amount` — a NaN/0 accumulator coerces to 0
                    Val::Num(n) => self.set_var(t, Val::Num((if n != n { 0.0 } else { n }) + amount)),
                    Val::Undef => self.set_var(t, Val::Num(amount)),
                    _ => {}
                }
            }
            Stmt::Remove(t, v) => {
                let val=self.eval(v); let cur=self.get_var(t);
                match cur { Val::List(l)=>{ let mut b=l.borrow_mut(); if let Some(i)=b.iter().position(|x| loose_eq(x,&val)) { b.remove(i); } } Val::Num(n)=>self.set_var(t, Val::Num(n - as_num(&val))), _=>{} }
            }
            Stmt::Simple(op, t) => {
                let cur=self.get_var(t);
                match *op {
                    "double" => if let Val::Num(n)=cur { self.set_var(t, Val::Num(n*2.0)); }
                    "halve" => if let Val::Num(n)=cur { self.set_var(t, Val::Num(n/2.0)); }
                    "toggle" => match cur { Val::Bool(b)=>self.set_var(t,Val::Bool(!b)), Val::Num(n)=>self.set_var(t,Val::Num(if n==0.0 {1.0} else {0.0})), Val::Str(ref s) if s=="yes"=>self.set_var(t,Val::Str("no".to_string())), Val::Str(ref s) if s=="no"=>self.set_var(t,Val::Str("yes".to_string())), _=>{ let tr=truthy(&cur); self.set_var(t,Val::Bool(!tr)); } },
                    _ => {}
                }
            }
            Stmt::FuncDef(name, params, body) => { self.funcs.insert(name.clone(), (params.clone(), body.clone())); }
            Stmt::Call(name, _a, arg_exprs) => { if let Some((params, body))=self.funcs.get(name).cloned() {
                // bind call args -> params positionally (argExprs are the call's
                // top-level comma / at / with separated arguments). fc is all-global,
                // so params become globals.
                if !params.is_empty() {
                    for (idx, p) in params.iter().enumerate() {
                        if let Some(e) = arg_exprs.get(idx) {
                            let v = self.eval(e);
                            self.set_var(p, v);
                        }
                    }
                }
                self.exec_block(&body);
            } }
            Stmt::RepeatTimes(c, body) => { let n=as_num(&self.eval(c)) as i64; let mut i=0; while i<n && !self.stopped && self.ops<100000 { self.ops+=1; self.exec_block(body); i+=1; } }
            Stmt::RepeatRange(var, from, to, body) => {
                let f=as_num(&self.eval(from)); let t=as_num(&self.eval(to)); let step=if f<=t {1.0} else {-1.0};
                let mut i=f; while (step>0.0 && i<=t)||(step<0.0 && i>=t) { if self.stopped||self.ops>100000 {break;} self.ops+=1; self.set_var(var, Val::Num(i)); self.exec_block(body); i+=step; }
            }
            Stmt::RepeatWhile(c, body) => { while self.eval_cond(c) && !self.stopped && self.ops<100000 { self.ops+=1; self.exec_block(body); } }
            Stmt::RepeatUntil(c, body) => { while !self.eval_cond(c) && !self.stopped && self.ops<100000 { self.ops+=1; self.exec_block(body); } }
            Stmt::Forever(body) => { let mut i=0; while i<1000 && !self.stopped && self.ops<100000 { self.ops+=1; self.exec_block(body); i+=1; } }
            Stmt::With(body) => { self.exec_block(body); }   // scoping-only at parse time (`its` rewritten); run the body
            // `every N frames/seconds` — run body on a cadence. JS keeps a per-statement
            // counter that ticks once PER EXECUTION (not per frame) and fires when
            // counter % period == 0. We mirror that with a per-`id` counter so it's correct
            // both in a game loop (runs once/frame) AND in a top-level script (runs once →
            // counter 1, never fires for period>1). Was `1 % period`, which fired only for
            // period 1 — so `every N>1` (mp-dots broadcast, flappy pipes, ...) never ran.
            Stmt::Every(n, unit, body, id) => {
                let period = if unit=="seconds" { (n*60.0 + 0.5) as i64 } else { *n as i64 };
                let period = if period < 1 { 1u64 } else { period as u64 };
                let c = { let e = self.every_counts.entry(*id).or_insert(0); *e += 1; *e };
                if c % period == 0 { self.exec_block(body); }
            }
            Stmt::Each(var, list, where_, then, body) => {
                if let Val::List(l) = self.eval(list) {
                    let items: Vec<Val> = l.borrow().clone();
                    for it in items { if self.stopped||self.ops>100000 {break;} self.ops+=1; self.set_var(var, it);
                        if let Some(w)=where_ { if !self.eval_cond(w) { continue; } }
                        if let Some(t)=then { self.exec_one(t); }
                        if !body.is_empty() { self.exec_block(body); } }
                }
            }
            Stmt::Return(_) => { self.returning=true; }
            Stmt::Stop => { self.stopped=true; }
            Stmt::ClearScreen(color) => { let c = color_of(&self.vars, color); self.cmds.push(Cmd::Rect(0.0,0.0,128.0,128.0,c)); }
            Stmt::Pset(x, y, color) => {
                // plot a single pixel — a 1x1 rect, no camera offset (matches JS pset)
                let px = js_floor(as_num(&self.eval(x)));
                let py = js_floor(as_num(&self.eval(y)));
                let cc = color_of(&self.vars, color); self.cmds.push(Cmd::Rect(px, py, 1.0, 1.0, cc));
            }
            Stmt::Draw(a) => {
                let (ox, oy) = if a.hud { (0.0,0.0) } else { self.camera };
                let x = (if let Some(e)=&a.x { as_num(&self.eval(e)) } else { 0.0 }) - ox;
                let y = (if let Some(e)=&a.y { as_num(&self.eval(e)) } else { 0.0 }) - oy;
                let col = color_of(&self.vars, a.color.as_deref().unwrap_or(""));
                match a.shape.as_str() {
                    "rect" => { let w = if let Some(e)=&a.w { as_num(&self.eval(e)) } else { 8.0 }; let h = if let Some(e)=&a.h { as_num(&self.eval(e)) } else { w }; self.cmds.push(Cmd::Rect(x,y,w,h,col)); }
                    "circle" => { let r = if let Some(e)=&a.w { as_num(&self.eval(e)) } else { 4.0 }; self.cmds.push(Cmd::Circle(x,y,r,col)); }
                    "line" => {
                        let x1=(if let Some(e)=&a.x1 {as_num(&self.eval(e))} else {0.0})-ox; let y1=(if let Some(e)=&a.y1 {as_num(&self.eval(e))} else {0.0})-oy;
                        let x2=(if let Some(e)=&a.x2 {as_num(&self.eval(e))} else {0.0})-ox; let y2=(if let Some(e)=&a.y2 {as_num(&self.eval(e))} else {0.0})-oy;
                        self.cmds.push(Cmd::Line(x1,y1,x2,y2,col));
                    }
                    "sprite" => {
                        let mut name = a.sprite_name.clone().unwrap_or_default();
                        let mut bounce = 0.0;
                        if name.is_empty() {
                            if let Some(e) = &a.sprite_name_expr {
                                match self.eval(e) {
                                    Val::Str(rs) => { name = rs.to_lowercase().replace(' ', "_"); }
                                    Val::Obj(o) => {
                                        let img = match o.borrow().get("image") { Some(Val::Str(s)) => s.to_lowercase().replace(' ', "_"), _ => String::new() };
                                        let facing = match o.borrow().get("facing") { Some(Val::Str(f)) => Some(f.clone()), _ => None };
                                        name = if let Some(f) = facing {
                                            let variant = alloc::format!("{}_{}", img, f);
                                            if SPRITES.iter().any(|(n,_)| *n == variant) { variant } else { img }
                                        } else { img };
                                        let walking = matches!(o.borrow().get("walking"), Some(Val::Bool(true)));
                                        if walking && ((self.tick / 12) % 2) == 1 { bounce = -1.0; }
                                    }
                                    _ => {}
                                }
                            }
                        }
                        blit_sprite(&name, x, y + bounce, &mut self.cmds);
                    }
                    _ => {}
                }
            }
            Stmt::Say(e) => { let raw = display(&self.eval(e)); let t = self.interpolate(&raw); self.says.push(t); }
            Stmt::Write(w) => {
                let (ox, oy) = if w.hud { (0.0,0.0) } else { self.camera };
                let tv = self.eval(&w.text); let txt = self.interpolate(&display(&tv));
                let x = (if let Some(e)=&w.x { as_num(&self.eval(e)) } else { 0.0 }) - ox;
                let y = (if let Some(e)=&w.y { as_num(&self.eval(e)) } else { 0.0 }) - oy;
                let col = color_of(&self.vars, w.color.as_deref().unwrap_or(""));
                self.cmds.push(Cmd::Text(txt, x, y, col));
            }
            Stmt::WhenKey(key, then, body) => { self.key_handlers.insert(key.to_lowercase(), (then.as_ref().map(|b| (**b).clone()), body.clone())); }
            Stmt::WhenButton(label, then, body) => { self.button_handlers.insert(label.to_lowercase(), (then.as_ref().map(|b| (**b).clone()), body.clone())); }
            Stmt::WhenMouse(event, then, body) => { self.mouse_handlers.insert(event.to_lowercase(), (then.as_ref().map(|b| (**b).clone()), body.clone())); }
            Stmt::WhenTimeout(then, body) => { self.timeout_handler = Some((then.as_ref().map(|b| (**b).clone()), body.clone())); }
            Stmt::TimeLimit(value, unit) => {
                let secs = as_num(&self.eval(value));
                let frames = if unit=="seconds" { js_floor(secs*60.0 + 0.5) } else { js_floor(secs + 0.5) };
                let f = if frames < 0.0 { 0 } else { frames as i64 };
                self.time_limit_frames = Some(f); self.time_left = f; self.timeout_fired = false;
                self.set_var("timer", Val::Num(((f + 59) / 60) as f64));
            }

            Stmt::Flash(color, value, unit) => {
                let n = as_num(&self.eval(value));
                let frames = if unit=="seconds" { js_floor(n*60.0 + 0.5) } else { js_floor(n + 0.5) };
                self.flash_frames = if frames < 0.0 { 0 } else { frames as i64 };
                self.flash_color = color.clone();
            }
            Stmt::Shake(value, unit, magnitude) => {
                let n = as_num(&self.eval(value));
                let frames = if unit=="seconds" { js_floor(n*60.0 + 0.5) } else { js_floor(n + 0.5) };
                self.shake_frames = if frames < 0.0 { 0 } else { frames as i64 };
                let m = as_num(&self.eval(magnitude));
                self.shake_mag = if m < 0.0 { 0.0 } else { m };
            }
            Stmt::Emit{rate,x,y,rf,marker,color,frames,unit} => {
                let n = as_num(&self.eval(frames));
                let f = if unit=="seconds" { js_floor(n*60.0 + 0.5) } else { js_floor(n + 0.5) };
                let frames_left = if f < 0.0 { 0 } else { f as i64 };
                if frames_left > 0 {
                    let col = color_of(&self.vars, color);
                    let (px, py) = if let Some(r) = rf { (0.0, 0.0) } else {
                        (x.as_ref().map(|e| as_num(&self.eval(e))).unwrap_or(0.0),
                         y.as_ref().map(|e| as_num(&self.eval(e))).unwrap_or(0.0))
                    };
                    let r = as_num(&self.eval(rate)) as i64;
                    let rate_v = r.max(1).min(16);
                    self.emitters.push(Emitter { rf: rf.clone(), x: px, y: py, color: col, marker: marker.clone(), rate: rate_v, frames: frames_left });
                    while self.emitters.len() > 16 { self.emitters.remove(0); }
                }
            }
            Stmt::Tween{target,from,to,frames,unit,ease} => {
                let n = as_num(&self.eval(frames));
                let f = if unit=="seconds" { js_floor(n*60.0 + 0.5) } else { js_floor(n + 0.5) };
                let frames_v = if f < 1.0 { 1 } else { f as i64 };
                let a = as_num(&self.eval(from));
                let b = as_num(&self.eval(to));
                let e = match ease.as_str() { "in"|"out"|"in out"|"bounce" => ease.clone(), _ => String::new() };
                self.tweens.retain(|t| t.target != *target);   // a new tween replaces one on the same target
                self.tweens.push(Tween { target: target.clone(), from: a, to: b, frames: frames_v, tick: 0, ease: e });
                if self.tweens.len() > 16 { self.tweens.remove(0); }
                self.set_var(target, Val::Num(a));
            }

            Stmt::Inventory(subject) => { self.inventory_handle(subject); }
            Stmt::InvAdd(subject, item) => {
                let v = self.eval(item);
                let inv = self.inventory_handle(subject);
                let exists = inv.borrow().iter().any(|x| strict_eq(x, &v));
                if !exists { inv.borrow_mut().push(v); }
            }
            Stmt::InvRemove(subject, item) => {
                let v = self.eval(item);
                let inv = self.inventory_handle(subject);
                let at = inv.borrow().iter().position(|x| strict_eq(x, &v));
                if let Some(a) = at { inv.borrow_mut().remove(a); }
            }
            Stmt::Goto(target) => {
                if let Val::Str(m) = self.get_var("mode") { if !m.is_empty() { self.screen_stack.push(m); } }
                self.set_var("mode", Val::Str(target.clone()));
                self.buttons.clear();   // old buttons must not catch stale clicks
            }
            Stmt::GoBack => { if let Some(m) = self.screen_stack.pop() { self.set_var("mode", Val::Str(m)); self.buttons.clear(); } }
            // `jump <target> <force>` — upward velocity impulse (pairs with `gravity is N`).
            // Mirrors JS: obj.dy = -force. Without this arm the stmt was a silent no-op,
            // so flappy's flap / pitfall's hop did nothing in the wasm core (gravity-only fall).
            Stmt::Jump(target, force) => { if let Val::Obj(o) = self.get_var(target) { o.borrow_mut().insert("dy".to_string(), Val::Num(-*force)); } }
            // `show meter CURRENT of MAX at X,Y size W,H in COLOR` — HUD progress bar.
            // Mirrors JS drawMeter (border/track/fill rects + centered percent text).
            // Was a silent no-op, so coin-quest's HP meter never drew in the wasm core.
            Stmt::Meter(cur_e, max_e, x_e, y_e, w_e, h_e, color) => {
                let cur = as_num(&self.eval(cur_e));
                let mut max = as_num(&self.eval(max_e)); if max == 0.0 || max.is_nan() { max = 1.0; }
                let x = js_floor(as_num(&self.eval(x_e)));
                let y = js_floor(as_num(&self.eval(y_e)));
                let w = { let v = js_floor(as_num(&self.eval(w_e))); if v < 3.0 { 3.0 } else { v } };
                let h = { let v = js_floor(as_num(&self.eval(h_e))); if v < 3.0 { 3.0 } else { v } };
                let frac = { let f = cur / max; if f < 0.0 { 0.0 } else if f > 1.0 { 1.0 } else { f } };
                self.cmds.push(Cmd::Rect(x, y, w, h, "#000000".to_string()));
                self.cmds.push(Cmd::Rect(x + 1.0, y + 1.0, w - 2.0, h - 2.0, "#5f574f".to_string()));
                let fill_w = js_floor((w - 2.0) * frac + 0.5);
                if fill_w > 0.0 { let cc = color_of(&self.vars, color); self.cmds.push(Cmd::Rect(x + 1.0, y + 1.0, fill_w, h - 2.0, cc)); }
                if w >= 18.0 && h >= 5.0 {
                    let mut pct = display(&Val::Num(js_floor(frac * 100.0 + 0.5))); pct.push('%');
                    let text_w = (pct.chars().count() as f64) * 4.0 - 1.0;
                    let tx = x + { let v = js_floor((w - text_w) / 2.0); if v < 1.0 { 1.0 } else { v } };
                    let ty = y + js_floor((h - 5.0) / 2.0);
                    self.cmds.push(Cmd::Text(pct, tx, ty, "#fff1e8".to_string()));
                }
            }
            Stmt::Button(label, xe, ye) => {
                // mirror drawButton(): HUD-space box (no camera) + label text
                let x = js_floor(as_num(&self.eval(xe)));
                let y = js_floor(as_num(&self.eval(ye)));
                let w = (label.chars().count() as f64) * 4.0 + 8.0;
                let h = 11.0;
                self.buttons.push((label.to_lowercase(), x, y, w, h));
                self.cmds.push(Cmd::Rect(x, y, w, h, "#29adff".to_string()));
                self.cmds.push(Cmd::Rect(x + 1.0, y + 1.0, w - 2.0, h - 2.0, "#1d2b53".to_string()));
                self.cmds.push(Cmd::Text(label.clone(), x + 4.0, y + 3.0, "#fff1e8".to_string()));
            }
            Stmt::MoveArrows(target, speed) => {
                if let Val::Obj(o) = self.get_var(target) {
                    let sp = match speed { Some(e)=>as_num(&self.eval(e)), None=>Self::obj_num(&o,"speed").unwrap_or(1.0) };
                    let k = |n: &str| *self.key_state.get(n).unwrap_or(&false);
                    let mut mx = 0.0; let mut my = 0.0;
                    if k("up") { my -= 1.0; } if k("down") { my += 1.0; }
                    if k("left") { mx -= 1.0; } if k("right") { mx += 1.0; }
                    if mx != 0.0 && my != 0.0 { mx *= 0.7071; my *= 0.7071; }
                    let walking = mx != 0.0 || my != 0.0;
                    { let mut b = o.borrow_mut();
                      let x = match b.get("x") { Some(Val::Num(n))=>*n, _=>0.0 };
                      let y = match b.get("y") { Some(Val::Num(n))=>*n, _=>0.0 };
                      b.insert("x".into(), Val::Num(x + mx*sp));
                      b.insert("y".into(), Val::Num(y + my*sp));
                      b.insert("walking".into(), Val::Bool(walking)); }
                    if walking {
                        let dir = if mx.abs() >= my.abs() { if mx > 0.0 {"right"} else {"left"} } else if my > 0.0 {"down"} else {"up"};
                        let (dx, dy) = dir_vec(dir);
                        let mut b = o.borrow_mut();
                        b.insert("facing".into(), Val::Str(dir.into()));
                        b.insert("dx".into(), Val::Num(dx));
                        b.insert("dy".into(), Val::Num(dy));
                    }
                }
            }
            // `move X by DX, DY [blocked by WALLS]` — per-axis move that slides along
            // solid wall boxes. Mirrors JS move_by. Was parsed/emitted but never executed,
            // so hunt's `move me by vx,vy blocked by walls` left the player pinned in place.
            Stmt::MoveBy(target, dx_e, dy_e, blocked_by) => {
                if let Val::Obj(o) = self.get_var(target) {
                    let dx = { let v = as_num(&self.eval(dx_e)); if v.is_nan() { 0.0 } else { v } };
                    let dy = { let v = as_num(&self.eval(dy_e)); if v.is_nan() { 0.0 } else { v } };
                    let walls: Vec<(f64, f64, f64, f64)> = match blocked_by {
                        Some(name) => match self.get_var(name) {
                            Val::List(l) => l.borrow().iter().filter_map(|it| match it {
                                Val::Obj(w) => Self::obj_num(w, "x").map(|wx| (wx, Self::obj_num(w, "y").unwrap_or(0.0), Self::obj_num(w, "w").unwrap_or(8.0), Self::obj_num(w, "h").unwrap_or(8.0))),
                                _ => None,
                            }).collect(),
                            _ => Vec::new(),
                        },
                        None => Vec::new(),
                    };
                    let sz = Self::obj_num(&o, "w").unwrap_or(6.0);
                    let blocked = |px: f64, py: f64| -> bool {
                        for (wx, wy, ww, wh) in &walls {
                            if px + sz > *wx && px < *wx + *ww && py + sz > *wy && py < *wy + *wh { return true; }
                        }
                        false
                    };
                    let ox = Self::obj_num(&o, "x").unwrap_or(0.0);
                    let oy = Self::obj_num(&o, "y").unwrap_or(0.0);
                    if !blocked(ox + dx, oy) { o.borrow_mut().insert("x".into(), Val::Num(ox + dx)); }
                    let ox2 = Self::obj_num(&o, "x").unwrap_or(0.0);
                    if !blocked(ox2, oy + dy) { o.borrow_mut().insert("y".into(), Val::Num(oy + dy)); }
                }
            }
            Stmt::Follow(t) => { self.follow = Some(t.clone()); }
            Stmt::Tag(subject, tag) => { let e = self.tags.entry(tag.clone()).or_insert_with(Vec::new); if !e.contains(subject) { e.push(subject.clone()); } }
            Stmt::WhenPickup(item, body) => { self.pickup_handlers.insert(item.clone(), body.clone()); }
            Stmt::WhenHit(item, body) => { self.hit_handlers.insert(item.clone(), body.clone()); }
            Stmt::WhenDefeat(item, body) => { self.defeat_handlers.insert(item.clone(), body.clone()); }
            Stmt::RunGame(fs) => { self.run_fs = fs.clone(); self.has_game = true; self.frame_step(&fs.clone()); }
            Stmt::Save(v, k) => {
                let key = display(&self.eval(k));
                let val = self.eval(v);
                self.store.insert(key, deep_clone(&val));
            }
            Stmt::TileDef(ch, props) => {
                let p = self.eval(props);
                let stored = if let Val::Obj(_) = p { p } else { Val::Obj(Rc::new(RefCell::new(BTreeMap::new()))) };
                self.tile_defs.insert(ch.clone(), stored);
            }
            Stmt::MapDef(rows) => {
                self.map_rows = rows.clone();
                if !rows.is_empty() {
                    let mut cols = 0usize;
                    for r in rows { let n = r.chars().count(); if n > cols { cols = n; } }
                    let w = if cols*8 > 128 { (cols*8) as f64 } else { 128.0 };
                    let h = if rows.len()*8 > 128 { (rows.len()*8) as f64 } else { 128.0 };
                    let mut m = BTreeMap::new();
                    m.insert("width".to_string(), Val::Num(w));
                    m.insert("height".to_string(), Val::Num(h));
                    self.vars.insert("world".to_string(), Val::Obj(Rc::new(RefCell::new(m))));
                }
            }
            Stmt::DrawMap => {
                let (ox, oy) = self.camera;
                let rows = self.map_rows.clone();
                for (r, row) in rows.iter().enumerate() {
                    let y = (r * 8) as f64 - oy;
                    if y <= -8.0 || y >= 128.0 { continue; }
                    for (c, ch) in row.chars().enumerate() {
                        let img = match self.tile_defs.get(&ch.to_string()) {
                            Some(Val::Obj(o)) => match o.borrow().get("image") { Some(Val::Str(s)) => Some(s.clone()), _ => None },
                            _ => None,
                        };
                        let img = match img { Some(i) => i, None => continue };
                        let x = (c * 8) as f64 - ox;
                        if x <= -8.0 || x >= 128.0 { continue; }
                        blit_sprite(&img, x, y, &mut self.cmds);
                    }
                }
            }
            Stmt::Behavior(b) => {
                let subj = self.get_var(&b.subject);
                let speed_once: Option<f64> = match &b.speed { Some(e)=>Some(as_num(&self.eval(e))), None=>None };
                let items: Vec<Val> = match &subj {
                    Val::List(l) => l.borrow().clone(),
                    Val::Obj(_) => { let mut v=Vec::new(); v.push(subj.clone()); v }
                    _ => Vec::new(),
                };
                for it in items { if let Val::Obj(o) = it {
                    let x1 = match &b.x1 { Some(e)=>Some(as_num(&self.eval(e))), None=>None };
                    let x2 = match &b.x2 { Some(e)=>Some(as_num(&self.eval(e))), None=>None };
                    let member_speed = match o.borrow().get("speed") { Some(Val::Num(n))=>Some(*n), _=>None };
                    let spd = match speed_once { Some(sv)=>sv, None=>member_speed.unwrap_or(0.5) };
                    let mut m = BTreeMap::new();
                    m.insert("kind".to_string(), Val::Str(b.kind.clone()));
                    if b.kind == "chase" { m.insert("target".to_string(), Val::Str(b.target.clone())); }
                    if b.kind == "patrol" {
                        m.insert("x1".to_string(), Val::Num(x1.unwrap_or(0.0)));
                        m.insert("x2".to_string(), Val::Num(x2.unwrap_or(0.0)));
                        m.insert("dir".to_string(), Val::Num(1.0));
                    }
                    if b.kind == "flee" {
                        m.insert("target".to_string(), Val::Str(b.target.clone()));
                        if let Some(w) = &b.within { let wv = as_num(&self.eval(w)); m.insert("within".to_string(), Val::Num(wv)); }
                    }
                    if b.kind == "patrol_points" {
                        let pts = match &b.points { Some(e) => self.eval(e), None => Val::Undef };
                        m.insert("points".to_string(), pts);
                        m.insert("idx".to_string(), Val::Num(0.0));
                    }
                    if b.through { m.insert("through".to_string(), Val::Bool(true)); }
                    m.insert("speed".to_string(), Val::Num(spd));
                    o.borrow_mut().insert("behavior".to_string(), Val::Obj(Rc::new(RefCell::new(m))));
                }}
                if !self.behavior_subjects.contains(&b.subject) { self.behavior_subjects.push(b.subject.clone()); }
            }
            Stmt::Animate(subject, frames, every) => {
                let subj = self.get_var(subject);
                let items: Vec<Val> = match &subj {
                    Val::List(l) => l.borrow().clone(),
                    Val::Obj(_) => { let mut v=Vec::new(); v.push(subj.clone()); v }
                    _ => Vec::new(),
                };
                for it in items { if let Val::Obj(o) = it {
                    let mut m = BTreeMap::new();
                    m.insert("frames".to_string(), Val::List(Rc::new(RefCell::new(frames.iter().map(|f| Val::Str(f.clone())).collect()))));
                    m.insert("every".to_string(), Val::Num(*every));
                    o.borrow_mut().insert("animation".to_string(), Val::Obj(Rc::new(RefCell::new(m))));
                }}
            }
            Stmt::Burst(count, x, y, rref, color) => {
                // eval order mirrors JS: ref (or x,y) first, then count; an
                // invalid ref emits nothing (and skips the count eval).
                let pos = if let Some(r) = rref {
                    match self.eval(r) {
                        Val::Obj(ob) => match (Self::obj_num(&ob, "x"), Self::obj_num(&ob, "y")) {
                            (Some(ox), Some(oy)) => Some((ox + 4.0, oy + 4.0)),
                            _ => None,
                        },
                        _ => None,
                    }
                } else {
                    let xv = x.as_ref().map(|e| as_num(&self.eval(e))).unwrap_or(0.0);
                    let yv = y.as_ref().map(|e| as_num(&self.eval(e))).unwrap_or(0.0);
                    Some((xv, yv))
                };
                if let Some((px, py)) = pos {
                    let n = (as_num(&self.eval(count)) as i64).max(1).min(64);
                    let palette: Vec<String> = match color {
                        Some(c) => { let mut v = Vec::new(); v.push(color_of(&self.vars, c)); v }
                        None => { let mut v = Vec::new(); v.push("#ffec27".to_string()); v.push("#fff1e8".to_string()); v.push("#ffa300".to_string()); v }
                    };
                    for i in 0..n {
                        let a = self.rng() * core::f64::consts::PI * 2.0;
                        let sp = 0.4 + self.rng() * 1.4;
                        let life = 16 + (self.rng() * 18.0) as i64;   // JS: 16 + (random()*18 | 0)
                        self.particles.push(Particle {
                            x: px, y: py,
                            vx: libm::cos(a) * sp, vy: libm::sin(a) * sp,
                            life: life as i32,
                            color: palette[(i as usize) % palette.len()].clone(),
                        });
                    }
                    if self.particles.len() > 400 {
                        let excess = self.particles.len() - 400;
                        self.particles.drain(0..excess);
                    }
                }
            }
            Stmt::PlaySound(kind, name) => { self.cmds.push(Cmd::Sound(kind.clone(), name.clone())); }
            Stmt::StopSound => { self.cmds.push(Cmd::Sound("stopmusic".to_string(), String::new())); }
            Stmt::NetJoin(game, room) => { self.cmds.push(Cmd::Net("join".to_string(), game.clone(), room.clone())); }
            Stmt::Broadcast(e) => {
                let v = self.eval(e);   // JS only broadcasts objects/arrays
                if matches!(v, Val::Obj(_) | Val::List(_)) { let mut j = String::new(); emit_val(&v, &mut j); self.cmds.push(Cmd::Net("broadcast".to_string(), j, String::new())); }
            }
            Stmt::DefSfx(name, rec) => {
                // build the recipe JSON the JS AUDIO.defineSfx/playRecipe expects
                let mut r = String::from("{");
                if rec.tone {
                    r.push_str("\"kind\":\"tone\",\"wave\":"); json_str(&rec.wave, &mut r);
                    r.push_str(",\"f0\":"); json_num(rec.f0, &mut r);
                    if let Some(f1) = rec.f1 { r.push_str(",\"f1\":"); json_num(f1, &mut r); }
                    r.push_str(",\"dur\":"); json_num(rec.dur, &mut r);
                } else {
                    r.push_str("\"kind\":\"notes\",\"notes\":[");
                    for (i, nf) in rec.notes.iter().enumerate() { if i > 0 { r.push(','); } json_num(*nf, &mut r); }
                    r.push_str("],\"dur\":"); json_num(rec.dur, &mut r);
                }
                r.push('}');
                self.cmds.push(Cmd::DefSfx(name.clone(), r));
            }
            _ => {} // tag/when_*/sprite/etc: no command in single-exec render slice
        }
    }
}

const RES_CAP: usize = 1 << 20;
static mut RES: [u8; RES_CAP] = [0; RES_CAP];
#[no_mangle] pub extern "C" fn res_ptr() -> *const u8 { addr_of!(RES) as *const u8 }
#[no_mangle] pub extern "C" fn parse_exec_to_json(len: u32, seed: u32) -> u32 {
    reset_arena();
    let n = (len as usize).min(SRC_CAP);
    let src = unsafe { core::slice::from_raw_parts(addr_of!(SRC) as *const u8, n) }.to_vec();
    let program = parse_program(&src);
    let mut rt = Rt::new(seed);
    rt.exec_block(&program);
    let mut s = String::new();
    s.push_str("{\"errors\":[],\"say\":[");
    for (i,t) in rt.says.iter().enumerate() { if i>0 {s.push(',');} json_str(t,&mut s); }
    s.push_str("],\"vars\":{");
    for (i,(k,v)) in rt.vars.iter().enumerate() { if i>0 {s.push(',');} json_str(k,&mut s); s.push(':'); emit_val(v,&mut s); }
    s.push_str("}}");
    let b = s.as_bytes(); let m = b.len().min(RES_CAP);
    unsafe { let out = core::slice::from_raw_parts_mut(addr_of_mut!(RES) as *mut u8, RES_CAP); out[..m].copy_from_slice(&b[..m]); }
    m as u32
}
fn emit_val(v: &Val, out: &mut String) {
    match v {
        Val::Num(n)=>json_num(*n,out), Val::Str(s)=>json_str(s,out), Val::Bool(b)=>out.push_str(if *b {"true"} else {"false"}),
        Val::List(l)=>{ out.push('['); for (i,x) in l.borrow().iter().enumerate(){ if i>0 {out.push(',');} emit_val(x,out);} out.push(']'); }
        Val::Obj(o)=>{ out.push('{'); for (i,(k,x)) in o.borrow().iter().enumerate(){ if i>0 {out.push(',');} json_str(k,out); out.push(':'); emit_val(x,out);} out.push('}'); }
        Val::Undef=>out.push_str("null"),
    }
}

// --- stage 3b: render command buffer ---------------------------------------
fn color_hex(n: &str) -> Option<&'static str> {
    Some(match n {
        "black"=>"#000000","dark blue"=>"#1d2b53","dark purple"=>"#7e2553","dark green"=>"#008751",
        "brown"=>"#ab5236","dark gray"=>"#5f574f","dark grey"=>"#5f574f","light gray"=>"#c2c3c7","light grey"=>"#c2c3c7",
        "white"=>"#fff1e8","red"=>"#ff004d","orange"=>"#ffa300","yellow"=>"#ffec27","green"=>"#00e436","blue"=>"#29adff",
        "indigo"=>"#83769c","pink"=>"#ff77a8","peach"=>"#ffccaa","gray"=>"#8e8e8e","grey"=>"#8e8e8e","gold"=>"#ffd700",
        "cyan"=>"#00ffff","magenta"=>"#ff00ff","purple"=>"#9b59b6","lime"=>"#aaff00","sky"=>"#87ceeb","coral"=>"#ff6f61",
        _=>return None,
    })
}
// A color word resolves to the palette/CSS name — UNLESS a variable of that name
// exists, in which case its value names the color (dynamic colors: `shade is green`
// … `draw rect … in shade`). Mirrors the JS Runtime.colorOf.
// Easing curves for `tween` — identical to the JS easeOf.
fn ease_curve(kind: &str, t: f64) -> f64 {
    match kind {
        "in" => t * t,
        "out" => t * (2.0 - t),
        "in out" => if t < 0.5 { 2.0 * t * t } else { 1.0 - 2.0 * (1.0 - t) * (1.0 - t) },
        "bounce" => {
            let (n, d) = (7.5625, 2.75);
            let mut t = t;
            if t < 1.0 / d { return n * t * t; }
            if t < 2.0 / d { t -= 1.5 / d; return n * t * t + 0.75; }
            if t < 2.5 / d { t -= 2.25 / d; return n * t * t + 0.9375; }
            t -= 2.625 / d; n * t * t + 0.984375
        }
        _ => t,
    }
}
fn color_of(vars: &BTreeMap<String, Val>, name: &str) -> String {
    if !name.is_empty() {
        if let Some(Val::Str(s)) = vars.get(name) { return resolve_color(s); }
    }
    resolve_color(name)
}
fn resolve_color(name: &str) -> String {
    let n = name.trim().to_lowercase();
    if let Some(h) = color_hex(&n) { return h.to_string(); }
    if n.starts_with('#') || n.starts_with("rgb") { return n; }
    "#fff1e8".to_string()
}
#[derive(Clone)]
enum Cmd { Rect(f64,f64,f64,f64,String), Circle(f64,f64,f64,String), Line(f64,f64,f64,f64,String), Text(String,f64,f64,String),
    Flash(String), Shake(f64),
    // host-side effects routed through the command buffer (the bridge consumes
    // these and calls the existing JS AUDIO engine — single audio source).
    Sound(String,String), DefSfx(String,String), Net(String,String,String) }

include!("sprites_gen.rs");
fn js_floor(x: f64) -> f64 { let t = x as i64 as f64; if t > x { t - 1.0 } else { t } }
fn dir_vec(d: &str) -> (f64, f64) { match d { "up"=>(0.0,-1.0), "down"=>(0.0,1.0), "left"=>(-1.0,0.0), "right"=>(1.0,0.0), _=>(0.0,0.0) } }
fn singularize(plural: &str) -> String {
    let s = plural.to_lowercase();
    if s.ends_with("ies") { return alloc::format!("{}y", &s[..s.len()-3]); }
    if s.ends_with("ses") { return s[..s.len()-2].to_string(); }
    if s.ends_with("es") && (s.ends_with("xes") || s.ends_with("shes") || s.ends_with("ches")) { return s[..s.len()-2].to_string(); }
    if s.ends_with('s') && s.len() > 1 { return s[..s.len()-1].to_string(); }
    s
}
// Mirror of index.html drawSprite(): one 1x1 rect per opaque pixel (recorder parity).
fn blit_sprite(name: &str, x: f64, y: f64, cmds: &mut Vec<Cmd>) {
    let hex = match SPRITES.iter().find(|(n, _)| *n == name) { Some((_, h)) => *h, None => return };
    let (fx, fy) = (js_floor(x), js_floor(y));
    for (i, ch) in hex.bytes().enumerate().take(64) {
        let ci = match ch { b'0'..=b'9' => (ch - b'0') as usize, b'a'..=b'f' => (ch - b'a' + 10) as usize, b'A'..=b'F' => (ch - b'A' + 10) as usize, _ => 0 };
        if ci == 0 { continue; }
        let px = (i % 8) as f64; let py = (i / 8) as f64;
        cmds.push(Cmd::Rect(fx + px, fy + py, 1.0, 1.0, SPRITE_PAL[ci].to_string()));
    }
}
fn emit_cmd(c: &Cmd, out: &mut String) {
    match c {
        Cmd::Rect(x,y,w,h,col)=>{ out.push_str("{\"color\":"); json_str(col,out); out.push_str(",\"h\":"); json_num(*h,out); out.push_str(",\"op\":\"rect\",\"w\":"); json_num(*w,out); out.push_str(",\"x\":"); json_num(*x,out); out.push_str(",\"y\":"); json_num(*y,out); out.push('}'); }
        Cmd::Circle(x,y,r,col)=>{ out.push_str("{\"color\":"); json_str(col,out); out.push_str(",\"op\":\"circle\",\"r\":"); json_num(*r,out); out.push_str(",\"x\":"); json_num(*x,out); out.push_str(",\"y\":"); json_num(*y,out); out.push('}'); }
        Cmd::Line(x1,y1,x2,y2,col)=>{ out.push_str("{\"color\":"); json_str(col,out); out.push_str(",\"op\":\"line\",\"x1\":"); json_num(*x1,out); out.push_str(",\"x2\":"); json_num(*x2,out); out.push_str(",\"y1\":"); json_num(*y1,out); out.push_str(",\"y2\":"); json_num(*y2,out); out.push('}'); }
        Cmd::Text(t,x,y,col)=>{ out.push_str("{\"color\":"); json_str(col,out); out.push_str(",\"op\":\"text\",\"text\":"); json_str(t,out); out.push_str(",\"x\":"); json_num(*x,out); out.push_str(",\"y\":"); json_num(*y,out); out.push('}'); }
        Cmd::Sound(kind,name)=>{ out.push_str("{\"kind\":"); json_str(kind,out); out.push_str(",\"name\":"); json_str(name,out); out.push_str(",\"op\":\"sound\"}"); }
        Cmd::DefSfx(name,recipe)=>{ out.push_str("{\"name\":"); json_str(name,out); out.push_str(",\"op\":\"defsfx\",\"recipe\":"); out.push_str(recipe); out.push('}'); }
        Cmd::Flash(color)=>{ out.push_str("{\"color\":"); json_str(color,out); out.push_str(",\"op\":\"flash\"}"); }
        Cmd::Shake(m)=>{ out.push_str("{\"magnitude\":"); json_num(*m,out); out.push_str(",\"op\":\"shake\"}"); }
        Cmd::Net(kind,a,b)=>{ out.push_str("{\"a\":"); json_str(a,out); out.push_str(",\"b\":"); json_str(b,out); out.push_str(",\"kind\":"); json_str(kind,out); out.push_str(",\"op\":\"net\"}"); }
    }
}
#[no_mangle] pub extern "C" fn parse_render(len: u32, seed: u32) -> u32 {
    reset_arena();
    let n = (len as usize).min(SRC_CAP);
    let src = unsafe { core::slice::from_raw_parts(addr_of!(SRC) as *const u8, n) }.to_vec();
    let program = parse_program(&src);
    let mut rt = Rt::new(seed);
    rt.exec_block(&program);
    let mut s = String::new();
    s.push('[');
    for (i,c) in rt.cmds.iter().enumerate() { if i>0 {s.push(',');} emit_cmd(c,&mut s); }
    s.push(']');
    unsafe { *core::ptr::addr_of_mut!(LIVE_RT) = Some(rt); }   // keep for step_frame()
    let b = s.as_bytes(); let m = b.len().min(RES_CAP);
    unsafe { let out = core::slice::from_raw_parts_mut(addr_of_mut!(RES) as *mut u8, RES_CAP); out[..m].copy_from_slice(&b[..m]); }
    m as u32
}

// Multi-frame stepping: parse_render runs frame 1 and stashes the runtime;
// each step_frame() call advances one more frame and returns that frame's cmds.
static mut LIVE_RT: Option<Rt> = None;
#[no_mangle] pub extern "C" fn set_key(code: u32, on: u32) {
    let rt = match unsafe { (*core::ptr::addr_of_mut!(LIVE_RT)).as_mut() } { Some(r) => r, None => return };
    let name = match code { 0=>"up",1=>"down",2=>"left",3=>"right",4=>"space",5=>"a",6=>"b",_=>return };
    rt.key_state.insert(name.to_string(), on != 0);
}
#[no_mangle] pub extern "C" fn set_mouse(x: i32, y: i32, down: u32) {
    let rt = match unsafe { (*core::ptr::addr_of_mut!(LIVE_RT)).as_mut() } { Some(r) => r, None => return };
    rt.mouse.0 = x as f64; rt.mouse.1 = y as f64;
    if down != 0 { rt.mouse.2 = true; }   // one-shot click, consumed in frame_step
}
// Host feeds incoming multiplayer state each frame: peers JSON (written to the
// SRC buffer) + the live connection flag, exposed to fc as `peers`/`connected`.
#[no_mangle] pub extern "C" fn set_net(len: u32, connected: u32) {
    let rt = match unsafe { (*core::ptr::addr_of_mut!(LIVE_RT)).as_mut() } { Some(r) => r, None => return };
    let n = (len as usize).min(SRC_CAP);
    let bytes = unsafe { core::slice::from_raw_parts(addr_of!(SRC) as *const u8, n) }.to_vec();
    let s = String::from_utf8_lossy(&bytes);
    rt.vars.insert("peers".to_string(), json_to_val(&s));
    rt.vars.insert("connected".to_string(), Val::Bool(connected != 0));
}
#[no_mangle] pub extern "C" fn step_frame() -> u32 {
    let rt = match unsafe { (*core::ptr::addr_of_mut!(LIVE_RT)).as_mut() } { Some(r) => r, None => return 0 };
    rt.cmds.clear();
    rt.ops = 0;
    let fs = rt.run_fs.clone();
    rt.frame_step(&fs);
    let mut s = String::new();
    s.push('[');
    for (i,c) in rt.cmds.iter().enumerate() { if i>0 {s.push(',');} emit_cmd(c,&mut s); }
    s.push(']');
    let b = s.as_bytes(); let m = b.len().min(RES_CAP);
    unsafe { let out = core::slice::from_raw_parts_mut(addr_of_mut!(RES) as *mut u8, RES_CAP); out[..m].copy_from_slice(&b[..m]); }
    m as u32
}
// The live runtime's `say` lines as a JSON array, plus whether the program runs a
// game loop — the host paints the lines only in script mode, mirroring the JS
// core's `runJSCore` (sayBuffer painted when `!runtime.gameLoop`).
#[no_mangle] pub extern "C" fn dump_say() -> u32 {
    let rt = match unsafe { (*core::ptr::addr_of_mut!(LIVE_RT)).as_ref() } { Some(r) => r, None => return 0 };
    let mut s = String::from("[");
    for (i,t) in rt.says.iter().enumerate() { if i>0 { s.push(','); } json_str(t,&mut s); }
    s.push(']');
    let b = s.as_bytes(); let m = b.len().min(RES_CAP);
    unsafe { let out = core::slice::from_raw_parts_mut(addr_of_mut!(RES) as *mut u8, RES_CAP); out[..m].copy_from_slice(&b[..m]); }
    m as u32
}
#[no_mangle] pub extern "C" fn has_game() -> u32 {
    match unsafe { (*core::ptr::addr_of_mut!(LIVE_RT)).as_ref() } { Some(r) => if r.has_game {1} else {0}, None => 0 }
}
// Read-only snapshot of the LIVE runtime's variables (for the live inspect panel).
// Same JSON shape as parse_exec_to_json's vars, but over the running game's state.
#[no_mangle] pub extern "C" fn dump_vars() -> u32 {
    let rt = match unsafe { (*core::ptr::addr_of_mut!(LIVE_RT)).as_ref() } { Some(r) => r, None => return 0 };
    let mut s = String::from("{");
    for (i,(k,v)) in rt.vars.iter().enumerate() { if i>0 { s.push(','); } json_str(k,&mut s); s.push(':'); emit_val(v,&mut s); }
    s.push('}');
    let b = s.as_bytes(); let m = b.len().min(RES_CAP);
    unsafe { let out = core::slice::from_raw_parts_mut(addr_of_mut!(RES) as *mut u8, RES_CAP); out[..m].copy_from_slice(&b[..m]); }
    m as u32
}
