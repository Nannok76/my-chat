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

    if (msg.type === "join") {
      username = msg.name.slice(0, 20).trim() || "Аноним";
      clients.set(ws, username);

      ws.send(JSON.stringify({ type: "history", messages: history }));

      // Отправляем существующие реакции
      Object.entries(reactions).forEach(([msgId, emojis]) => {
        Object.entries(emojis).forEach(([emoji, names]) => {
          names.forEach(name => {
            ws.send(JSON.stringify({ type: "reaction", msgId, emoji, name }));
          });
        });
      });

      broadcast({ type: "system", text: `${username} вошёл в чат` }, ws);
      broadcastUsers();
      return;
    }

    if (msg.type === "message" && username) {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const entry = {
        type: "message",
        id,
        name: username,
        text: String(msg.text || "").slice(0, 1000),
        time: now()
      };

      if (msg.image) entry.image = msg.image;
      if (msg.voice) entry.voice = msg.voice;
      if (msg.replyTo) {
        const original = history.find(m => m.id === msg.replyTo);
        if (original) entry.replyTo = { name: original.name, text: original.text || '' };
      }

      history.push(entry);
      if (history.length > 50) history.shift();
      broadcast(entry);
      return;
    }

    if (msg.type === "edit" && username) {
      const original = history.find(m => m.id === msg.msgId);
      if (original && original.name === username) {
        original.text = String(msg.text || "").slice(0, 1000);
        broadcast({ type: "edit", msgId: msg.msgId, text: original.text });
      }
      return;
    }

    if (msg.type === "delete" && username) {
      const idx = history.findIndex(m => m.id === msg.msgId);
      if (idx !== -1 && history[idx].name === username) {
        history.splice(idx, 1);
        broadcast({ type: "delete", msgId: msg.msgId });
      }
      return;
    }

    if (msg.type === "typing" && username) {
      broadcast({ type: "typing", name: username, isTyping: msg.isTyping }, ws);
      return;
    }

    if (msg.type === "reaction" && username) {
      const { msgId, emoji } = msg;
      if (!reactions[msgId]) reactions[msgId] = {};
      if (!reactions[msgId][emoji]) reactions[msgId][emoji] = [];

      const arr = reactions[msgId][emoji];
      const idx = arr.indexOf(username);

      if (idx !== -1) {
        arr.splice(idx, 1);
        broadcast({ type: "reaction", msgId, emoji, name: username, remove: true });
      } else {
        arr.push(username);
        broadcast({ type: "reaction", msgId, emoji, name: username });
      }
    }
  });

  ws.on("close", () => {
    if (username) {
      clients.delete(ws);
      broadcast({ type: "typing", name: username, isTyping: false });
      broadcast({ type: "system", text: `${username} покинул чат` });
      broadcastUsers();
    }
  });
});

function broadcast(msg, exclude = null) {
  const data = JSON.stringify(msg);
  for (const [client] of clients) {
    if (client !== exclude && client.readyState === 1) client.send(data);
  }
  if (exclude && ["message","edit","delete","reaction"].includes(msg.type)) {
    if (exclude.readyState === 1) exclude.send(data);
  }
}

function broadcastUsers() {
  const users = [...clients.values()];
  const data = JSON.stringify({ type: "users", users });
  for (const [client] of clients) if (client.readyState === 1) client.send(data);
}

function now() {
  return new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅ Сервер запущен на порту ${PORT}`));
