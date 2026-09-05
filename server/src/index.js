import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import express from 'express';
import mongoose from 'mongoose';
import { Server } from 'socket.io';

import { Reading } from './models/Reading.js';
import { startMqttBridge, devices } from './mqttBridge.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

await mongoose.connect(process.env.MONGO_URI);
console.log('[db] ligado a', process.env.MONGO_URI);

const { sendCommand } = startMqttBridge(io);

const COMMANDS = new Set(['stirrer:on', 'stirrer:off', 'ping']);
const isValidCommand = (c) =>
  COMMANDS.has(c) || /^calibrate:\d{1,2}(\.\d{1,2})?$/.test(c);

// ---------- REST ----------
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', mongo: mongoose.connection.readyState === 1 });
});

app.get('/api/devices', (req, res) => {
  res.json([...devices.values()]);
});

app.get('/api/readings', async (req, res) => {
  const { deviceId, minutes = 15, limit = 500 } = req.query;
  const since = new Date(Date.now() - Number(minutes) * 60_000);

  const filter = { ts: { $gte: since } };
  if (deviceId) filter['meta.deviceId'] = deviceId;

  const rows = await Reading.find(filter)
    .sort({ ts: -1 })
    .limit(Math.min(Number(limit), 5000))
    .lean();

  res.json(rows.reverse());
});

app.post('/api/devices/:deviceId/command', (req, res) => {
  const { command } = req.body;
  if (!isValidCommand(command)) {
    return res.status(400).json({ error: 'Comando não reconhecido.' });
  }
  sendCommand(req.params.deviceId, command);
  res.json({ sent: command });
});

// ---------- WebSocket ----------
io.on('connection', (socket) => {
  console.log('[ws] cliente ligado:', socket.id);

  // Estado atual, para o ambiente 3D abrir já com valores.
  socket.emit('snapshot', [...devices.values()]);

  // Caminho 3D -> hardware. Vai direto ao MQTT, sem passar pelo REST,
  // para manter a latência dentro do objetivo dos 150 ms.
  socket.on('command', ({ deviceId, command, measure }, ack) => {
    if (!deviceId || !isValidCommand(command)) {
      ack?.({ ok: false, error: 'Comando não reconhecido.' });
      return;
    }
    sendCommand(deviceId, command, Boolean(measure));
    ack?.({ ok: true, sentAt: Date.now() });
  });

  socket.on('disconnect', () => console.log('[ws] cliente saiu:', socket.id));
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`[http] http://localhost:${port}`));
