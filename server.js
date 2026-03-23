const { WebSocketServer } = require("ws");
const http = require("http");

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Chat server is running ✅");
});

const wss = new WebSocketServer({ server });

let clients = new Map(); // socket → username
let history = []; // последние 50 сообщений

wss.on("connection", (ws) => {
  let username = null;

  ws.on("message", (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    // Регистрация имени
    if (msg.type === "join") {
      username = msg.name.slice(0, 20).trim() || "Аноним";
      clients.set(ws, username);

      // Отправить историю новому участнику
      ws.send(JSON.stringify({ type: "history", messages: history }));

      // Уведомить всех о входе
      broadcast({ type: "system", text: `${username} вошёл в чат`, time: now() }, ws);
      broadcastUsers();
      return;
    }

    // Обычное сообщение
    if (msg.type === "message" && username) {
      const entry = {
        type: "message",
        name: username,
        text: String(msg.text).slice(0, 1000),
        time: now()
      };
      history.push(entry);
      if (history.length > 50) history.shift();
      broadcast(entry);
    }
  });

  ws.on("close", () => {
    if (username) {
      clients.delete(ws);
      broadcast({ type: "system", text: `${username} покинул чат`, time: now() });
      broadcastUsers();
    }
  });
});

function broadcast(msg, exclude = null) {
  const data = JSON.stringify(msg);
  for (const [client] of clients) {
    if (client !== exclude && client.readyState === 1) {
      client.send(data);
    }
  }
  // Отправить и отправителю тоже (кроме system)
  if (exclude && msg.type === "message") exclude.send(data);
}

function broadcastUsers() {
  const users = [...clients.values()];
  const data = JSON.stringify({ type: "users", users });
  for (const [client] of clients) {
    if (client.readyState === 1) client.send(data);
  }
}

function now() {
  return new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅ Сервер запущен на порту ${PORT}`));
