"use strict";
// huntd — a generic per-room WebSocket broadcast relay for fc games.
// Homage to BSD hunt(6)'s daemon, but the OPPOSITE model: it knows nothing
// about any game. It just relays JSON blobs to the other clients in the same
// (game, room). All game logic stays client-side in fc.

const http = require("http");
const { WebSocketServer } = require("ws");

const PORT = parseInt(process.env.HUNTD_PORT || "8090", 10);
const HOST = process.env.HUNTD_HOST || "127.0.0.1";
const ROOM_CAP = parseInt(process.env.HUNTD_ROOM_CAP || "8", 10);
const MSG_CAP = parseInt(process.env.HUNTD_MSG_CAP || "4096", 10);   // bytes per message
const RATE = parseInt(process.env.HUNTD_RATE || "60", 10);          // max msgs/sec per socket
const HEARTBEAT_MS = parseInt(process.env.HUNTD_HEARTBEAT_MS || "15000", 10); // ping interval

const rooms = new Map();   // "game/room" -> Set<ws>
let nextId = 1;

const roomKey = (g, r) => `${g || "_"}/${r || "_"}`;
const clean = s => String(s || "").replace(/[^a-z0-9_-]/gi, "").slice(0, 32);

function broadcast(peers, except, str) {
  for (const s of peers) if (s !== except && s.readyState === 1) s.send(str);
}

// tiny health endpoint so nginx/monitoring can probe it
const server = http.createServer((req, res) => {
  if (req.url === "/healthz") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: true, rooms: rooms.size })); return; }
  res.writeHead(426); res.end("websocket only");
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, "http://x");
  const game = clean(url.searchParams.get("game"));
  const room = clean(url.searchParams.get("room"));
  const k = roomKey(game, room);

  if (!rooms.has(k)) rooms.set(k, new Set());
  const peers = rooms.get(k);
  if (peers.size >= ROOM_CAP) { ws.close(4001, "room full"); return; }

  ws.id = "p" + (nextId++);
  ws._room = k;
  ws._win = { t: Date.now(), n: 0 };
  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });
  peers.add(ws);

  // greet the newcomer with its id + who is already here
  ws.send(JSON.stringify({ t: "welcome", id: ws.id, peers: [...peers].filter(s => s !== ws).map(s => s.id) }));
  // notify the others
  broadcast(peers, ws, JSON.stringify({ t: "join", id: ws.id }));

  ws.on("message", (data) => {
    if (data.length > MSG_CAP) return;
    // simple per-second rate limit
    const now = Date.now();
    if (now - ws._win.t > 1000) { ws._win.t = now; ws._win.n = 0; }
    if (++ws._win.n > RATE) return;

    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    broadcast(peers, ws, JSON.stringify({ t: "state", id: ws.id, data: msg }));
  });

  ws.on("close", () => {
    peers.delete(ws);
    broadcast(peers, ws, JSON.stringify({ t: "leave", id: ws.id }));
    if (peers.size === 0) rooms.delete(k);
  });
});

// Heartbeat: ping every client each interval; if one didn't pong since the last
// tick, its connection is dead (half-open / lost network) — terminate it so it
// frees its room slot and fires a prompt "leave" to the others.
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch { /* ignore */ }
  }
}, HEARTBEAT_MS);
wss.on("close", () => clearInterval(heartbeat));

server.listen(PORT, HOST, () => console.log(`huntd relay on ${HOST}:${PORT}`));
