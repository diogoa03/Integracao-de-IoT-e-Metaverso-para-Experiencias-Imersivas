// Escala de indicador universal (0–14). Uma só definição, usada pelo
// painel, pela curva, pelo líquido no copo e pelo mostrador da parede —
// se o código de cor divergisse entre eles, deixaria de se ler.
export const PH_STOPS = [
  [0, '#c8102e'], [2, '#e0532c'], [4, '#efa73a'], [6, '#c6d24c'],
  [7, '#4faf5a'], [8, '#3aa792'], [10, '#2e7fb8'], [12, '#4a4fa8'], [14, '#6b2fa0'],
];

const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

export function phColor(ph) {
  const v = Math.min(14, Math.max(0, ph));
  for (let i = 0; i < PH_STOPS.length - 1; i++) {
    const [a, ca] = PH_STOPS[i];
    const [b, cb] = PH_STOPS[i + 1];
    if (v <= b) {
      const t = (v - a) / (b - a);
      const c1 = hexToRgb(ca), c2 = hexToRgb(cb);
      return c1.map((x, k) => Math.round(x + (c2[k] - x) * t));
    }
  }
  return hexToRgb(PH_STOPS.at(-1)[1]);
}

export const cssColor = (ph) => `rgb(${phColor(ph).join(',')})`;

export const gradientCss = () =>
  `linear-gradient(90deg, ${PH_STOPS.map(([p, c]) => `${c} ${(p / 14) * 100}%`).join(', ')})`;
