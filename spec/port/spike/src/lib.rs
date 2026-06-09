//! fc WASM spike — STAGE 1: the lexer, ported faithfully from index.html's
//! tokenizeLine (~L1369). Tokens are emitted as [type:u8, start:u16, len:u16]
//! little-endian, referencing the source bytes the host already holds (no string
//! copying / no allocator needed). Differential-tested against the JS tokenizer.
#![no_std]
extern crate alloc;
use core::panic::PanicInfo;
use core::ptr::{addr_of, addr_of_mut};
use core::alloc::{GlobalAlloc, Layout};
use core::cell::UnsafeCell;
#[panic_handler] fn panic(_: &PanicInfo) -> ! { loop {} }

// --- Step 0: bump global allocator over a static arena (dependency-free) -----
// The AST + transient parse garbage are heap-bound and wasm32-unknown-unknown has
// no default allocator. A bump allocator is ideal for parse: allocate freely, never
// free, and reset_arena() between programs. (Chosen over the `talc` crate to keep
// the build offline/zero-dependency.)
const ARENA: usize = 4 * 1024 * 1024;
static mut ARENA_MEM: [u8; ARENA] = [0; ARENA];
struct Bump { off: UnsafeCell<usize> }
unsafe impl Sync for Bump {}
#[global_allocator]
static ALLOC: Bump = Bump { off: UnsafeCell::new(0) };
unsafe impl GlobalAlloc for Bump {
    unsafe fn alloc(&self, l: Layout) -> *mut u8 {
        let off = &mut *self.off.get();
        let start = (*off + l.align() - 1) & !(l.align() - 1);
        let end = start + l.size();
        if end > ARENA { return core::ptr::null_mut(); }
        *off = end;
        (addr_of_mut!(ARENA_MEM) as *mut u8).add(start)
    }
    unsafe fn dealloc(&self, _p: *mut u8, _l: Layout) {}
}
#[no_mangle] pub extern "C" fn reset_arena() { unsafe { *ALLOC.off.get() = 0; } }

// alloc self-test: sum of squares 0..99 via a heap Vec  (== 328350)
#[no_mangle] pub extern "C" fn alloc_selftest() -> u32 {
    let mut v: alloc::vec::Vec<u32> = alloc::vec::Vec::new();
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
enum Expr { Lit(LitVal), Ref(String), Math(String, Box<Expr>, Box<Expr>) }
#[derive(Clone)]
enum Cond { Or(Box<Cond>,Box<Cond>), And(Box<Cond>,Box<Cond>), Not(Box<Cond>),
    Eq(Expr,Expr), Neq(Expr,Expr), Cmp(String,Expr,Expr), Has(Expr,Expr), Bare(Expr) }
