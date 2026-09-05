/*
 * Laboratorio Virtual - Nodo IoT (ESP32)
 * Diogo Alves | 2022259 | ISTEC Porto
 *
 * Tres familias de interface no mesmo nodo:
 *   pH      - leitura analogica pelo ADC (DFRobot, sem a biblioteca oficial)
 *   DHT22   - protocolo digital de um fio (temperatura e humidade do ar)
 *   BMP280  - barramento I2C (pressao atmosferica)
 * Publica telemetria por MQTT e recebe comandos do ambiente 3D.
 *
 * Bibliotecas: PubSubClient, DHT sensor library (Adafruit),
 *              Adafruit Unified Sensor, Adafruit BMP280 Library
 *
 * Placa: ESP32-S2-DevKitC-1
 *   - Gravar e ler o Serial pela porta marcada UART.
 *   - Se usares a porta USB nativa, liga "USB CDC On Boot" nas opcoes
 *     da placa, senao o Serial Monitor fica mudo.
 *   - Se a gravacao falhar: manter BOOT, carregar e largar RESET,
 *     largar BOOT, e gravar.
 *   - GPIO 1 e ADC1, que continua a funcionar com o Wi-Fi ligado.
 */

// Credenciais fora do controlo de versões: copiar secrets.example.h
// para secrets.h e preencher.
#include "secrets.h"

#include <WiFi.h>
#include <time.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <Wire.h>
#include <Adafruit_BMP280.h>

// ---------- Configuracao ----------
const char* WIFI_SSID = WIFI_SSID_VALUE;
const char* WIFI_PASS = WIFI_PASS_VALUE;

const char* MQTT_HOST = MQTT_HOST_VALUE;   // IP do broker (Mosquitto)
const uint16_t MQTT_PORT = 1883;
const char* MQTT_USER = MQTT_USER_VALUE;   // vazio = sem autenticacao
const char* MQTT_PASS = MQTT_PASS_VALUE;

const char* DEVICE_ID = "bancada-01";

// Servidor de hora. Sem um relogio comum ao PC nao e possivel medir
// latencia entre os dois: a diferenca de timestamps seria dominada pelo
// desvio dos relogios, nao pelo tempo de transito.
const char* NTP_SERVER = "pool.ntp.org";

// ---------- Pinos ----------
#define PH_PIN        1    // ADC1 - sonda de pH DFRobot
#define DHT_PIN       4    // DHT22 - temperatura e humidade do ar
#define DHT_TYPE      DHT22
#define ACTUATOR_PIN  5    // rele / LED (agitador magnetico)

#define SDA_PIN       8    // I2C do ESP32-S2 (BMP280)
#define SCL_PIN       9

// Leitura do ADC com a calibracao de fabrica gravada no chip.
// Desligada por omissao para manter os valores que ja estavam a dar.
// Ao ligar, os mV passam a ser reais e e PRECISO recalibrar os dois
// valores abaixo, porque a escala muda.
// #define USE_ADC_CALIBRATION

// ---------- Calibracao do pH ----------
// Mesmos valores do bloco que ja estava a funcionar:
//   ph = 7.0 - (voltage - 1990.0) * (3.0 / 675.0)
// Reescrito para os dois pontos de calibracao ficarem explicitos.
// Valores obtidos por calibracao de dois pontos (n=17 por tampao):
//   tampao 7,00 -> 1996,6 mV (sigma 4,59)
//   tampao 4,00 -> 2661,4 mV (sigma 15,03)
float PH_NEUTRAL_MV = 1996.6;          // mV lidos na solucao tampao pH 7,00
float PH_SLOPE_MV   = 221.59;          // mV por unidade de pH

const uint8_t  PH_SAMPLES     = 100;   // amostras por leitura
const uint16_t PUBLISH_MS     = 1000;  // intervalo de telemetria
const uint16_t DHT_MS         = 2200;  // o DHT22 nao aceita leituras mais rapidas

// ---------- Topicos ----------
char topicTelemetry[64];
char topicCommand[64];
char topicStatus[64];
char topicAck[64];

// Prototipos (necessarios em PlatformIO; o Arduino IDE gera-os sozinho)
void publishTelemetry();
float readPhVoltage();

WiFiClient net;
PubSubClient mqtt(net);
DHT dht(DHT_PIN, DHT_TYPE);
Adafruit_BMP280 bmp;
bool bmpReady = false;

