// Laboratório Virtual — ponto de entrada
// Diogo Alves | 2022259
//
// Este ficheiro só liga as peças umas às outras. Toda a lógica vive nos
// módulos: cena e bancada, movimento, rede, painel, curva.

import { createScene } from '/scene.js';
import { createPlayer } from '/player.js';
import { createRealtime } from '/realtime.js';
import { createPanel } from '/panel.js';
import { createLatencyMonitor } from '/latency.js';
import { DEVICE_ID } from '/config.js';
import { el } from '/dom.js';

const canvas = el('scene');
const { scene, station, pipeline, visuals } = createScene(canvas);

// O painel precisa de saber enviar comandos e a rede precisa de saber a
// quem entregar as leituras: a referência é resolvida antes de qualquer
// mensagem chegar, por isso a ordem aqui não é um problema.
let panel;
let latency;

const realtime = createRealtime({
  deviceId: DEVICE_ID,
  onReading: (reading) => {
    panel.onReading(reading);
    latency.onReading(reading);
  },
  onConnection: (state) => panel.setConnection(state),
});

panel = createPanel({ visuals, sendCommand: realtime.sendCommand });

latency = createLatencyMonitor({
  deviceId: DEVICE_ID,
  socket: realtime.socket,
  sendCommand: realtime.sendCommand,
});

createPlayer({ scene, canvas, pipeline, station });
