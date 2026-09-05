// Curva de titulação: pH em função do volume adicionado.
// Função pura de desenho — recebe a experiência, não conhece o resto.

import { cssColor } from '/ph-scale.js';

export function drawCurve(canvas, experiment) {
  const ctx = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  const pad = { l: 30, r: 12, t: 12, b: 22 };
  ctx.clearRect(0, 0, w, h);

  const maxV = Math.max(2, experiment.addedVolume() * 1.15);
  const x = (v) => pad.l + (v / maxV) * (w - pad.l - pad.r);
  const y = (ph) => pad.t + (1 - ph / 14) * (h - pad.t - pad.b);

  ctx.strokeStyle = 'rgba(160,200,210,0.14)';
  ctx.fillStyle = '#7d8f97';
  ctx.font = '10px "Space Mono", monospace';
  ctx.lineWidth = 1;
  for (const ph of [0, 7, 14]) {
    ctx.beginPath();
    ctx.moveTo(pad.l, y(ph));
    ctx.lineTo(w - pad.r, y(ph));
    ctx.stroke();
    ctx.fillText(String(ph), 8, y(ph) + 3);
  }
  ctx.fillText(`${maxV.toFixed(1).replace('.', ',')} mL`, w - pad.r - 44, h - 6);

  // A leitura real que ancora a experiência, como linha de referência
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = 'rgba(233,241,243,0.35)';
  ctx.beginPath();
  ctx.moveTo(pad.l, y(experiment.measuredPh));
  ctx.lineTo(w - pad.r, y(experiment.measuredPh));
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.lineWidth = 2;
  ctx.strokeStyle = cssColor(experiment.ph());
  ctx.beginPath();
  experiment.curve.forEach((p, i) => {
    const px = x(p.volume), py = y(p.ph);
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  });
  ctx.stroke();

  const last = experiment.curve.at(-1);
  ctx.fillStyle = cssColor(last.ph);
  ctx.beginPath();
  ctx.arc(x(last.volume), y(last.ph), 3.5, 0, Math.PI * 2);
  ctx.fill();
}