bool actuatorOn = false;
float lastVoltage = 0.0;
float lastPh = 7.0;
float lastTemp = NAN;
float lastHumidity = NAN;
float lastPressure = NAN;
unsigned long lastPublish = 0;
unsigned long lastDht = 0;

// ---------- Leitura do pH ----------
// Mantem a media de 100 amostras, mas corre mqtt.loop() entre elas
// para que os comandos vindos do 3D nao fiquem a espera da amostragem.
float readPhVoltage() {
  long sum = 0;
  for (uint8_t i = 0; i < PH_SAMPLES; i++) {
#ifdef USE_ADC_CALIBRATION
    sum += analogReadMilliVolts(PH_PIN);
#else
    sum += analogRead(PH_PIN);
#endif
    mqtt.loop();
    delay(2);
  }
  float raw = sum / (float)PH_SAMPLES;

#ifdef USE_ADC_CALIBRATION
  return raw;                     // ja em mV reais
#else
  return raw * 3300.0 / 4095.0;   // escala nominal, linear mas nao absoluta
#endif
}

float voltageToPh(float mv) {
  return 7.0 - (mv - PH_NEUTRAL_MV) / PH_SLOPE_MV;
}

// ---------- Atuador ----------
void setActuator(bool on) {
  actuatorOn = on;
  digitalWrite(ACTUATOR_PIN, on ? HIGH : LOW);
  Serial.printf("[cmd] agitador -> %s\n", on ? "ON" : "OFF");
}

// ---------- Comandos recebidos ----------
// Payload em texto simples: "stirrer:on", "stirrer:off", "calibrate:7.00", "ping"
void onMessage(char* topic, byte* payload, unsigned int len) {
  String msg;
  msg.reserve(len);
  for (unsigned int i = 0; i < len; i++) msg += (char)payload[i];
  msg.trim();

  // Comando com marca de medicao: "<comando>#<id>". O eco imediato
  // fecha o cronometro do lado do servidor.
  int hash = msg.indexOf('#');
  String probeId = "";
  if (hash >= 0) {
    probeId = msg.substring(hash + 1);
    msg = msg.substring(0, hash);
  }

  if (probeId.length()) {
    char ack[96];
    snprintf(ack, sizeof(ack), "{\"probeId\":\"%s\",\"at\":%llu}",
             probeId.c_str(), epochMillis());
    mqtt.publish(topicAck, ack);
  }

  if (msg == "stirrer:on")  { setActuator(true);  publishTelemetry(); return; }
  if (msg == "stirrer:off") { setActuator(false); publishTelemetry(); return; }
  if (msg == "ping")        { publishTelemetry(); return; }

  // Calibracao a 1 ponto: assume que a sonda esta no tampao indicado
  if (msg.startsWith("calibrate:")) {
    float buffer = msg.substring(10).toFloat();
    if (buffer > 0.0 && buffer < 14.0) {
      float mv = readPhVoltage();
      PH_NEUTRAL_MV = mv + (buffer - 7.0) * PH_SLOPE_MV;
      Serial.printf("[cal] tampao %.2f -> PH_NEUTRAL_MV = %.1f mV\n", buffer, PH_NEUTRAL_MV);
      publishTelemetry();
    }
    return;
  }

  Serial.printf("[cmd] desconhecido: %s\n", msg.c_str());
}

// Instante atual em milissegundos desde a epoch, ou 0 se a hora ainda
// nao foi sincronizada.
uint64_t epochMillis() {
  struct timeval tv;
  gettimeofday(&tv, NULL);
  if (tv.tv_sec < 1700000000) return 0;   // relogio ainda nao acertado
  return (uint64_t)tv.tv_sec * 1000ULL + tv.tv_usec / 1000ULL;
}

// ---------- Telemetria ----------
void publishTelemetry() {
  // JSON nao tem NaN: um valor em falta viaja como null.
  char tempField[16], humField[16], presField[16];
  if (isnan(lastTemp)) strcpy(tempField, "null");
  else snprintf(tempField, sizeof(tempField), "%.2f", lastTemp);
  if (isnan(lastHumidity)) strcpy(humField, "null");
  else snprintf(humField, sizeof(humField), "%.1f", lastHumidity);
  if (isnan(lastPressure)) strcpy(presField, "null");
  else snprintf(presField, sizeof(presField), "%.2f", lastPressure);

  // sentAt e o carimbo de saida: o servidor compara-o com o instante de
  // chegada para obter a latencia do troco dispositivo -> servidor.
  char payload[352];
  snprintf(payload, sizeof(payload),
    "{\"deviceId\":\"%s\",\"ph\":%.2f,\"voltage\":%.1f,"
    "\"temperature\":%s,\"humidity\":%s,\"pressure\":%s,"
    "\"stirrer\":%s,\"uptime\":%lu,\"sentAt\":%llu}",
    DEVICE_ID, lastPh, lastVoltage, tempField, humField, presField,
    actuatorOn ? "true" : "false", millis(), epochMillis());

  mqtt.publish(topicTelemetry, payload);
}

