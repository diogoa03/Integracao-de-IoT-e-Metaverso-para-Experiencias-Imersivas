// Painel da experiência: estado da amostra, adição de reagentes e
// tradução de tudo isso para o ecrã e para a bancada 3D.
// É aqui que vive a distinção entre valor medido e valor calculado.

import { SAMPLES, REAGENTS, Experiment } from '/sim.js';
import { phColor, cssColor, gradientCss } from '/ph-scale.js';
import { drawCurve } from '/chart.js';
import { DOSES } from '/config.js';
import { el, toast } from '/dom.js';

export function createPanel({ visuals, sendCommand }) {
  let latestReading = null;
  let experiment = null;
  let online = false;

  const sampleSelect = el('sample');
  const volumeInput = el('volume');

  el('scale-strip').style.background = gradientCss();

  for (const [key, sample] of Object.entries(SAMPLES)) {
    sampleSelect.append(new Option(sample.nome, key));
  }

  buildReagentButtons();

  // ---------- Apresentação ----------
  function paintScreen() {
    const ph = experiment ? experiment.ph() : latestReading?.ph ?? null;
    visuals.drawScreen({
      ph: typeof ph === 'number' ? ph : null,
      temperature: latestReading?.temperature ?? null,
      humidity: latestReading?.humidity ?? null,
      pressure: latestReading?.pressure ?? null,
      online,
      color: typeof ph === 'number' ? cssColor(ph) : null,
    });
  }

  function display(ph, kind) {
    el('ph-value').textContent = ph.toFixed(2);
    el('ph-value').style.color = cssColor(ph);
    el('scale-marker').style.left = `${(Math.min(14, Math.max(0, ph)) / 14) * 100}%`;
    el('scale-marker-value').textContent = ph.toFixed(2);

    const origin = el('origin');
    origin.dataset.kind = kind;
    origin.textContent = kind === 'measured'
      ? 'medido pela sonda'
      : 'calculado a partir da leitura';

    visuals.setLiquidColor(phColor(ph));
    paintScreen();
  }

  function refresh() {
    display(experiment.ph(), 'simulated');
    el('added-value').textContent =
      `${experiment.addedVolume().toFixed(1).replace('.', ',')} mL`;
    visuals.setLiquidLevel(0.7 * (experiment.V / experiment.V0));
    drawCurve(el('curve'), experiment);
  }

  // ---------- Entradas ----------
  function onReading(reading) {
    latestReading = reading;

    if (typeof reading.ph === 'number') {
      el('measured-value').textContent = `${reading.ph.toFixed(2)} pH`;
      if (experiment) paintScreen();
      else display(reading.ph, 'measured');
    }

    el('temp-value').textContent = typeof reading.temperature === 'number'
      ? `${reading.temperature.toFixed(1)} °C` : 'sem sensor';
    el('hum-value').textContent = typeof reading.humidity === 'number'
      ? `${reading.humidity.toFixed(1)} %` : 'sem sensor';
    el('pres-value').textContent = typeof reading.pressure === 'number'
      ? `${reading.pressure.toFixed(1)} hPa` : 'sem sensor';
    el('mv-value').textContent = typeof reading.voltage === 'number'
      ? `${reading.voltage.toFixed(0)} mV` : '—';

    visuals.setStirrer(Boolean(reading.stirrer));
  }

  function setConnection(state) {
    online = state;
    el('status').dataset.state = state ? 'online' : 'offline';
    el('status-text').textContent = state
      ? 'dispositivo ligado' : 'à espera do dispositivo';
    paintScreen();
  }

  // ---------- Ações ----------
  el('anchor').addEventListener('click', () => {
    if (!latestReading || typeof latestReading.ph !== 'number') {
      toast('Ainda não chegou nenhuma leitura da sonda.');
      return;
    }
    experiment = new Experiment({
      sampleKey: sampleSelect.value,
      volumeMl: Number(volumeInput.value),
      measuredPh: latestReading.ph,
    });
    el('reagents').hidden = false;
    el('curve-box').hidden = false;
    el('hint').textContent =
      'A partir daqui os valores são calculados. Volta a ancorar sempre que trocares de líquido.';
    refresh();
  });

  el('reset').addEventListener('click', () => {
    if (!experiment) return;
    experiment = experiment.reset(latestReading?.ph ?? experiment.measuredPh);
    refresh();
  });

  el('stirrer-toggle').addEventListener('click', async () => {
    const next = !latestReading?.stirrer;
    visuals.setStirrer(next);
    const ok = await sendCommand(next ? 'stirrer:on' : 'stirrer:off');
    if (!ok) {
      visuals.setStirrer(!next);
      toast('O comando não chegou ao servidor.');
    }
  });

  // Calibração de um ponto: o firmware assume que a sonda está no tampão
  // 7,00 no instante do comando e ajusta o ponto neutro à tensão lida.
  // O ajuste vive em memória do ESP32 — reiniciar volta às constantes
  // gravadas no firmware.
  // Ctrl+Shift+Y revela ou esconde o botão de calibração.
  // Não se usa Ctrl+Shift+C nem I, J, K: são atalhos reservados das
  // ferramentas de programador e o browser consome-os antes da página.
  addEventListener('keydown', (e) => {
    if (!e.ctrlKey || !e.shiftKey || e.code !== 'KeyY') return;
    e.preventDefault();
    const btn = el('calibrate');
    btn.dataset.visible = btn.dataset.visible === 'true' ? 'false' : 'true';
  });

  el('calibrate').addEventListener('click', async () => {
    const ok = await sendCommand('calibrate:7.00');
    toast(ok
      ? 'Calibração enviada. Mantém a sonda na solução tampão 7,00.'
      : 'O comando não chegou ao servidor.');
  });

  function buildReagentButtons() {
    const grid = el('reagent-grid');
    for (const [key, reagent] of Object.entries(REAGENTS)) {
      const group = document.createElement('div');
      group.className = 'reagent';
      group.innerHTML =
        `<span class="reagent-name">${reagent.simbolo} <em>${reagent.conc} M</em></span>`;

      const row = document.createElement('div');
      row.className = 'dose-row';
      for (const dose of DOSES) {
        const btn = document.createElement('button');
        btn.className = 'dose';
        btn.textContent = `+${dose.toFixed(1).replace('.', ',')}`;
        btn.addEventListener('click', () => {
          if (!experiment) return;
          experiment.add(key, dose);
          refresh();
        });
        row.append(btn);
      }
      group.append(row);
      grid.append(group);
    }
  }

  return { onReading, setConnection };
}
