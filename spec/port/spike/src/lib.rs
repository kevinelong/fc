//! fc WASM spike — proves the command-buffer ABI + the small-binary build path.
//! No interpreter yet; step() emits a fixed clear+rect command list so the host
//! round-trip (load → step → drain buffer → render) and the artifact size can be
//! measured before porting the real lexer/parser/runtime.
#![no_std]
use core::panic::PanicInfo;
use core::ptr::addr_of;

#[panic_handler]
fn panic(_: &PanicInfo) -> ! { loop {} }

// Command record: [op:u8, a:i16, b:i16, c:i16, d:i16, color:u8] little-endian.
const MAX_CMDS: usize = 1024;
const CMD_SIZE: usize = 10;
static mut CMD_BUF: [u8; MAX_CMDS * CMD_SIZE] = [0; MAX_CMDS * CMD_SIZE];
static mut SRC_LEN: u32 = 0;

const OP_CLEAR: u8 = 1;
const OP_RECT: u8 = 2;

/// Host reads commands from here after step().
#[no_mangle]
pub extern "C" fn cmd_buf_ptr() -> *const u8 { addr_of!(CMD_BUF) as *const u8 }

/// Host writes the source bytes into linear memory, then calls load(ptr,len).
#[no_mangle]
pub extern "C" fn load(_ptr: *const u8, len: u32) { unsafe { SRC_LEN = len; } }

#[inline]
fn put(buf: &mut [u8], i: usize, op: u8, a: i16, b: i16, c: i16, d: i16, color: u8) {
    let o = i * CMD_SIZE;
    buf[o] = op;
    buf[o + 1..o + 3].copy_from_slice(&a.to_le_bytes());
    buf[o + 3..o + 5].copy_from_slice(&b.to_le_bytes());
    buf[o + 5..o + 7].copy_from_slice(&c.to_le_bytes());
    buf[o + 7..o + 9].copy_from_slice(&d.to_le_bytes());
    buf[o + 9] = color;
}

/// One frame: returns the number of draw commands written to the command buffer.
#[no_mangle]
pub extern "C" fn step() -> u32 {
    let buf = unsafe { &mut *addr_of_mut_cmdbuf() };
    put(buf, 0, OP_CLEAR, 0, 0, 0, 0, 1);
    put(buf, 1, OP_RECT, 40, 40, 16, 16, 8);
    2
}

#[inline]
fn addr_of_mut_cmdbuf() -> *mut [u8; MAX_CMDS * CMD_SIZE] {
    core::ptr::addr_of_mut!(CMD_BUF)
}
