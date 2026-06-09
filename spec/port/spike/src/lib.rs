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
