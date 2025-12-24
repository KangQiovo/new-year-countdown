const path = require('path');
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const { randomUUID } = require('crypto');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;
const MAX_MESSAGES = 200;
const DATA_PATH = path.join(__dirname, 'blessings.json');

let blessings = [];

function ensureDataFile() {
  if (!fs.existsSync(DATA_PATH)) {
    fs.writeFileSync(DATA_PATH, '[]');
  }
}

function loadBlessings() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      blessings = parsed.slice(-MAX_MESSAGES);
    }
  } catch (error) {
    blessings = [];
  }
}

function persistBlessings() {
  const payload = JSON.stringify(blessings.slice(-MAX_MESSAGES), null, 2);
  fs.writeFile(DATA_PATH, payload, (err) => {
    if (err) {
      console.error('Failed to persist blessings:', err);
    }
  });
}

ensureDataFile();
loadBlessings();

app.use(express.static(path.join(__dirname)));

app.get('/api/blessings', (_req, res) => {
  loadBlessings();
  res.json(blessings);
});

function broadcast(payload) {
  const message = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}

wss.on('connection', (ws) => {
  loadBlessings();
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
        const clientCreated = Number(data.createdAt);
        const message = {
          id: incomingId || randomUUID(),
          author,
          text: normalized,
          createdAt: Number.isFinite(clientCreated) ? clientCreated : Date.now(),
        };
        blessings = [...blessings, message].slice(-MAX_MESSAGES);
        persistBlessings();
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
