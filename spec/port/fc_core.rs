//! fc_core.rs — refined Rust port skeleton for the fc fantasy-console language.
//!
//! SINGLE SOURCE OF TRUTH TARGET: this module is meant to become the core that
//! compiles to both WASM (web) and native, replacing the tree-walking JS
//! interpreter in /home/kevin/codeonline/index.html (the ONLY current
//! implementation; classic <script> at L441–4882).
//!
//! This is a COMPILING-SHAPE SKELETON: types and signatures are fleshed out,
//! but most bodies are stubs / `todo!()`. Every place where the JS does
//! something surprising or load-bearing is marked `[QUIRK]` with a ~line cite
//! into index.html so the port can be validated against golden conformance
//! tests rather than against intuition.
//!
//! DESIGN PILLARS encoded here:
//!   1. A `Host` trait — the platform seam the reference monolith LACKS. In JS,
//!      `Runtime` reaches module-level singletons `ctx`/`AUDIO`/`NET` directly
//!      (index.html ~L447/L1162/L1295) and its constructor takes no host. Here
//!      every effect goes through `Host`, so the core stays platform-free
//!      (mirrors the fact that JS `parse()` is already platform-free).
//!   2. A command-buffer `step()` path: the WASM-ready output is a drained
//!      `Vec<DrawCmd>` per frame rather than imperative canvas calls, so the
//!      host (web or native) can replay them however it likes.
//!   3. Faithful reproduction of two divergences a naive draft got wrong:
//!        (a) if/else/else-if threading is correct ONLY at the top of a
//!            statement list; inside loop bodies 'else' runs unconditionally
//!            and 'else if' evaluates its own unlinked condition. See
//!            `exec_toplevel` vs `exec_loop_body`.
//!        (b) loose_eq must replicate JS abstract `==`, not Rust `PartialEq`.

#![allow(dead_code, unused_variables)]

use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;

// ============================================================================
// VALUES
// ============================================================================
//
// JS value domain (MEMORY: "Value = number|string|bool|list|object|undefined").
// Lists/objects are Rc<RefCell<...>> because JS arrays/objects are reference
// types: e.g. `add X to <list>` mutates in place, and equality on them is by
// identity (see loose_eq). [QUIRK] this identity semantics is observable.
#[derive(Clone, Debug)]
pub enum Value {
    Num(f64),
    Str(String),
    Bool(bool),
    List(Rc<RefCell<Vec<Value>>>),
    Obj(Rc<RefCell<HashMap<String, Value>>>),
    Undefined,
}

impl Value {
    pub fn list(items: Vec<Value>) -> Value {
        Value::List(Rc::new(RefCell::new(items)))
    }
    pub fn obj(map: HashMap<String, Value>) -> Value {
        Value::Obj(Rc::new(RefCell::new(map)))
    }

    /// isTruthy (index.html ~L2698).
    /// [QUIRK] the strings "yes"/"no" act as booleans; empty string/list/obj
    /// and 0 and undefined are falsey; ANY non-empty array/obj is truthy.
    pub fn is_truthy(&self) -> bool {
        match self {
            Value::Undefined => false,
            Value::Bool(b) => *b,
            Value::Num(n) => *n != 0.0,
            Value::Str(s) => {
                // [QUIRK] "no" => false, "yes" => true, else non-empty test (~L2700-2703)
                if s == "no" {
                    false
                } else if s == "yes" {
                    true
                } else {
                    !s.is_empty()
                }
            }
            Value::List(l) => !l.borrow().is_empty(),
            Value::Obj(o) => !o.borrow().is_empty(),
        }
    }

    /// parseFloat(x)||0 coercion used by the `math` node (index.html ~L2772-2773).
    /// [QUIRK] JS parseFloat reads a LEADING numeric prefix ("3px" -> 3) and
    /// yields NaN for non-numeric, which `|| 0` then turns into 0. A faithful
    /// port must imitate parseFloat's prefix-parse, NOT Rust's str::parse
    /// (which is all-or-nothing). Booleans here coerce: JS `+true` is 1 but
    /// this path only runs on the string branch, so bools fall through as-is.
    pub fn to_number_forgiving(&self) -> f64 {
        match self {
            Value::Num(n) => *n,
            Value::Bool(b) => {
                if *b {
                    1.0
                } else {
                    0.0
                }
            }
            Value::Str(s) => js_parse_float(s).unwrap_or(0.0),
            // undefined/list/obj -> NaN -> ||0 in JS math; here -> 0.0
            _ => 0.0,
        }
    }