// ---------- Ligacoes ----------
void connectWifi() {
  Serial.printf("[wifi] a ligar a %s", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) { delay(400); Serial.print("."); }
  Serial.printf("\n[wifi] ligado, IP %s\n", WiFi.localIP().toString().c_str());
}

void connectMqtt() {
  while (!mqtt.connected()) {
    Serial.print("[mqtt] a ligar ao broker...");
    bool ok = mqtt.connect(DEVICE_ID, MQTT_USER, MQTT_PASS,
                           topicStatus, 1, true, "offline");
    if (ok) {
      Serial.println(" ligado");
      mqtt.publish(topicStatus, "online", true);
      mqtt.subscribe(topicCommand, 1);
    } else {
      Serial.printf(" falhou (rc=%d), nova tentativa em 3s\n", mqtt.state());
      delay(3000);
    }
  }
}

void setup() {
  Serial.begin(115200);

  pinMode(ACTUATOR_PIN, OUTPUT);
  digitalWrite(ACTUATOR_PIN, LOW);

  analogReadResolution(12);
  analogSetPinAttenuation(PH_PIN, ADC_11db);

  dht.begin();

  // O endereco do BMP280 depende do modulo: 0x76 nos modulos genericos,
  // 0x77 nos da Adafruit. Tenta os dois em vez de obrigar a configurar.
  Wire.begin(SDA_PIN, SCL_PIN);
  bmpReady = bmp.begin(0x76) || bmp.begin(0x77);
  if (bmpReady) {
    bmp.setSampling(Adafruit_BMP280::MODE_NORMAL,
                    Adafruit_BMP280::SAMPLING_X2,   // temperatura
                    Adafruit_BMP280::SAMPLING_X16,  // pressao
                    Adafruit_BMP280::FILTER_X16,
                    Adafruit_BMP280::STANDBY_MS_500);
    Serial.println("[bmp] BMP280 detetado");
  } else {
    Serial.println("[bmp] BMP280 NAO detetado - verificar ligacoes I2C");
  }

  snprintf(topicTelemetry, sizeof(topicTelemetry), "lab/%s/telemetry", DEVICE_ID);
  snprintf(topicCommand,   sizeof(topicCommand),   "lab/%s/command",   DEVICE_ID);
  snprintf(topicStatus,    sizeof(topicStatus),    "lab/%s/status",    DEVICE_ID);
  snprintf(topicAck,       sizeof(topicAck),       "lab/%s/ack",       DEVICE_ID);

  connectWifi();

  configTime(0, 0, NTP_SERVER);
  Serial.print("[ntp] a sincronizar a hora");
  for (int i = 0; i < 40 && epochMillis() == 0; i++) { delay(250); Serial.print("."); }
  Serial.println(epochMillis() ? " ok" : " falhou (latencia nao sera medida)");

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMessage);
  mqtt.setKeepAlive(15);
  connectMqtt();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) connectWifi();
  if (!mqtt.connected()) connectMqtt();
  mqtt.loop();

  lastVoltage = readPhVoltage();
  lastPh = voltageToPh(lastVoltage);

  // O DHT22 devolve lixo se for lido com demasiada frequencia, por isso
  // tem cadencia propria, mais lenta do que a do pH.
  if (bmpReady) lastPressure = bmp.readPressure() / 100.0;   // hPa

  if (millis() - lastDht >= DHT_MS) {
    lastDht = millis();
    float t = dht.readTemperature();
    float h = dht.readHumidity();
    if (!isnan(t)) lastTemp = t;
    if (!isnan(h)) lastHumidity = h;
  }

  if (millis() - lastPublish >= PUBLISH_MS) {
    lastPublish = millis();
    publishTelemetry();
    Serial.printf("V: %.1f mV | pH: %.2f | T: %.1f C | HR: %.1f %% | P: %.1f hPa\n",
                  lastVoltage, lastPh, lastTemp, lastHumidity, lastPressure);
  }
}
