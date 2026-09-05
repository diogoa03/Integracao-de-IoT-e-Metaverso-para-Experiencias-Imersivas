// Credenciais do nó IoT.
//
// Copiar este ficheiro para "secrets.h" e preencher com os valores reais.
// O secrets.h está no .gitignore e nunca deve ser versionado.

#pragma once

#define WIFI_SSID_VALUE  "nome-da-rede"
#define WIFI_PASS_VALUE  "password-da-rede"

// IP da máquina onde corre o broker Mosquitto, na mesma rede do ESP32.
// Nunca "localhost": para o ESP32, localhost é ele próprio.
#define MQTT_HOST_VALUE  "192.168.1.100"
#define MQTT_USER_VALUE  ""
#define MQTT_PASS_VALUE  ""