    /// String() coercion for display (index.html: Number::toString etc.).
    /// [QUIRK] uses JS Number formatting, so 0.1+0.2 prints "0.30000000000000004".
    /// drawText additionally upper-cases (bitmap font is UPPERCASE-only).
    pub fn to_display_string(&self) -> String {
        todo!("mirror JS String() incl. float repr; see drawText toUpperCase note")
    }
}

/// [QUIRK] JS parseFloat: parse the longest valid leading float prefix.
/// Returns None if no leading number (JS NaN). Stub for the conformance port.
fn js_parse_float(_s: &str) -> Option<f64> {
    todo!("implement JS parseFloat leading-prefix semantics, NOT str::parse")
}

/// loose_eq — FAITHFUL PORT REQUIREMENT.
/// The JS interpreter compares with raw `==` / `!=` (index.html ~L2851-2852),
/// i.e. the ECMAScript Abstract Equality Comparison. A naive prior draft used
/// Rust structural/`PartialEq`, which diverges on every coercion case below.
/// This MUST be table-driven and golden-tested.
///
/// [QUIRK] Cases that the port must reproduce exactly (from `==`):
///   - Num == Num: numeric equality, but NaN == NaN is FALSE.
///   - Str == Str: byte/utf16 equality.
///   - Num <-> Str: string is ToNumber'd (full-string, NOT parseFloat-prefix:
///       Number("") === 0, Number("  5 ") === 5, Number("5px") === NaN).
///       So '5' == 5 is TRUE; '5px' == 5 is FALSE; '' == 0 is TRUE; ' ' == 0 TRUE.
///   - Bool <-> anything: bool is ToNumber'd FIRST (true->1, false->0) then
///       compared again. So true == 1 TRUE; true == '1' TRUE; true == 'true' FALSE;
///       false == '' TRUE; false == 0 TRUE; false == [] TRUE (via object path).
///   - null == undefined is TRUE; null/undefined == anything else is FALSE.
///       (We model JS null as Value::Undefined here; fc has no distinct null.)
///   - Object/Array (List/Obj) == primitive: ToPrimitive(object) then retry.
///       [] == 0 TRUE; [] == '' TRUE; [5] == 5 TRUE; ['5'] == 5 TRUE;
///       {} == '[object Object]' TRUE.
///   - List == List / Obj == Obj: by REFERENCE IDENTITY (Rc::ptr_eq), never
///       structural. Two distinct empty lists are NOT equal.
///   - 0 == '' TRUE, null == undefined TRUE, NaN != NaN — all explicitly in MEMORY.
pub fn loose_eq(a: &Value, b: &Value) -> bool {
    use Value::*;
    match (a, b) {
        (Num(x), Num(y)) => x == y, // NaN==NaN already false in Rust f64; matches JS
        (Str(x), Str(y)) => x == y,
        (Bool(x), Bool(y)) => x == y,
        (Undefined, Undefined) => true,
        // identity for reference types
        (List(x), List(y)) => Rc::ptr_eq(x, y),
        (Obj(x), Obj(y)) => Rc::ptr_eq(x, y),
        // mixed cases: ToNumber / ToPrimitive coercion ladder
        _ => todo!("implement the full ToNumber/ToPrimitive coercion ladder per [QUIRK] above"),
    }
}

#[inline]
pub fn loose_neq(a: &Value, b: &Value) -> bool {
    !loose_eq(a, b)
}

// ============================================================================
// AST — Expr / Condition / Stmt
// ============================================================================
//
// Node names mirror the JS parser's `type` tags so corpus golden ASTs line up.

#[derive(Clone, Debug)]
pub enum Expr {
    /// `literal` (~L2743) and `listliteral` (~L2753)
    Literal(LiteralValue),
    ListLiteral(Vec<Expr>),
    /// `object_expr` (~L2754): ordered prop list (JS uses insertion order)
    ObjectExpr(Vec<(String, Expr)>),
    /// `ref` (~L2761): variable or dotted access ("player.x", "coins.count")
    /// [QUIRK] virtual `.count`/`.length` on arrays (~L2715); a bare ref that is
    /// undefined but names a COLOR resolves to the color name string (~L2765).
    Ref(String),
    /// `math` (~L2768): binary +/-/*//%
    /// [QUIRK] '+' is NUMERIC here ('3'+'4'==7, 'hi'+'x'==0); /0 and %0 -> 0.
    Math {
        op: MathOp,
        left: Box<Expr>,
        right: Box<Expr>,
    },
    /// `item N of list` (~L2826), 1-BASED indexing. [QUIRK]
    ItemOf {
        index: Box<Expr>,
        list: Box<Expr>,
    },
    /// `random N` (~L2783): floor(rng*(N+1)) => INCLUSIVE 0..N, unseeded. [QUIRK]
    Random(Box<Expr>),
    // ... other builtin expression forms (count of, etc.) elided in skeleton.
}

