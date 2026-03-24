const WebSocket = require('ws');
const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

let messages = []; 
let users = new Map();

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        const data = JSON.parse(message);

        if (data.type === 'join') {
            ws.name = data.name;
            users.set(ws, data.name);
            ws.send(JSON.stringify({ type: 'history', messages }));
            broadcast({ type: 'system', text: `${data.name} вошёл в чат` });
            broadcastUsers();
        }

        if (data.type === 'message') {
            const newMessage = {
                type: 'message',
                id: Date.now() + Math.random(), // Уникальный ID
                name: ws.name,
                text: data.text,
                isImage: data.isImage || false,
                isVoice: data.isVoice || false,
                replyTo: data.replyTo || null, // Кому отвечаем
                time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
            };
            messages.push(newMessage);
            if (messages.length > 100) messages.shift();
            broadcast(newMessage);
        }

        if (data.type === 'delete') {
            messages = messages.filter(m => m.id !== data.id);
            broadcast({ type: 'delete', id: data.id });
        }

        if (data.type === 'edit') {
            const msg = messages.find(m => m.id === data.id);
            if (msg && msg.name === ws.name) {
                msg.text = data.text;
                msg.isEdited = true;
                broadcast({ type: 'edit', id: data.id, text: data.text });
            }
        }
    });

    ws.on('close', () => {
        if (ws.name) {
            users.delete(ws);
            broadcast({ type: 'system', text: `${ws.name} покинул чат` });
            broadcastUsers();
        }
    });
});

function broadcast(data) {
    wss.clients.forEach(c => { if(c.readyState === WebSocket.OPEN) c.send(JSON.stringify(data)) });
}

function broadcastUsers() {
    broadcast({ type: 'users', users: Array.from(users.values()) });
}
