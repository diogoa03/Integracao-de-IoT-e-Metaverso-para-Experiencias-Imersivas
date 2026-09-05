// ---------------------------------------------------------------
// Modelo de equilíbrio ácido-base
//
// A simulação parte sempre de um pH MEDIDO pela sonda, não de um
// valor tabelado. A amostra é descrita como água + um sistema
// tampão único (Ct, pKa) que aproxima a capacidade tamponante real
// do líquido — é o que separa a água destilada do leite.
//
// Balanço protónico, para uma concentração líquida de ácido forte
// adicionado Ca (negativa quando se adiciona base forte):
//
//   B - Ca + [H+] - Kw/[H+] - Ct·Ka/(Ka + [H+]) = 0
//
// B é a base forte equivalente já presente na amostra, deduzida do
// pH inicial medido: é isto que ancora o modelo à realidade.
// ---------------------------------------------------------------

const KW = 1e-14;

// Líquidos do dia a dia, com a capacidade tamponante típica.
// O pH inicial NÃO está aqui de propósito — vem sempre da sonda.
export const SAMPLES = {
  'agua-destilada': { nome: 'Água destilada', Ct: 0.0002, pKa: 6.35 },
  'agua-torneira':  { nome: 'Água da torneira', Ct: 0.0020, pKa: 6.35 },
  'leite':          { nome: 'Leite', Ct: 0.0600, pKa: 6.80 },
  'sumo-laranja':   { nome: 'Sumo de laranja', Ct: 0.0500, pKa: 3.14 },
  'agua-com-sabao': { nome: 'Água com sabão', Ct: 0.0100, pKa: 9.25 },
};

export const REAGENTS = {
  'hcl': { nome: 'Ácido clorídrico', simbolo: 'HCl', conc: 0.1, sinal: +1 },
  'naoh': { nome: 'Hidróxido de sódio', simbolo: 'NaOH', conc: 0.1, sinal: -1 },
};

/**
 * Estado de uma experiência simulada, ancorada numa leitura real.
 * Todos os volumes em mL, todas as quantidades em mol.
 */
export class Experiment {
  constructor({ sampleKey, volumeMl, measuredPh }) {
    const sample = SAMPLES[sampleKey];
    this.sample = sample;
    this.sampleKey = sampleKey;
    this.V0 = volumeMl;
    this.V = volumeMl;
    this.measuredPh = measuredPh;

    this.Ka = 10 ** -sample.pKa;
    this.nBuffer = (sample.Ct * volumeMl) / 1000;
    this.nAcid = 0;

    // Deduz a base forte equivalente que explica o pH medido.
    const h = 10 ** -measuredPh;
    const aMinus = sample.Ct * (this.Ka / (this.Ka + h));
    this.nBase = ((aMinus - h + KW / h) * volumeMl) / 1000;

    this.curve = [{ volume: 0, ph: measuredPh }];
  }

  /** Adiciona reagente e devolve o novo pH. */
  add(reagentKey, volumeMl) {
    const reagent = REAGENTS[reagentKey];
    this.nAcid += reagent.sinal * reagent.conc * (volumeMl / 1000);
    this.V += volumeMl;

    const ph = this.ph();
    this.curve.push({ volume: this.addedVolume(), ph });
    return ph;
  }

  addedVolume() {
    return this.V - this.V0;
  }

  /** Resolve o balanço protónico por bissecção em pH ∈ [0, 14]. */
  ph() {
    const litros = this.V / 1000;
    const B = this.nBase / litros;
    const Ca = this.nAcid / litros;
    const Ct = this.nBuffer / litros;
    const Ka = this.Ka;

    // A função é monótona decrescente em pH, por isso a bissecção converge.
    const f = (ph) => {
      const h = 10 ** -ph;
      return B - Ca + h - KW / h - Ct * (Ka / (Ka + h));
    };

    let lo = 0, hi = 14;
    if (f(lo) < 0) return 0;
    if (f(hi) > 0) return 14;

    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (f(mid) > 0) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }

  reset(measuredPh = this.measuredPh) {
    return new Experiment({
      sampleKey: this.sampleKey,
      volumeMl: this.V0,
      measuredPh,
    });
  }
}