#[derive(Clone, Debug)]
pub enum LiteralValue {
    Num(f64),
    Str(String),
    Bool(bool),
}

#[derive(Clone, Copy, Debug)]
pub enum MathOp {
    Add,
    Sub,
    Mul,
    Div,
    Mod,
}

#[derive(Clone, Debug)]
pub enum Condition {
    /// `key_pressed` (~L2850)
    KeyPressed(String),
    /// `eq` (~L2851) — uses loose_eq
    Eq(Box<Expr>, Box<Expr>),
    /// `neq` (~L2852) — uses loose_neq
    Neq(Box<Expr>, Box<Expr>),
    /// `cmp` (~L2853): > < >= <= != on raw JS values
    /// [QUIRK] '!=' also appears here (duplicate of neq); comparisons use raw
    /// JS relational ops (string vs number coercion, lexicographic string<string).
    Cmp {
        op: CmpOp,
        left: Box<Expr>,
        right: Box<Expr>,
    },
    And(Box<Condition>, Box<Condition>),
    Or(Box<Condition>, Box<Condition>),
    // collision / tag conditions, etc. elided.
}

#[derive(Clone, Copy, Debug)]
pub enum CmpOp {
    Gt,
    Lt,
    Ge,
    Le,
    Ne,
}

/// Statement AST. Tags follow JS `stmt.type`. `then_stmt` is the optional
/// inline single statement (e.g. `if X is 1 add 1 to score`), `body` is the
/// indented block. The parser's inline/if heuristic (~L2017-2069) is the
/// HIGHEST divergence risk and lives in the parser, not here.
#[derive(Clone, Debug)]
pub enum Stmt {
    // Mirrors the JS parser's `type: 'assign'` node — the only assignment form
    // is `REF is EXPR`. There is NO `set` statement in fc (a leading `set` parses
    // as a fallback call and is a silent no-op; see corpus/set_make_noop.fc).
    Assign {
        target: String,
        value: Expr,
    },
    /// `add X to name` (~L2932) — [QUIRK] string target CONCATENATES, list target
    /// PUSHES, number target adds numerically. Polymorphic by runtime type.
    Add {
        amount: Expr,
        target: String,
    },
    Toggle {
        target: String,
    }, // ~L2961, polymorphic bool/num/yes-no
    Double {
        target: String,
    }, // ~L2971, num only
    Halve {
        target: String,
    }, // ~L2977, num only

    /// if / else_if / else — see exec paths. `then_stmt` + `body` both optional.
    If {
        condition: Condition,
        then_stmt: Option<Box<Stmt>>,
        body: Vec<Stmt>,
    },
    ElseIf {
        condition: Condition,
        then_stmt: Option<Box<Stmt>>,
        body: Vec<Stmt>,
    },
    Else {
        then_stmt: Option<Box<Stmt>>,
        body: Vec<Stmt>,
    },

    RepeatTimes {
        count: Expr,
        body: Vec<Stmt>,
    },
    /// repeat range (~L3018): INCLUSIVE, BIDIRECTIONAL (descends if from>to). [QUIRK]
    RepeatRange {
        var_name: String,
        from: Expr,
        to: Expr,
        body: Vec<Stmt>,
    },
    Each {
        var_name: String,
        list: Expr,
        body: Vec<Stmt>,
    },
    While {
        condition: Condition,
        body: Vec<Stmt>,
    },
    /// `until` style (~L3040): loops while condition is NOT truthy.
    Until {
        condition: Condition,
        body: Vec<Stmt>,
    },
    /// forever (~L3047). [QUIRK] OUTSIDE a game loop this is capped at 1000 iters.
    Forever {
        body: Vec<Stmt>,
    },

    /// `chain` (~L1509): statements joined by 'and' at command boundaries.
    Chain(Vec<Stmt>),

    /// Draw family — emit DrawCmd rather than touching a canvas. (~L3476)
    Draw(DrawStmt),
    Say {
        value: Expr,
    }, // ~L3404 -> say_buffer
    Play {
        sound: String,
    },

