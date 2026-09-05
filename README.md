# Laboratório Virtual - integração IoT ↔ Metaverso

Protótipo ponta-a-ponta: sonda de pH DFRobot + DS18B20 num ESP32, telemetria por MQTT,
servidor Node.js com MongoDB, e ambiente 3D em Babylon.js acessível pelo browser.

```
ESP32 ──MQTT──► Mosquitto ──►  Node.js  ──WebSocket──►  Babylon.js
 pH, T          lab/+/telemetry   │  Express (REST)      (browser)
 agitador ◄──── lab/+/command     └──►  MongoDB (série temporal)
```

## O que é medido e o que é calculado

Esta distinção é o centro do projeto e está visível na própria interface.

**Medido pela sonda:** o pH do líquido real dentro do copo, a sua temperatura, a tensão
bruta do elétrodo, o tempo de resposta e a deriva. Trocar a sonda de água para leite
muda o valor no ambiente 3D em tempo real, sem nada de simulado pelo meio.

**Calculado a partir da leitura:** o efeito de reagentes adicionados dentro do ambiente
3D. O modelo (`public/sim.js`) resolve o balanço protónico da amostra tratada como
água mais um sistema tampão único, e o ponto de partida é sempre o valor que a sonda
acabou de ler, não uma constante de manual.

O painel marca cada valor com a sua proveniência (`medido pela sonda` / `calculado a
partir da leitura`) e a curva de titulação traça a leitura real como linha de
referência. Um protótipo que confundisse as duas coisas seria mais fácil de fazer e
muito pior de defender.

### O contraste que a experiência demonstra

Partindo de leituras reais, com HCl 0,1 M em 100 mL:

| Adicionado | Água destilada (7,02) | Água da torneira (7,60) | Leite (6,70) |
|---|---|---|---|
| 0,1 mL | 6,04 | 7,29 | 6,70 |
| 0,5 mL | 3,48 | 6,71 | 6,69 |
| 2,0 mL | 2,74 | 3,95 | 6,64 |

A água destilada colapsa, a da torneira resiste graças à alcalinidade dos bicarbonatos,
e o leite quase não se move porque está tamponado pelos fosfatos e pela caseína. É um
fenómeno real, e a curva de cada líquido depende do valor que a sonda leu naquele
momento, não é a mesma curva para todos os alunos.

## Nota sobre o objetivo 5 do pré-projeto

O pré-projeto fala em utilizadores que *controlam* experiências. Sem um atuador
físico, o único caminho real do 3D para o hardware é o comando de calibração e o
agitador. Ou mantens um atuador simples na bancada, ou reformulas esse objetivo para
falar em experiências ancoradas em medição em vez de controlo remoto.

## Contrato MQTT

| Tópico | Sentido | Payload |
|---|---|---|
| `lab/{deviceId}/telemetry` | ESP32 → servidor | `{"deviceId","ph","voltage","temperature","humidity","pressure","stirrer","uptime"}` |
| `lab/{deviceId}/command` | servidor → ESP32 | `stirrer:on` · `stirrer:off` · `calibrate:7.00` · `ping` |
| `lab/{deviceId}/status` | ESP32 → servidor | `online` / `offline` (retido, com Last Will) |

O *Last Will* garante que, se o ESP32 perder alimentação, o broker publica `offline`
sozinho e o ambiente 3D reage sem esperar por um *timeout*.

## Arranque

**1. Broker MQTT**

```bash
sudo apt install mosquitto mosquitto-clients
sudo systemctl enable --now mosquitto
mosquitto_sub -t 'lab/#' -v      # para veres as mensagens a passar
```

**2. MongoDB** - local ou Atlas. As leituras vão para uma coleção de série temporal,
criada automaticamente no primeiro arranque.

**3. Servidor**

```bash
cd server
cp .env.example .env     # preencher MONGO_URI e MQTT_URL
npm install
npm start                # http://localhost:3000
```

**4. Firmware** - copiar `firmware/secrets.example.h` para `firmware/secrets.h` e
preencher SSID, password e o IP do broker. Depois abrir
`firmware/esp32_lab_node.ino` e instalar as bibliotecas `PubSubClient`, `OneWire` e `DallasTemperature`.

## Ligações

| Componente | ESP32 |
|---|---|
| Sonda pH (saída analógica) | GPIO 1 (ADC1) |
| BMP280 (I²C) | SDA GPIO 8, SCL GPIO 9, VCC 3V3 |
| DS18B20 (dados) | GPIO 4 + resistência pull-up de 4,7 kΩ para 3V3 |
| Relé / LED do agitador | GPIO 5 |

Alimenta a placa do pH a 5 V, mas confirma que a saída analógica não ultrapassa 3,3 V
antes de a ligar ao ADC. Algumas revisões da placa DFRobot chegam aos 5 V com o
elétrodo desligado.

## Calibração do pH

A fórmula é exatamente a que já tinhas, apenas reescrita para os dois pontos ficarem
visíveis:

```cpp
ph = 7.0 - (voltage - PH_NEUTRAL_MV) / PH_SLOPE_MV;   // 1990.0 mV e 225.0 mV/pH
```

`calibrate:7.00` ajusta `PH_NEUTRAL_MV` ao valor lido no momento, com a sonda dentro da
solução tampão. Para calibrar o declive são precisos dois tampões (4,00 e 7,00):
`PH_SLOPE_MV = (mV_pH4 − mV_pH7) / 3.0`.

## Medição de latência

O objetivo 4 do projeto promete sincronização com latência inferior a 150 ms. O
painel de latência, no canto superior direito, mede os dois sentidos separadamente:

| Sentido | O que mede | Como |
|---|---|---|
| sensor → ecrã | publicação no ESP32 até chegada ao servidor | carimbo `sentAt` no JSON, comparado com a hora de chegada |
| clique → hardware | publicação do comando até o eco do dispositivo | cronometrado no servidor, com um só relógio |

O primeiro exige que o ESP32 tenha acertado a hora por NTP; o firmware fá-lo no
arranque e diz no Serial Monitor se conseguiu. Se falhar, `sentAt` vem a zero e as
amostras desse sentido são descartadas em vez de produzirem números falsos.

O segundo é o mais fiável dos dois: como o cronómetro abre e fecha na mesma máquina,
não depende de sincronização nenhuma.

O botão *Medir 30 comandos* envia uma série de `ping` espaçados de 400 ms, mede o
caminho de comando sem tocar no atuador. *Exportar CSV* dá um ficheiro com uma linha
por amostra, pronto para tratar em folha de cálculo.

**O que não é medido:** a ida e volta completa (clique → hardware age → nova
telemetria confirma) inclui o intervalo de publicação de 1 s, que é uma escolha de
projeto e não latência de transporte. Somar as duas componentes acima dá o tempo de
transito real; o resto é cadência.

## API REST

| Método | Rota | Função |
|---|---|---|
| `GET` | `/api/health` | estado do servidor e da base de dados |
| `GET` | `/api/devices` | dispositivos e último valor conhecido |
| `GET` | `/api/readings?deviceId=&minutes=15&limit=500` | histórico |
| `POST` | `/api/devices/:id/command` | `{"command":"stirrer:on"}` |

Os comandos vindos do ambiente 3D não passam pelo REST: seguem por WebSocket direto
para o MQTT, para manter a latência dentro do objetivo dos 150 ms definido no
pré-projeto. O painel mostra a latência ponta-a-ponta medida — do clique até o hardware
confirmar o novo estado na telemetria seguinte.