#[derive(Clone)]
enum Stmt {
    Assign(String, Expr), Add(String, Expr), Remove(String, Expr),
    Simple(&'static str, String), // double/halve/toggle/clear -> {target,type}
    Call(String, Vec<Tok>),
    FuncDef(String, Vec<String>, Vec<Stmt>),
    If(Cond, Vec<Stmt>), ElseIf(Cond, Vec<Stmt>), Else(Vec<Stmt>),
}

fn find_word(ts: &[Tok], w: &str) -> Option<usize> { ts.iter().position(|t| t.is_word(w)) }
fn tokens_to_ref(ts: &[Tok]) -> String { let mut s=String::new(); for t in ts { s.push_str(t.sval()); } s }
fn join_dot(ts: &[Tok]) -> String { let mut parts: Vec<&str>=Vec::new(); for t in ts { parts.push(t.sval()); } parts.join(".") }

fn parse_expr(ts: &[Tok]) -> Expr {
    if ts.is_empty() { return Expr::Lit(LitVal::Num(0.0)); }
    let mut i = ts.len();
    while i > 1 { i -= 1; if ts[i].t==4 { let o=ts[i].sval(); if o=="+"||o=="-" {
        return Expr::Math(o.to_string(), Box::new(parse_expr(&ts[..i])), Box::new(parse_expr(&ts[i+1..]))); } } }
    let mut i = ts.len();
    while i > 1 { i -= 1;
        let op = if ts[i].t==4 && (ts[i].sval()=="*"||ts[i].sval()=="/") { Some(ts[i].sval().to_string()) }
                 else if ts[i].is_word("mod") { Some("%".to_string()) } else { None };
        if let Some(op)=op { return Expr::Math(op, Box::new(parse_expr(&ts[..i])), Box::new(parse_expr(&ts[i+1..]))); } }
    if ts[0].t==4 && ts[0].sval()=="-" {
        return Expr::Math("-".to_string(), Box::new(Expr::Lit(LitVal::Num(0.0))), Box::new(parse_expr(&ts[1..]))); }
    if ts.len()==1 {
        let t=&ts[0];
        return match t.t { 2=>Expr::Lit(LitVal::Num(if let TokVal::Num(n)=t.v {n} else {0.0})),
            1=>Expr::Lit(LitVal::Str(t.sval().to_string())),
            3=> if t.sval()=="yes" {Expr::Lit(LitVal::Bool(true))} else if t.sval()=="no" {Expr::Lit(LitVal::Bool(false))} else {Expr::Ref(t.sval().to_string())},
            _=>Expr::Ref(t.sval().to_string()) };
    }
    // dotted ref a.b.c
    if ts.iter().all(|t| t.t==3 || t.t==5) { return Expr::Ref(tokens_to_ref(ts)); }
    // multi-word fallthrough -> ref joined with spaces
    let mut parts: Vec<&str>=Vec::new(); for t in ts { parts.push(t.sval()); }
    Expr::Ref(parts.join(" "))
}
fn parse_cond(ts: &[Tok]) -> Cond {
    if !ts.is_empty() && ts[0].is_word("not") { return Cond::Not(Box::new(parse_cond(&ts[1..]))); }
    if let Some(k)=find_word(ts,"or") { return Cond::Or(Box::new(parse_cond(&ts[..k])), Box::new(parse_cond(&ts[k+1..]))); }
    if let Some(k)=find_word(ts,"and") { return Cond::And(Box::new(parse_cond(&ts[..k])), Box::new(parse_cond(&ts[k+1..]))); }
    for i in 0..ts.len() { if ts[i].t==4 { let o=ts[i].sval(); if matches!(o, ">"|"<"|">="|"<="|"!="|"==") {
        return Cond::Cmp(o.to_string(), parse_expr(&ts[..i]), parse_expr(&ts[i+1..])); } } }
    if let Some(k)=find_word(ts,"is") {
        if k+1<ts.len() && ts[k+1].is_word("not") { return Cond::Neq(parse_expr(&ts[..k]), parse_expr(&ts[k+2..])); }
        return Cond::Eq(parse_expr(&ts[..k]), parse_expr(&ts[k+1..]));
    }
    if let Some(k)=find_word(ts,"has") { return Cond::Has(parse_expr(&ts[..k]), parse_expr(&ts[k+1..])); }
    Cond::Bare(parse_expr(ts))
}
fn call_fallback(ts: &[Tok]) -> Stmt {
    let name = ts.get(0).map(|t| t.sval().to_string()).unwrap_or_default();
    Stmt::Call(name, ts.get(1..).unwrap_or(&[]).to_vec())
}
fn parse_line(ts: &[Tok]) -> Stmt {
    if ts.is_empty() { return Stmt::Call(String::new(), Vec::new()); }
    let first = ts[0].sval();
    if first=="to" && ts.len()>=2 {
        if ts.len()>=3 && ts[1].is_word("screen") {
            let params: Vec<String> = ts[3..].iter().filter(|t| t.t==3 && t.sval()!="at" && t.sval()!="with").map(|t| t.sval().to_string()).collect();
            return Stmt::FuncDef(format!("screen_{}", ts[2].sval().to_lowercase()), params, Vec::new());
        }
        let params: Vec<String> = ts[2..].iter().filter(|t| t.t==3 && t.sval()!="at" && t.sval()!="with").map(|t| t.sval().to_string()).collect();
        return Stmt::FuncDef(ts[1].sval().to_string(), params, Vec::new());
    }
    if first=="if" { return Stmt::If(parse_cond(&ts[1..]), Vec::new()); }
    if first=="else" {
        if ts.len()>=2 && ts[1].is_word("if") { return Stmt::ElseIf(parse_cond(&ts[2..]), Vec::new()); }
        return Stmt::Else(Vec::new());
    }
    if first=="add" { if let Some(k)=find_word(ts,"to") { return Stmt::Add(tokens_to_ref(&ts[k+1..]), parse_expr(&ts[1..k])); } return call_fallback(ts); }
    if first=="remove" { if let Some(k)=find_word(ts,"from") { return Stmt::Remove(tokens_to_ref(&ts[k+1..]), parse_expr(&ts[1..k])); } return call_fallback(ts); }
    if first=="double" && ts.len()>=2 { return Stmt::Simple("double", join_dot(&ts[1..])); }
    if first=="halve" && ts.len()>=2 { return Stmt::Simple("halve", join_dot(&ts[1..])); }
    if first=="toggle" && ts.len()>=2 { return Stmt::Simple("toggle", join_dot(&ts[1..])); }
    if let Some(k)=find_word(ts,"is") { return Stmt::Assign(tokens_to_ref(&ts[..k]), parse_expr(&ts[k+1..])); }
    call_fallback(ts)
}
fn set_body(s: &mut Stmt, body: Vec<Stmt>) {
    match s { Stmt::FuncDef(_,_,b)|Stmt::If(_,b)|Stmt::ElseIf(_,b)|Stmt::Else(b) => *b=body, _=>{} }
}
struct Line { indent: u32, toks: Vec<Tok> }
fn parse_block(lines: &[Line], start: usize, min_indent: u32) -> Vec<Stmt> {
    let mut out = Vec::new(); let mut i = start;
    while i < lines.len() && lines[i].indent >= min_indent {
        if lines[i].indent > min_indent { i += 1; continue; }
        let mut stmt = parse_line(&lines[i].toks);
        let mut j = i + 1;
        while j < lines.len() && lines[j].indent > min_indent { j += 1; }
        if j > i + 1 { let body = parse_block(lines, i+1, min_indent+1); set_body(&mut stmt, body); }
        out.push(stmt);
        i = if j > i + 1 { j } else { i + 1 };
    }
    out
}
fn parse_program(src: &[u8]) -> Vec<Stmt> {
    let mut lines: Vec<Line> = Vec::new();
    for raw in src.split(|&b| b == b'\n') {
        let (indent, toks) = lex_line(raw);
        if toks.is_empty() { continue; }
        lines.push(Line { indent, toks });
    }
    parse_block(&lines, 0, 0)
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
    }
}
fn emit_cond(c: &Cond, out: &mut String) {
    match c {
        Cond::Or(a,b)=>{ out.push_str("{\"left\":"); emit_cond(a,out); out.push_str(",\"right\":"); emit_cond(b,out); out.push_str(",\"type\":\"or\"}"); }
        Cond::And(a,b)=>{ out.push_str("{\"left\":"); emit_cond(a,out); out.push_str(",\"right\":"); emit_cond(b,out); out.push_str(",\"type\":\"and\"}"); }
        Cond::Not(a)=>{ out.push_str("{\"condition\":"); emit_cond(a,out); out.push_str(",\"type\":\"not\"}"); }
        Cond::Eq(l,r)=>{ out.push_str("{\"left\":"); emit_expr(l,out); out.push_str(",\"right\":"); emit_expr(r,out); out.push_str(",\"type\":\"eq\"}"); }
        Cond::Neq(l,r)=>{ out.push_str("{\"left\":"); emit_expr(l,out); out.push_str(",\"right\":"); emit_expr(r,out); out.push_str(",\"type\":\"neq\"}"); }
        Cond::Cmp(op,l,r)=>{ out.push_str("{\"left\":"); emit_expr(l,out); out.push_str(",\"op\":"); json_str(op,out); out.push_str(",\"right\":"); emit_expr(r,out); out.push_str(",\"type\":\"cmp\"}"); }
        Cond::Has(l,r)=>{ out.push_str("{\"left\":"); emit_expr(l,out); out.push_str(",\"right\":"); emit_expr(r,out); out.push_str(",\"type\":\"has\"}"); }
        Cond::Bare(e)=>emit_expr(e,out),
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
        Stmt::Call(n,args)=>{ out.push_str("{\"args\":["); for (i,a) in args.iter().enumerate() { if i>0 {out.push(',');} emit_tok(a,out); } out.push_str("],\"name\":"); json_str(n,out); out.push_str(",\"type\":\"call\"}"); }
        Stmt::FuncDef(n,params,body)=>{ out.push_str("{\"body\":"); emit_stmts(body,out); out.push_str(",\"name\":"); json_str(n,out); out.push_str(",\"params\":["); for (i,p) in params.iter().enumerate() { if i>0 {out.push(',');} json_str(p,out); } out.push_str("],\"type\":\"funcdef\"}"); }
        Stmt::If(c,body)=>{ out.push_str("{\"body\":"); emit_stmts(body,out); out.push_str(",\"condition\":"); emit_cond(c,out); out.push_str(",\"thenStmt\":null,\"type\":\"if\"}"); }
        Stmt::ElseIf(c,body)=>{ out.push_str("{\"body\":"); emit_stmts(body,out); out.push_str(",\"condition\":"); emit_cond(c,out); out.push_str(",\"thenStmt\":null,\"type\":\"else_if\"}"); }
        Stmt::Else(body)=>{ out.push_str("{\"body\":"); emit_stmts(body,out); out.push_str(",\"type\":\"else\"}"); }
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