    /// Function definition. [QUIRK NO-HOIST] funcs are registered at EXEC time
    /// (~L3087), not parse time, so a call to a not-yet-executed def silently
    /// no-ops. Params ARE parsed (~L1521) but IGNORED at runtime — no locals,
    /// every func shares global vars.
    FuncDef {
        name: String,
        params: Vec<String>, // captured but UNUSED at runtime [QUIRK]
        body: Vec<Stmt>,
    },
    /// `to screen X` (~L1516) defines func "screen_"+X.
    ScreenDef {
        name: String,
        body: Vec<Stmt>,
    },

    Return {
        value: Option<Expr>,
    }, // ~L3420
    /// FALLBACK call node (~L1872): unrecognized line -> {call, name, raw args}.
    /// [QUIRK] missing func => SILENT no-op in JS (execCall ~L3607). In this
    /// port a forward/unknown call routes to Host::error instead (see exec_call).
    Call {
        name: String,
        args: Vec<String>,
    },
    // tag declarations (solid/pickups/...), go/go back, every-N-seconds, etc. elided.
}

#[derive(Clone, Debug)]
pub struct DrawStmt {
    pub shape: DrawShape,
    pub hud: bool, // HUD draws ignore camera offset (~L3479)
    pub args: HashMap<String, Expr>,
}

#[derive(Clone, Debug)]
pub enum DrawShape {
    Circle,
    Rect,
    Line,
    Sprite,
    Text,
}

// ============================================================================
// HOST SEAM (the part the reference monolith LACKS)
// ============================================================================
//
// In JS the Runtime mutates `ctx`, `AUDIO`, `NET` directly and is not
// parameterized by a host. Here EVERY effect is funneled through `Host`, so the
// core is pure-logic + this trait. The web build implements Host over a canvas /
// WebAudio / WebSocket; a native build over its own backends; conformance tests
// over a recording mock.
pub trait Host {
    // --- raster / draw (mirror execDraw cases ~L3488) ---
    fn clear(&mut self, color: &str);
    fn fill_rect(&mut self, x: f64, y: f64, w: f64, h: f64, color: &str);
    fn fill_circle(&mut self, x: f64, y: f64, r: f64, color: &str);
    fn draw_line(&mut self, x1: f64, y1: f64, x2: f64, y2: f64, color: &str);
    fn pset(&mut self, x: f64, y: f64, color: &str);
    /// [QUIRK] text is rendered UPPERCASE-only by the bitmap font (drawText toUpperCase).
    fn draw_text(&mut self, text: &str, x: f64, y: f64, color: &str);
    fn draw_sprite(&mut self, name: &str, x: f64, y: f64);

    // --- input ---
    fn key_down(&self, key: &str) -> bool;
    fn mouse(&self) -> (f64, f64, bool); // x, y, pressed

    // --- audio ---
    fn play_sound(&mut self, name: &str);
    fn play_music(&mut self, name: &str);

    // --- definitions / registration ---
    fn define_sprite(&mut self, name: &str, rows: &[String]);
    fn define_sound(&mut self, name: &str, spec: &str);
    fn register_sprite(&mut self, name: &str, x: f64, y: f64);

    // --- diagnostics ---
    /// The seam that finally WIRES UP errors. [QUIRK] the JS `error(msg,lineNum)`
    /// facility exists (~L2693) + an #errors div, but is invoked only ONCE,
    /// UNLOCATED, in the top-level catch ("I got confused: ..."). Silent no-ops
    /// (missing funcs, etc.) are reported here in the port instead of swallowed.
    fn error(&mut self, msg: &str, line: Option<u32>);
}

// ============================================================================
// COMMAND BUFFER (WASM-ready output path)
// ============================================================================
//
// Rather than calling Host immediately, `step()` can collect a frame's worth of
// draw operations into a Vec<DrawCmd> and drain it once. This is the clean WASM
// boundary: JS just iterates the buffer. (Either pattern works; the buffer is
// the recommended one for the cross-platform single-source-of-truth build.)
#[derive(Clone, Debug)]
pub enum DrawCmd {
    Clear { color: String },
    Rect { x: f64, y: f64, w: f64, h: f64, color: String },
    Circle { x: f64, y: f64, r: f64, color: String },
    Line { x1: f64, y1: f64, x2: f64, y2: f64, color: String },
    Pset { x: f64, y: f64, color: String },
    Text { text: String, x: f64, y: f64, color: String },
    Sprite { name: String, x: f64, y: f64 },
    Sound { name: String },
    Music { name: String },
}

