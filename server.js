const { WebSocketServer } = require("ws");
const http = require("http");

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Chat server is running ✅");
});

const wss = new WebSocketServer({ server, maxPayload: 20 * 1024 * 1024 });

let clients = new Map();
let history = [];
let reactions = {};

wss.on("connection", (ws) => {
  let username = null;

  ws.on("message", (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    // JOIN
    if (msg.type === "join") {
      username = msg.name.slice(0, 20).trim() || "Аноним";
      clients.set(ws, username);
      ws.send(JSON.stringify({ type: "history", messages: history }));
      // восстановить реакции
      Object.entries(reactions).forEach(([msgId, emojis]) => {
        Object.entries(emojis).forEach(([emoji, names]) => {
          names.forEach(name => ws.send(JSON.stringify({ type: "reaction", msgId, emoji, name })));
        });
      });
      broadcast({ type: "system", text: `${username} вошёл в чат`, time: now() }, ws);
      broadcastUsers();
      return;
    }

    // MESSAGE
    if (msg.type === "message" && username) {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const entry = {
        type: "message", id,
        name: username,
        text: String(msg.text || "").slice(0, 1000),
        time: now()
      };
      if (msg.image && typeof msg.image === "string" && msg.image.startsWith("data:image/")) entry.image = msg.image;
      if (msg.voice && typeof msg.voice === "string" && msg.voice.startsWith("data:audio/")) entry.voice = msg.voice;
      if (msg.replyTo && msg.replyTo.id) entry.replyTo = { id: msg.replyTo.id, name: String(msg.replyTo.name||'').slice(0,20), text: String(msg.replyTo.text||'').slice(0,100) };
      history.push(entry);
      if (history.length > 100) history.shift();
      broadcast(entry);
      return;
    }

    // TYPING
    if (msg.type === "typing" && username) {
      broadcast({ type: "typing", name: username, isTyping: !!msg.isTyping }, ws);
      return;
    }

    // REACTION
    if (msg.type === "reaction" && username) {
      const { msgId, emoji } = msg;
      if (!reactions[msgId]) reactions[msgId] = {};
      if (!reactions[msgId][emoji]) reactions[msgId][emoji] = [];
      const arr = reactions[msgId][emoji];
      const idx = arr.indexOf(username);
      const remove = idx !== -1;
      if (remove) arr.splice(idx, 1); else arr.push(username);
      broadcast({ type: "reaction", msgId, emoji, name: username, remove });
      return;
    }

    // EDIT
    if (msg.type === "edit" && username) {
      const { msgId, text } = msg;
      const entry = history.find(m => m.id === msgId);
      if (!entry || entry.name !== username || entry.deleted) return;
      entry.text = String(text || "").slice(0, 1000);
      entry.edited = true;
      broadcast({ type: "edit", msgId, text: entry.text });
      return;
    }

    // DELETE
    if (msg.type === "delete" && username) {
      const { msgId } = msg;
      const entry = history.find(m => m.id === msgId);
      if (!entry || entry.name !== username) return;
      entry.deleted = true;
      delete entry.image; delete entry.voice; delete entry.text;
      broadcast({ type: "delete", msgId });
      return;
    }
  });

  ws.on("close", () => {
    if (username) {
      clients.delete(ws);
      broadcast({ type: "typing", name: username, isTyping: false });
      broadcast({ type: "system", text: `${username} покинул чат`, time: now() });
      broadcastUsers();
    }
  });
});

function broadcast(msg, exclude = null) {
  const data = JSON.stringify(msg);
  for (const [client] of clients) {
    if (client !== exclude && client.readyState === 1) client.send(data);
  }
  if (exclude && ["message","reaction","edit","delete"].includes(msg.type)) exclude.send(data);
}

function broadcastUsers() {
  const users = [...clients.values()];
  const data = JSON.stringify({ type: "users", users });
  for (const [client] of clients) { if (client.readyState === 1) client.send(data); }
}

function now() {
  return new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅ Сервер запущен на порту ${PORT}`));
