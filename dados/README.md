# Dados experimentais

Medições recolhidas durante o desenvolvimento e usadas no relatório.

## latencia-2026-08-15.csv

117 amostras de latência de transporte, recolhidas sobre hotspot de telemóvel
(cenário de rede desfavorável).

| | sensor → servidor | servidor → dispositivo |
|---|---|---|
| n | 87 | 30 |
| mediana | 14 ms | 10 ms |
| p95 | 78 ms | 16 ms |
| desvio-padrão | 27,9 ms | 3,4 ms |

As quatro primeiras amostras do sentido ascendente foram descartadas: o relógio
do ESP32 ainda não tinha assentado após a sincronização NTP, e os valores
(3300, 4618, 3650, 3301 ms) refletem desfasamento entre relógios e não tempo de
trânsito.

## Calibração da sonda de pH

Calibração de dois pontos, 17 leituras por tampão:

| Tampão | Média | Desvio-padrão | Em unidades de pH |
|---|---|---|---|
| 4,00 | 2661,4 mV | 15,03 mV | ±0,068 |
| 7,00 | 1996,6 mV | 4,59 mV | ±0,021 |

Reta resultante: `pH = 7,00 − (V − 1996,6) / 221,59`

O ruído é cerca de três vezes maior no tampão ácido. A 2661 mV a leitura está
na zona onde o ADC do ESP32-S2 com atenuação de 11 dB perde linearidade.