// ============================================================================
// RUNTIME
// ============================================================================

/// Op budget. [QUIRK] confirmed real: `maxOps || 100000` (index.html ~L2899).
pub const OP_BUDGET: u64 = 100_000;
/// [QUIRK] `forever` OUTSIDE a game loop is capped at 1000 iterations (~L3047/L3049).
pub const FOREVER_CAP: u64 = 1000;

/// Distinguishes the two if/else execution disciplines. See exec methods.
#[derive(Clone, Copy, PartialEq, Eq)]
enum ExecScope {
    /// Top-of-statement-list: smartExecList threads if/else/else-if correctly.
    TopLevel,
    /// Inside a loop body: plain execList — else runs unconditionally,
    /// else-if evaluates its own condition unlinked. [QUIRK / fidelity trap]
    LoopBody,
}

pub struct Runtime<H: Host> {
    pub host: H,
    /// All variables — GLOBAL. [QUIRK] funcs have no locals; params ignored.
    pub vars: HashMap<String, Value>,
    /// Functions registered at EXEC time (no hoisting). [QUIRK]
    funcs: HashMap<String, Vec<Stmt>>,
    /// say buffer — rendered to canvas only when NOT in a game loop (~L3404/L4030).
    pub say_buffer: Vec<String>,
    /// frame draw command buffer (drained by step()).
    cmd_buffer: Vec<DrawCmd>,
    /// op counter vs OP_BUDGET.
    ops: u64,
    /// cooperative stop flag (mirrors this.stopped).
    stopped: bool,
    /// return-in-flight flag (mirrors this._returning ~L3421).
    returning: bool,
    return_value: Value,
    /// true while a game loop is active (affects forever cap & say rendering).
    in_game_loop: bool,
    /// camera offset for world-space draws (~L3479).
    camera: (f64, f64),
}

impl<H: Host> Runtime<H> {
    pub fn new(host: H) -> Self {
        Runtime {
            host,
            vars: HashMap::new(),
            funcs: HashMap::new(),
            say_buffer: Vec::new(),
            cmd_buffer: Vec::new(),
            ops: 0,
            stopped: false,
            returning: false,
            return_value: Value::Undefined,
            in_game_loop: false,
            camera: (0.0, 0.0),
        }
    }

    // ------------------------------------------------------------------
    // Public entry points
    // ------------------------------------------------------------------

    /// Run a full program once (the non-game/setup path).
    pub fn run(&mut self, program: &[Stmt]) {
        self.ops = 0;
        self.stopped = false;
        self.exec_toplevel(program);
    }

    /// One frame of the game loop. Returns the drained command buffer for the
    /// host to replay. [QUIRK] JS frame order: peers/connected are WRITTEN from
    /// NET first (~L3637); gravity/edge-clamp/screen-dispatch READ user vars.
    pub fn step(&mut self) -> Vec<DrawCmd> {
        self.ops = 0;
        self.cmd_buffer.clear();
        // TODO: net sync, gravity dy accumulation (~L3697), edge clamp to
        //       world.width-8 (~L3708), screen_<mode> auto-dispatch (~L3738),
        //       collision handlers (~L3866) — all driving exec_* below.
        std::mem::take(&mut self.cmd_buffer)
    }

    // ------------------------------------------------------------------
    // if/else — THE BIG ONE (MEMORY). Two distinct disciplines.
    // ------------------------------------------------------------------

    /// TOP-LEVEL statement list = smartExecList (index.html ~L3435-3469).
    /// Threads if/else/else-if with a `last_if_result` latch: else/else-if run
    /// ONLY when the preceding if (or else-if) was false.
    fn exec_toplevel(&mut self, list: &[Stmt]) {
        // [QUIRK] None = "no active if chain"; Some(true/false) = last if outcome.
        let mut last_if_result: Option<bool> = None;
        for stmt in list {
            if self.stopped || self.returning || self.ops > OP_BUDGET {
                return;
            }
            self.ops += 1;
            match stmt {
                Stmt::If { condition, then_stmt, body } => {
                    let r = self.eval_condition(condition).is_truthy();
                    last_if_result = Some(r);
                    if r {
                        self.exec_then_and_body(then_stmt.as_deref(), body);
                    }
                }
                Stmt::ElseIf { condition, then_stmt, body } => {
                    if last_if_result == Some(false) {
                        let r = self.eval_condition(condition).is_truthy();
                        last_if_result = Some(r);
                        if r {
                            self.exec_then_and_body(then_stmt.as_deref(), body);
                        }
                    }
                    // else: previous if was true (or no chain) -> skip
                }
                Stmt::Else { then_stmt, body } => {
                    if last_if_result == Some(false) {
                        self.exec_then_and_body(then_stmt.as_deref(), body);
                    }
                    last_if_result = None;
                }
                other => {
                    last_if_result = None;
                    self.exec_one(other);
                }
            }
        }
    }

