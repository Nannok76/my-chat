const WebSocket = require('ws');

// Используем порт из настроек Railway или 8080 для локалки
const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

let messages = []; // История последних 50 сообщений
let users = new Map(); // Список пользователей в сети

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        const data = JSON.parse(message);

        // Логика входа в чат
        if (data.type === 'join') {
            ws.name = data.name;
            users.set(ws, data.name);
            
            // Отправляем историю сообщений новому пользователю
            ws.send(JSON.stringify({ type: 'history', messages }));
            
            // Уведомляем всех о новом пользователе
            broadcast({ type: 'system', text: `${data.name} вошёл в чат` });
            broadcastUsers();
        }

        // Логика обычного сообщения или картинки
        if (data.type === 'message') {
            const newMessage = {
                type: 'message',
                name: ws.name,
                text: data.text,
                isImage: data.isImage || false, // ПЕРЕДАЕМ ПАРАМЕТР КАРТИНКИ
                time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
            };

            messages.push(newMessage);
            if (messages.length > 50) messages.shift(); // Храним только последние 50

            broadcast(newMessage);
        }
    });

    ws.on('close', () => {
        if (ws.name) {
            broadcast({ type: 'system', text: `${ws.name} покинул чат` });
            users.delete(ws);
            broadcastUsers();
        }
    });
});

// Функция рассылки всем подключенным клиентам
function broadcast(data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

// Функция обновления списка пользователей онлайн
function broadcastUsers() {
    const userNames = Array.from(users.values());
    broadcast({ type: 'users', users: userNames });
}

console.log(`Сервер запущен на порту ${PORT}`);
