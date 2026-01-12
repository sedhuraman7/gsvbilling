# ⚡ Dual MCU Setup Guide (Arduino + ESP32/8266)

This guide explains how to use **Arduino** for heavy sensor calculations and **ESP32/ESP8266** strictly for WiFi/Firebase communication. This architecture is stable and robust.

---

## 🛠️ Connection Architecture

1.  **Arduino UNO/Nano**:
    *   Connects to Sensors (ZMPT101B, SCT013).
    *   Calculates RMS Voltage, Current, Power, Energy.
    *   Sends processed data (JSON string) to ESP via Serial (UART).

2.  **ESP32 / ESP8266 (NodeMCU)**:
    *   Receives data from Arduino.
    *   Connects to WiFi.
    *   Uploads data to `Firebase Realtime Database`.

---

## 🔌 Wiring Diagram

### Power
*   **Arduino & ESP** should share a **COMMON GROUND (GND)**. Important!

### Serial Communication (UART)
| Arduino Pin | ESP32/8266 Pin | Note |
| :--- | :--- | :--- |
| **TX (Pin 1)** or SoftSerial TX | **RX** (GPIO 16 / D7) | Arduino sends -> ESP Receives |
| **RX (Pin 0)** or SoftSerial RX | **TX** (GPIO 17 / D8) | ESP sends -> Arduino Receives (Optional) |
| **GND** | **GND** | **MUST BE CONNECTED** |

**⚠️ Important for ESP8266:** Arduino logic is 5V, ESP is 3.3V. It is recommended (but often works without) to use a **Voltage Divider** on the Arduino TX -> ESP RX line (2kΩ + 1kΩ resistors) to protect the ESP.

---

## 📜 1. Arduino Code (Sensor Node)

This code runs on the **Arduino**. It reads sensors and sends JSON string every 2 seconds.

```cpp
#include <ArduinoJson.h> // Install "ArduinoJson" library by Benoit Blanchon
// Include EmonLib or your custom sensor logic here
// #include "EmonLib.h" 

// Setup SoftwareSerial if using UNO (Pins 2, 3)
// #include <SoftwareSerial.h>
// SoftwareSerial espSerial(2, 3); // RX, TX

float voltage = 230.0;
float current = 0.0;
float power = 0.0;
float energy = 0.0;

void setup() {
  Serial.begin(9600); // For Debugging on PC
  // espSerial.begin(9600); // For communicating with ESP
  
  // Create a separate Hardware Serial for ESP if using Mega/STM32
  // Or just use Serial if you disconnect USB while running
}

void loop() {
  // 1. READ SENSORS (Replace with actual sensor code)
  // voltage = emon1.calcIrms(...)
  current = random(1, 150) / 10.0; // Mock Data
  power = voltage * current;
  energy += (power / 1000.0) * (2.0 / 3600.0); // kWh accumulation

  // 2. PREPARE JSON
  StaticJsonDocument<200> doc;
  doc["v"] = voltage;
  doc["c"] = current;
  doc["p"] = power;
  doc["kwh"] = energy;
  doc["m"] = "ON"; // Motor Status

  // 3. SEND TO ESP
  // Send as a single line
  serializeJson(doc, Serial); 
  Serial.println(); // Newline is the delimiter

  // If using SoftwareSerial:
  // serializeJson(doc, espSerial);
  // espSerial.println();

  delay(2000); // Send every 2 seconds
}
```

---

## 📡 2. ESP32 / ESP8266 Code (WiFi Bridge)

This code runs on the **ESP**. It blindly accepts JSON from Serial and pushes to Firebase.

```cpp
#include <Arduino.h>
#if defined(ESP32)
  #include <WiFi.h>
#elif defined(ESP8266)
  #include <ESP8266WiFi.h>
#endif
#include <Firebase_ESP_Client.h> // Install "Firebase Arduino Client Library" by Mobizt
#include <ArduinoJson.h>

// 1. CREDENTIALS
#define WIFI_SSID "YOUR_HOME_WIFI_NAME"        // <-- Enter your WiFi Name
#define WIFI_PASSWORD "YOUR_HOME_WIFI_PASSWORD" // <-- Enter your WiFi Password

// Firebase Credentials (Extraction from your main.cpp)
#define API_KEY "AIzaSyCKTC_lcN-4YMtIwr-kWMzgRU7i379-BTg"
#define DATABASE_URL "https://smart-billing-system-5c276-default-rtdb.firebaseio.com/" 


// 2. FIREBASE OBJECTS
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;
bool signupOK = false;

// 3. SERIAL SETUP
// On ESP32, uses Serial2 (GPIO 16=RX, 17=TX) by default
#define RXD2 16
#define TXD2 17

void setup() {
  Serial.begin(115200); // Debug
  
  // Setup UART for receiving from Arduino
  #if defined(ESP32)
    Serial2.begin(9600, SERIAL_8N1, RXD2, TXD2);
  #elif defined(ESP8266)
    // ESP8266 typically uses SoftwareSerial for extra ports or just standard Serial if careful
    // Serial.swap(); // Allows using alternate pins if needed
  #endif

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    Serial.print("."); delay(300);
  }
  Serial.println("\nConnected to WiFi");
  
  config.api_key = API_KEY;
  config.database_url = DATABASE_URL;
  if (Firebase.signUp(&config, &auth, "", "")) signupOK = true;
  Firebase.begin(&config, &auth);
}

void loop() {
  // Check if data available from Arduino (Serial2)
  if (Serial2.available()) {
    String data = Serial2.readStringUntil('\n'); // Read until newline
    
    // Parse JSON
    StaticJsonDocument<200> doc;
    DeserializationError error = deserializeJson(doc, data);

    if (!error) {
       float v = doc["v"];
       float c = doc["c"];
       float kwh = doc["kwh"];
       
       if (signupOK) {
         // Push to Firebase
         // Replace "HOUSE_001" with your House ID
         Firebase.RTDB.setFloat(&fbdo, "houses/GSV07/system_status/voltage", v);
         Firebase.RTDB.setFloat(&fbdo, "houses/GSV07/system_status/current", c);
         Firebase.RTDB.setFloat(&fbdo, "houses/GSV07/system_status/energy_kwh", kwh);
         
         Serial.println("Data Sent to Firebase: " + data);
       }
    } else {
      Serial.println("JSON Parse Error");
    }
  }
}
```

## 📋 Checklist for Tomorrow
1.  **Components:** Arduino, ESP32/8266, Jumper Wires.
2.  **Libraries:** 
    *   Arduino IDE -> Sketch -> Include Library -> Manage Libraries.
    *   Search & Install: `ArduinoJson`, `Firebase Arduino Client Library for ESP8266 and ESP32`.
3.  **House ID:** Make sure the ESP code uses the correct House ID (e.g., `GSV07`) matching your Web Dashboard.

Hope this helps! 🚀