    /// LOOP-BODY statement list = plain execList (index.html ~L2983-3007).
    ///
    /// FIDELITY REASON: the JS loop bodies call the un-decorated `execList`,
    /// whose per-statement `case 'else'` (~L3003) and `case 'else_if'` (~L2994)
    /// run WITHOUT any latch linking them to the preceding `if`. So:
    ///   - `else`  runs its body UNCONDITIONALLY every iteration. [QUIRK]
    ///   - `else if` re-evaluates its OWN condition, unlinked from the prior if. [QUIRK]
    ///   - `if` itself still only runs when true, but has no "else side".
    /// This means identical if/else SOURCE behaves DIFFERENTLY depending on
    /// whether it sits at the top level or inside a loop body. Latent JS bug —
    /// but a behavior the conformance tests must reproduce, so we encode it
    /// rather than "fixing" it.
    fn exec_loop_body(&mut self, list: &[Stmt]) {
        for stmt in list {
            if self.stopped || self.returning || self.ops > OP_BUDGET {
                return;
            }
            self.ops += 1;
            match stmt {
                Stmt::If { condition, then_stmt, body } => {
                    if self.eval_condition(condition).is_truthy() {
                        self.exec_then_and_body(then_stmt.as_deref(), body);
                    }
                }
                Stmt::ElseIf { condition, then_stmt, body } => {
                    // [QUIRK] evaluates own condition; NOT gated on a prior if.
                    if self.eval_condition(condition).is_truthy() {
                        self.exec_then_and_body(then_stmt.as_deref(), body);
                    }
                }
                Stmt::Else { then_stmt, body } => {
                    // [QUIRK] unconditional.
                    self.exec_then_and_body(then_stmt.as_deref(), body);
                }
                other => self.exec_one(other),
            }
        }
    }

    fn exec_then_and_body(&mut self, then_stmt: Option<&Stmt>, body: &[Stmt]) {
        if let Some(t) = then_stmt {
            self.exec_one(t);
        }
        if !body.is_empty() {
            // Bodies of an if are themselves a loop-body-style list in JS
            // (they go through execList, not smartExecList). [QUIRK]
            self.exec_loop_body(body);
        }
    }

