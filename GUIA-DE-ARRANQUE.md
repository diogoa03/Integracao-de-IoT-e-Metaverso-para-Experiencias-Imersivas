# Guia de arranque

Ordem obrigatória. Cada passo tem um teste próprio — só avanças quando o teste passar.

```
[1] Sensor no Serial Monitor
        ↓
[2] Broker MQTT a receber
        ↓
[3] Servidor + base de dados
        ↓
[4] Ambiente 3D no browser
        ↓
[5] Agitador (o caminho de volta)
```

---

## Antes de começar

| O quê | Onde |
|---|---|
| Arduino IDE 2.x | arduino.cc/en/software |
| Node.js 20 ou superior | nodejs.org |
| Mosquitto | mosquitto.org/download |
| MongoDB | Atlas (grátis, sem instalar) ou local |

**Confirma primeiro qual é a tua placa.** O código usa o GPIO 1 para o pH, que é entrada
analógica no ESP32-S3 e no ESP32-C3. Num ESP32 clássico, o GPIO 1 é o pino TX0 da porta
série — se for esse o teu caso, muda `PH_PIN` para 34, 35 ou 36 e liga o sensor aí. Se
já tinhas leituras a aparecer no Serial Monitor com o teu bloco original, está certo.

---

## Passo 1 — Sensor sozinho

Objetivo: valores de pH credíveis no Serial Monitor, sem rede nenhuma.

1. Arduino IDE → *Ferramentas* → *Placa* → seleciona a tua placa ESP32.
   Se não aparecer: *Ficheiro* → *Preferências* → *URLs adicionais* →
   `https://espressif.github.io/arduino-esp32/package_esp32_index.json`
2. *Ferramentas* → *Gerir bibliotecas* → instala **PubSubClient**, **DHT sensor
   library** (Adafruit), **Adafruit Unified Sensor** e **Adafruit BMP280 Library**.
3. Liga o sensor de pH: `V+` a 5 V, `GND` a GND, saída analógica ao GPIO 1.
   O DHT22 vai ao GPIO 4. Se for a placa de 3 pinos, já traz a resistência de
   pull-up; se for o sensor de 4 pinos em bruto, mete 10 kΩ entre dados e 3V3.
4. Abre `firmware/esp32_lab_node.ino`, carrega e abre o Serial Monitor a **115200 baud**.

**Teste:** com a sonda em água da torneira deves ver algo entre pH 6,5 e 8,5. Se vires
0,00 ou 14,00 fixos, a sonda não está a chegar ao ADC — confirma o pino e a massa comum.

> **Atenção à tensão.** Algumas revisões da placa DFRobot dão até 5 V na saída quando o
> elétrodo está desligado. Mede com um multímetro antes de ligar ao ESP32 — o ADC só
> aguenta 3,3 V.

### Calibração

Compra saquetas de solução tampão pH 4,00 e pH 7,00 (uns €5).

1. Sonda no tampão 7,00, esperar estabilizar, anotar os mV.
2. Lavar com água destilada, secar sem esfregar o bolbo.
3. Sonda no tampão 4,00, anotar os mV.
4. No código: `PH_NEUTRAL_MV` = os mV do tampão 7, e
   `PH_SLOPE_MV = (mV_do_4 − mV_do_7) / 3.0`.

Guarda estes números — vão para o relatório como procedimento de calibração.

---

## Passo 2 — Broker MQTT

**Descobre o IP da tua máquina na rede local.** Não uses `localhost`: o ESP32 é outro
dispositivo e `localhost` para ele é ele próprio.

- Windows: `ipconfig` → *Endereço IPv4*
- Linux: `hostname -I`
- macOS: `ipconfig getifaddr en0`

Vai dar algo como `192.168.1.x`. É esse o valor de `MQTT_HOST` no firmware.

**O Mosquitto, a partir da versão 2.0, só aceita ligações locais.** É aqui que quase
toda a gente fica presa. Cria um ficheiro `mosquitto.conf`:

```
listener 1883 0.0.0.0
allow_anonymous true
```

E arranca com ele:

```bash
mosquitto -c mosquitto.conf -v
```

No Windows, se o serviço estiver a correr, para-o primeiro em *Serviços* e corre o
comando à mão para veres as mensagens.

