const WebSocket = require('ws');

// Railway даёт порт динамически через переменные окружения
const PORT = process.env.PORT || 8080;
const server = new WebSocket.Server({ port: PORT });

// Хранилище истории (последние 50 сообщений)
let history = [];
// Список активных пользователей: { ws_объект: "Имя" }
const users = new Map();

console.log(`WebSocket сервер запущен на порту ${PORT}`);

server.on('connection', (ws) => {
  console.log('Новое подключение');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      // 1. Обработка входа пользователя
      if (data.type === 'join') {
        ws.name = data.name;
        users.set(ws, data.name);

        // Отправляем новичку историю сообщений
        ws.send(JSON.stringify({ type: 'history', messages: history }));

        // Оповещаем всех о новом пользователе
        broadcastSystem(`${data.name} вошёл в чат`);
        broadcastUsersList();
      }

      // 2. Обработка обычных сообщений (текст или картинка)
      if (data.type === 'message') {
        const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        
        const newMessage = {
          type: 'message',
          name: ws.name || 'Аноним',
          text: data.text,
          isImage: data.isImage || false, // Сервер теперь запоминает, картинка это или нет
          time: time
        };

        // Добавляем в историю и держим лимит в 50 сообщений
        history.push(newMessage);
        if (history.length > 50) history.shift();

        // Рассылаем всем
        broadcast(newMessage);
      }

    } catch (e) {
      console.error('Ошибка обработки сообщения:', e);
    }
  });

  // Обработка отключения
  ws.on('close', () => {
    if (ws.name) {
      users.delete(ws);
      broadcastSystem(`${ws.name} покинул чат`);
      broadcastUsersList();
    }
  });
});

// Функция отправки всем подключённым клиентам
function broadcast(data) {
  const msg = JSON.stringify(data);
  server.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

// Отправка системных уведомлений
function broadcastSystem(text) {
  broadcast({ type: 'system', text });
}

// Отправка актуального списка людей онлайн
function broadcastUsersList() {
  const currentUsers = Array.from(users.values());
  broadcast({ type: 'users', users: currentUsers });
}