    // ------------------------------------------------------------------
    // Single statement dispatch (mirrors execOne)
    // ------------------------------------------------------------------
    fn exec_one(&mut self, stmt: &Stmt) {
        match stmt {
            Stmt::Assign { target, value } => {
                let v = self.eval_expr(value);
                self.set_var(target, v);
            }
            Stmt::Add { amount, target } => self.exec_add(amount, target),
            Stmt::Toggle { .. } | Stmt::Double { .. } | Stmt::Halve { .. } => {
                todo!("polymorphic numeric/bool mutators ~L2961-2981")
            }

            // if/else/else-if appearing via exec_one (e.g. as a chain member or
            // an if's then-stmt) follow LOOP-BODY discipline — they reach JS's
            // plain execOne, not smartExecList. [QUIRK]
            Stmt::If { condition, then_stmt, body } => {
                if self.eval_condition(condition).is_truthy() {
                    self.exec_then_and_body(then_stmt.as_deref(), body);
                }
            }
            Stmt::ElseIf { condition, then_stmt, body } => {
                if self.eval_condition(condition).is_truthy() {
                    self.exec_then_and_body(then_stmt.as_deref(), body);
                }
            }
            Stmt::Else { then_stmt, body } => {
                self.exec_then_and_body(then_stmt.as_deref(), body);
            }

            Stmt::RepeatTimes { count, body } => {
                let n = self.eval_expr(count).to_number_forgiving();
                let mut i = 0.0;
                while i < n && !self.stopped && self.ops < OP_BUDGET {
                    self.ops += 1;
                    self.exec_loop_body(body); // [QUIRK] loop discipline
                    i += 1.0;
                }
            }
            Stmt::RepeatRange { var_name, from, to, body } => {
                // [QUIRK] inclusive + bidirectional descent (~L3018-3028)
                let from = self.eval_expr(from).to_number_forgiving();
                let to = self.eval_expr(to).to_number_forgiving();
                let step = if from <= to { 1.0 } else { -1.0 };
                let mut i = from;
                while (if step > 0.0 { i <= to } else { i >= to })
                    && !self.stopped
                    && self.ops <= OP_BUDGET
                {
                    self.ops += 1;
                    self.set_var(var_name, Value::Num(i));
                    self.exec_loop_body(body);
                    i += step;
                }
            }
            Stmt::Each { .. } => todo!("each-in over list, loop discipline"),
            Stmt::While { condition, body } => {
                while self.eval_condition(condition).is_truthy()
                    && !self.stopped
                    && self.ops < OP_BUDGET
                {
                    self.ops += 1;
                    self.exec_loop_body(body);
                }
            }
            Stmt::Until { condition, body } => {
                // [QUIRK] loops WHILE condition is falsey (~L3040)
                while !self.eval_condition(condition).is_truthy()
                    && !self.stopped
                    && self.ops < OP_BUDGET
                {
                    self.ops += 1;
                    self.exec_loop_body(body);
                }
            }
            Stmt::Forever { body } => {
                // [QUIRK] outside a game loop, capped at FOREVER_CAP (1000).
                let cap = if self.in_game_loop { u64::MAX } else { FOREVER_CAP };
                let mut i = 0u64;
                while i < cap && !self.stopped && self.ops < OP_BUDGET {
                    self.ops += 1;
                    self.exec_loop_body(body);
                    i += 1;
                }
            }

            Stmt::Chain(stmts) => {
                for s in stmts {
                    if self.stopped || self.returning {
                        break;
                    }
                    self.exec_one(s);
                }
            }

            Stmt::Draw(d) => self.exec_draw(d),
            Stmt::Say { value } => {
                let v = self.eval_expr(value);
                // [QUIRK] buffered; only flushed to canvas when NOT in game loop.
                self.say_buffer.push(v.to_display_string());
            }
            Stmt::Play { sound } => self.cmd_buffer.push(DrawCmd::Sound { name: sound.clone() }),

            Stmt::FuncDef { name, body, .. } => {
                // [QUIRK NO-HOIST] registered HERE, at exec time (~L3087).
                self.funcs.insert(name.clone(), body.clone());
            }
            Stmt::ScreenDef { name, body } => {
                // 'to screen X' -> func "screen_"+X (~L1516)
                self.funcs.insert(format!("screen_{}", name), body.clone());
            }

            Stmt::Return { value } => {
                self.return_value = match value {
                    Some(e) => self.eval_expr(e),
                    None => Value::Undefined,
                };
                self.returning = true;
            }

            Stmt::Call { name, args } => self.exec_call(name, args),
        }
    }

    fn exec_call(&mut self, name: &str, _args: &[String]) {
        // [QUIRK] In JS, a missing/forward-declared func is a SILENT no-op
        // (execCall ~L3607). Because of no-hoisting (~L3087), a call to a
        // later-defined func also no-ops. We surface it via Host::error to wire
        // up the built-but-unused diagnostics facility — note this is a
        // DELIBERATE behavior change for usability, gated so conformance tests
        // can assert the silent path if needed.
        if let Some(body) = self.funcs.get(name).cloned() {
            // [QUIRK] args IGNORED; no params, no locals — body runs against
            // the shared global vars. Funcs run with loop-body discipline? No:
            // a called func body goes through exec/smartExecList at the top of
            // its own list, so use exec_toplevel here.
            let prior_returning = self.returning;
            self.returning = false;
            self.exec_toplevel(&body);
            self.returning = prior_returning;
        } else {
            self.host
                .error(&format!("I don't know how to '{}'", name), None);
        }
    }

    fn exec_add(&mut self, amount: &Expr, target: &str) {
        // [QUIRK] polymorphic by target runtime type (~L2932):
        //   string target -> concatenate; list target -> push; number -> add.
        let _ = (amount, target);
        todo!("polymorphic add: concat for Str, push for List, numeric otherwise")
    }

    fn exec_draw(&mut self, d: &DrawStmt) {
        // [QUIRK] world draws subtract camera; HUD draws don't (~L3479).
        // Pushes DrawCmd into cmd_buffer (drained by step()), rather than
        // touching a canvas — the WASM-ready path.
        let _ = d;
        todo!("eval args, apply camera unless hud, push DrawCmd")
    }

