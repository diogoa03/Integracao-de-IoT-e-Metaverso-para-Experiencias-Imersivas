import mongoose from 'mongoose';

// Coleção de série temporal: o MongoDB agrupa os documentos por deviceId
// e por janela temporal, reduzindo espaço em disco e acelerando as
// consultas por intervalo (o caso de uso do histórico de sensores).
const readingSchema = new mongoose.Schema(
  {
    ts: { type: Date, required: true },
    meta: {
      deviceId: { type: String, required: true },
    },
    ph: Number,
    voltage: Number,
    temperature: Number,
    humidity: Number,
    pressure: Number,
    stirrer: Boolean,
  },
  {
    versionKey: false,
    timeseries: {
      timeField: 'ts',
      metaField: 'meta',
      granularity: 'seconds',
    },
    expireAfterSeconds: 60 * 60 * 24 * 30, // retenção de 30 dias
  }
);

export const Reading = mongoose.model('Reading', readingSchema);