Depois preenche no firmware o `WIFI_SSID`, a `WIFI_PASS` e o `MQTT_HOST`, e recarrega.

**Teste:** noutro terminal,

```bash
mosquitto_sub -h localhost -t 'lab/#' -v
```

Deves ver uma linha por segundo com o JSON do sensor.

**Se não vier nada:**
- O ESP32 só liga a Wi-Fi de **2,4 GHz**. Se a tua rede é 5 GHz, não vai ligar nunca.
- Firewall a bloquear a porta 1883 (no Windows é o suspeito habitual).
- Serial Monitor diz `[mqtt] falhou (rc=-2)` → IP do broker errado.

---

## Passo 3 — Servidor e base de dados

**MongoDB.** O caminho rápido é o Atlas: cria conta grátis, cria um cluster M0, em
*Network Access* permite o teu IP, e copia a *connection string*. Sem instalar nada.
Se preferires local, instala o MongoDB Community e usa
`mongodb://localhost:27017/lab-virtual`.

```bash
cd server
cp .env.example .env
```

Edita o `.env`:

```
PORT=3000
MONGO_URI=<a tua string de ligação>
MQTT_URL=mqtt://localhost:1883
```

Depois:

```bash
npm install
npm start
```

**Teste:** a consola deve mostrar `[db] ligado`, `[mqtt] ligado` e uma linha
`[mqtt] bancada-01 online`. Abre `http://localhost:3000/api/health` — deve responder
`{"status":"ok","mongo":true}`. E `http://localhost:3000/api/readings?minutes=5` deve
já trazer leituras guardadas.

Se o Atlas recusar, é quase sempre o IP não autorizado em *Network Access*.

---

## Passo 4 — Ambiente 3D

Abre `http://localhost:3000`. O servidor já serve a interface.

O indicador no canto superior direito deve ficar verde. O número grande deve mexer ao
ritmo das leituras, e o líquido no copo deve tomar a cor correspondente ao pH.

**Se a página abre mas o valor fica em `—`:** o servidor está a correr mas não chega
telemetria. Volta ao teste do passo 2 — o problema está entre o ESP32 e o broker, não
no browser.

**Consola do browser (F12)** é onde aparecem erros de módulos ou do Babylon.

---

## Passo 5 — Agitador

Um motor não se liga diretamente ao ESP32; o pino não dá corrente para isso.

```
ESP32 GPIO 5 ──► Gate do MOSFET (ou IN do módulo relé)
Fonte 12 V (+) ──► Motor (+)
Motor (−) ──────► Dreno do MOSFET
Fonte 12 V (−) ─┬─► Fonte do MOSFET
                └─► GND do ESP32     ← a massa TEM de ser comum
```

Se usares um módulo relé de 5 V já vem com tudo, ligas só `IN`, `VCC` e `GND`.

**Teste sem hardware nenhum primeiro:** liga um LED com resistência de 220 Ω ao GPIO 5 e
clica no agitador dentro da cena 3D. Se o LED acende, o caminho 3D → servidor → MQTT →
ESP32 está completo, e só falta trocar o LED pelo motor.

---

## Ordem de despiste

Quando algo falhar, vai de baixo para cima:

| Sintoma | Testa isto |
|---|---|
| Nada funciona | Serial Monitor: o sensor lê? |
| Serial lê, servidor não recebe | `mosquitto_sub -t 'lab/#' -v` |
| MQTT recebe, servidor não | consola do `npm start` |
| Servidor recebe, 3D não mostra | consola do browser (F12) |
| 3D mostra, agitador não liga | LED no GPIO 5 antes do motor |

---

## Para o relatório

Enquanto montas, regista o que o capítulo 5 vai precisar e que agora não existe:

- Os mV dos dois tampões e a reta de calibração que daí saiu.
- Tempo de resposta do elétrodo até 90% do valor final, com e sem agitação, umas dez
  repetições de cada. É o número que justifica teres hardware real.
- Latência do clique no 3D até o comando chegar ao ESP32.
- Desvio-padrão de umas centenas de leituras com a sonda parada num tampão — a
  variabilidade que as simulações puramente matemáticas não têm.