    // ------------------------------------------------------------------
    // Expression / condition evaluation
    // ------------------------------------------------------------------
    fn eval_expr(&mut self, node: &Expr) -> Value {
        match node {
            Expr::Literal(LiteralValue::Num(n)) => Value::Num(*n),
            Expr::Literal(LiteralValue::Str(s)) => Value::Str(s.clone()),
            Expr::Literal(LiteralValue::Bool(b)) => Value::Bool(*b),
            Expr::ListLiteral(items) => {
                let vs = items.iter().map(|e| self.eval_expr(e)).collect();
                Value::list(vs)
            }
            Expr::ObjectExpr(props) => {
                let mut m = HashMap::new();
                for (k, e) in props {
                    let v = self.eval_expr(e);
                    m.insert(k.clone(), v);
                }
                Value::obj(m)
            }
            Expr::Ref(name) => self.get_var(name),
            Expr::Math { op, left, right } => {
                // [QUIRK] numeric '+' (NOT concat); /0 and %0 -> 0 (~L2768-2781)
                let l = self.eval_expr(left).to_number_forgiving();
                let r = self.eval_expr(right).to_number_forgiving();
                let out = match op {
                    MathOp::Add => l + r,
                    MathOp::Sub => l - r,
                    MathOp::Mul => l * r,
                    MathOp::Div => if r != 0.0 { l / r } else { 0.0 },
                    MathOp::Mod => if r != 0.0 { l % r } else { 0.0 },
                };
                Value::Num(out)
            }
            Expr::ItemOf { index, list } => {
                // [QUIRK] 1-BASED (~L2826)
                let _ = (index, list);
                todo!("item N of list -> list[idx-1], 1-based")
            }
            Expr::Random(n) => {
                // [QUIRK] floor(rng*(N+1)) inclusive 0..N, unseeded (~L2783).
                // Port should use a host-seedable RNG for reproducible golden tests.
                let _ = n;
                todo!("inclusive random 0..=N")
            }
        }
    }

    fn eval_condition(&mut self, node: &Condition) -> Value {
        match node {
            Condition::KeyPressed(k) => Value::Bool(self.host.key_down(k)),
            Condition::Eq(l, r) => {
                let lv = self.eval_expr(l);
                let rv = self.eval_expr(r);
                Value::Bool(loose_eq(&lv, &rv)) // [QUIRK] JS abstract ==
            }
            Condition::Neq(l, r) => {
                let lv = self.eval_expr(l);
                let rv = self.eval_expr(r);
                Value::Bool(loose_neq(&lv, &rv))
            }
            Condition::Cmp { op, left, right } => {
                let _ = (op, left, right);
                // [QUIRK] raw JS relational comparison incl. string<string and
                // numeric coercion; must match `<`/`>`/`<=`/`>=`/`!=` semantics.
                todo!("relational comparison faithful to JS < > <= >= !=")
            }
            Condition::And(a, b) => {
                Value::Bool(self.eval_condition(a).is_truthy() && self.eval_condition(b).is_truthy())
            }
            Condition::Or(a, b) => {
                Value::Bool(self.eval_condition(a).is_truthy() || self.eval_condition(b).is_truthy())
            }
        }
    }

    // ------------------------------------------------------------------
    // Variable access — dotted paths + virtual .count/.length
    // ------------------------------------------------------------------
    fn get_var(&self, name: &str) -> Value {
        // [QUIRK] dotted access (~L2710); virtual .count/.length on arrays
        // (~L2715); a missing ref that names a COLOR resolves to the color
        // string (~L2765). Otherwise Undefined.
        let _ = name;
        todo!("dotted get with virtual count/length and color-name fallback")
    }

    fn set_var(&mut self, name: &str, value: Value) {
        // [QUIRK] dotted set auto-vivifies intermediate objects (~L2725-2737).
        let _ = (name, value);
        todo!("dotted set with auto-vivification")
    }
}

// ============================================================================
// COLORS
// ============================================================================
// [QUIRK] 27 named entries incl gray/grey aliases (first 16 = PICO-8 set);
// default '#fff1e8' (index.html ~L473-492). resolveColor maps a name->hex,
// passing through unknown values. Table omitted from skeleton.
pub fn resolve_color(_name: &str) -> &'static str {
    "#fff1e8"
}

#[cfg(test)]
mod tests {
    use super::*;

    // Golden conformance tests will live alongside spec/corpus. Placeholder so
    // the module is wired for `cargo test` once bodies are filled in.
    #[test]
    fn op_budget_constants() {
        assert_eq!(OP_BUDGET, 100_000);
        assert_eq!(FOREVER_CAP, 1000);
    }
}
