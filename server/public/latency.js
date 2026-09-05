// Medição de latência dos dois sentidos da ligação IoT ↔ Metaverso.
//
//   uplink   sensor → ecrã: instante de publicação no ESP32 até o
//            browser desenhar. Exige relógios sincronizados por NTP.
//   downlink clique → hardware: publicação do comando até o eco do
//            dispositivo chegar. Medido inteiramente no servidor, com
//            um só relógio, por isso é o mais fiável dos dois.
//
// Guarda as amostras para exportação: o objetivo 4 do projeto promete
// menos de 150 ms e uma promessa sem série de dados não se verifica.

import { el } from '/dom.js';

const MAX_SAMPLES = 2000;

export function createLatencyMonitor({ deviceId, socket, sendCommand }) {
  const samples = { uplink: [], downlink: [] };
  let probing = null;

  function record(direction, ms) {
    if (!Number.isFinite(ms) || ms < 0) return;
    const list = samples[direction];
    list.push({ ms, at: Date.now() });
    if (list.length > MAX_SAMPLES) list.shift();
    render();
  }

  function stats(list) {
    if (!list.length) return null;
    const values = list.map((s) => s.ms).sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    // Percentil 95 pelo método do índice mais próximo: com poucas
    // amostras evita cair sempre no valor máximo.
    const p95 = values[Math.min(values.length - 1, Math.ceil(values.length * 0.95) - 1)];
    return {
      n: values.length,
      min: values[0],
      max: values.at(-1),
      avg: sum / values.length,
      median: values[Math.floor(values.length / 2)],
      p95,
    };
  }

  function render() {
    for (const dir of ['uplink', 'downlink']) {
      const s = stats(samples[dir]);
      const box = el(`lat-${dir}`);
      if (!s) {
        box.dataset.state = 'empty';
        el(`lat-${dir}-value`).textContent = '—';
        el(`lat-${dir}-detail`).textContent = 'sem amostras';
        continue;
      }
      // O limiar dos 150 ms vem do objetivo 4 do pré-projeto.
      box.dataset.state = s.p95 <= 150 ? 'good' : 'over';
      el(`lat-${dir}-value`).textContent = `${Math.round(s.median)} ms`;
      el(`lat-${dir}-detail`).textContent =
        `n=${s.n} · méd ${Math.round(s.avg)} · p95 ${Math.round(s.p95)} · ${Math.round(s.min)}–${Math.round(s.max)}`;
    }
  }

  // ---------- Entradas ----------
  function onReading(reading) {
    if (typeof reading.uplinkMs === 'number') record('uplink', reading.uplinkMs);
  }

  socket.on('latency', ({ deviceId: id, direction, ms }) => {
    if (id === deviceId) record(direction, ms);
  });

  // ---------- Série automática ----------
  // Envia pings espaçados: mede o caminho de comando sem tocar no
  // atuador e sem depender de o utilizador clicar N vezes.
  async function runProbe(count = 30, gapMs = 400) {
    if (probing) return;
    probing = true;
    const btn = el('lat-probe');
    btn.disabled = true;

    for (let i = 1; i <= count; i++) {
      btn.textContent = `A medir… ${i}/${count}`;
      sendCommand('ping', true);
      await new Promise((r) => setTimeout(r, gapMs));
    }

    btn.textContent = 'Medir 30 comandos';
    btn.disabled = false;
    probing = false;
  }

  function toCsv() {
    const rows = ['direcao,ms,timestamp_iso'];
    for (const dir of ['uplink', 'downlink']) {
      for (const s of samples[dir]) {
        rows.push(`${dir},${s.ms},${new Date(s.at).toISOString()}`);
      }
    }
    return rows.join('\n');
  }

  function download() {
    const blob = new Blob([toCsv()], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `latencia-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function reset() {
    samples.uplink.length = 0;
    samples.downlink.length = 0;
    render();
  }

  el('lat-probe').addEventListener('click', () => runProbe());
  el('lat-export').addEventListener('click', download);
  el('lat-reset').addEventListener('click', reset);

  el('lat-toggle').addEventListener('click', () => {
    const open = el('latency').dataset.open !== 'true';
    el('latency').dataset.open = String(open);
  });

  // Ctrl+Shift+L revela ou esconde o painel. A combinação evita as teclas
  // de movimento e não colide com atalhos do browser.
  addEventListener('keydown', (e) => {
    if (!e.ctrlKey || !e.shiftKey) return;
    if (e.code !== 'KeyL') return;
    e.preventDefault();
    const box = el('latency');
    box.dataset.visible = box.dataset.visible === 'true' ? 'false' : 'true';
  });

  render();
  return { onReading };
}
