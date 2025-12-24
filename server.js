const path = require('path');
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const { randomUUID } = require('crypto');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;
const MAX_MESSAGES = 200;

let blessings = [];

app.use(express.static(path.join(__dirname)));

function broadcast(payload) {
  const message = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}

wss.on('connection', (ws) => {
  ws.send(
    JSON.stringify({
      type: 'init',
      messages: blessings,
      now: Date.now(),
    })
  );

  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw.toString());
      if (data.type === 'blessing') {
        const text = String(data.text || '').trim();
        const incomingId = String(data.id || '').trim();
        const author = String(data.author || '').trim().slice(0, 32) || '游客';
        if (!text) return;
        const normalized = text.slice(0, 160);
        const message = {
          id: incomingId || randomUUID(),
          author,
          text: normalized,
          createdAt: Date.now(),
        };
        blessings = [...blessings, message].slice(-MAX_MESSAGES);
        broadcast({ type: 'blessing', message });
      }
    } catch (error) {
      console.error('Failed to process message', error);
    }
  });
});

setInterval(() => {
  broadcast({ type: 'time', now: Date.now() });
}, 1000);

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
