import mqtt from 'mqtt';
import { Reading } from './models/Reading.js';

// Estado vivo de cada dispositivo, mantido em memória para que um cliente
// que entre a meio já receba o último valor sem esperar pela próxima leitura.
export const devices = new Map();

const TELEMETRY_TOPIC = 'lab/+/telemetry';
const STATUS_TOPIC = 'lab/+/status';
const ACK_TOPIC = 'lab/+/ack';

// Comandos a aguardar eco do dispositivo, para medir o caminho inverso.
const pending = new Map();

export function startMqttBridge(io) {
  const client = mqtt.connect(process.env.MQTT_URL, {
    username: process.env.MQTT_USER || undefined,
    password: process.env.MQTT_PASS || undefined,
    reconnectPeriod: 2000,
  });

  client.on('connect', () => {
    console.log('[mqtt] ligado a', process.env.MQTT_URL);
    client.subscribe([TELEMETRY_TOPIC, STATUS_TOPIC, ACK_TOPIC], { qos: 1 });
  });

  client.on('error', (err) => console.error('[mqtt]', err.message));

  client.on('message', async (topic, payload) => {
    const [, deviceId, kind] = topic.split('/');
    const receivedAt = Date.now();

    // Eco de um comando: fecha o cronometro do troco servidor -> dispositivo.
    if (kind === 'ack') {
      let ack;
      try { ack = JSON.parse(payload.toString()); } catch { return; }
      const started = pending.get(ack.probeId);
      if (started === undefined) return;
      pending.delete(ack.probeId);
      io.emit('latency', {
        deviceId,
        direction: 'downlink',
        ms: receivedAt - started,
        at: receivedAt,
      });
      return;
    }

    if (kind === 'status') {
      const online = payload.toString() === 'online';
      const state = devices.get(deviceId) || { deviceId };
      devices.set(deviceId, { ...state, online, updatedAt: Date.now() });
      io.emit('device-status', { deviceId, online });
      console.log(`[mqtt] ${deviceId} ${online ? 'online' : 'offline'}`);
      return;
    }

    if (kind !== 'telemetry') return;

    let data;
    try {
      data = JSON.parse(payload.toString());
    } catch {
      console.warn('[mqtt] telemetria inválida em', topic);
      return;
    }

    // Latencia do troco dispositivo -> servidor. Depende de os dois
    // relogios estarem sincronizados por NTP; se o ESP32 ainda nao
    // acertou a hora, sentAt vem a zero e o valor e descartado.
    const uplinkMs = data.sentAt > 0 ? receivedAt - data.sentAt : null;

    const reading = {
      deviceId,
      uplinkMs,
      ph: data.ph,
      voltage: data.voltage,
      temperature: data.temperature ?? null,
      humidity: data.humidity ?? null,
      pressure: data.pressure ?? null,
      stirrer: Boolean(data.stirrer),
      ts: Date.now(),
    };

    devices.set(deviceId, { ...reading, online: true, updatedAt: reading.ts });

    // Caminho rápido: o ambiente 3D recebe antes da escrita em base de dados.
    io.emit('reading', reading);

    try {
      await Reading.create({
        ts: new Date(reading.ts),
        meta: { deviceId },
        ph: reading.ph,
        voltage: reading.voltage,
        temperature: reading.temperature,
        humidity: reading.humidity,
        pressure: reading.pressure,
        stirrer: reading.stirrer,
      });
    } catch (err) {
      console.error('[db] falhou a gravar leitura:', err.message);
    }
  });

  function sendCommand(deviceId, command, measure = false) {
    if (!measure) {
      client.publish(`lab/${deviceId}/command`, command, { qos: 1 });
      console.log(`[mqtt] -> ${deviceId}: ${command}`);
      return;
    }

    const probeId = Math.random().toString(36).slice(2, 10);
    pending.set(probeId, Date.now());
    // Ecos que nunca chegam ficariam a acumular em memoria.
    setTimeout(() => pending.delete(probeId), 10_000);

    client.publish(`lab/${deviceId}/command`, `${command}#${probeId}`, { qos: 1 });
  }

  return { client, sendCommand };
}
