
# 🛠️ Hardware Setup Guide: Smart Meter Billing System

This guide explains how to wire and setup the hardware using the specific firmware files provided in this project.

## 📁 Firmware Files
1.  **Master Node (Arduino):** `firmware/arduino_main.ino`
    *   Handles: LCD Display, Voltage/Current Sensors, Relays, RTC, Buttons.
2.  **Bridge Node (ESP32):** `firmware/esp32_bridge.ino`
    *   Handles: WiFi Connection, Firebase Database Upload.

---

## 🔌 Wiring Diagram

### 1. Inter-Board Connection (The "Bridge")
This connects Arduino to ESP32 so data can be sent to the internet.

| Arduino Pin | ESP32 Pin | Purpose |
| :--- | :--- | :--- |
| **TX (Pin 1)** | **GPIO 16 (RX2)** | Arduino sends data to ESP32 |
| **RX (Pin 0)** | **GPIO 17 (TX2)** | ESP32 sends commands to Arduino |
| **GND** | **GND** | **CRITICAL:** Common Ground is required |

> **⚠️ WARNING:** Disconnect `TX` and `RX` wires from Arduino while uploading code! Reconnect after upload is finished.

---

### 2. Sensor Connections (To Arduino)

| Component | Arduino Pin | Notes |
| :--- | :--- | :--- |
| **Voltage Sensor (ZMPT101B)** | **A0** | Tune the potentiometer on module for calibration |
| **Current Sensor (CT/SCT-013)** | **A1** | Requires burden resistor circuit if using raw CT |
| **RTC (DS1307)** | **SDA (A4), SCL (A5)** | Or dedicated SDA/SCL pins on UNO R3 |

---

### 3. Output Connections (To Arduino)

| Component | Arduino Pin | Notes |
| :--- | :--- | :--- |
| **Relay 1 (Main/Motor)** | **Pin 8** | Controls heavy load |
| **Relay 2 (Aux/Light)** | **Pin 9** | Controls secondary load |
| **LCD (16x2)** | **10, 11, 12, 7, A2, A3** | RS, EN, D4, D5, D6, D7 |

---

### 4. Button Connections (To Arduino)
| Button | Arduino Pin | Type |
| :--- | :--- | :--- |
| **Menu** | **Pin 2** | Pull-up (Connect other side to GND) |
| **Down** | **Pin 3** | Pull-up |
| **Up** | **Pin 4** | Pull-up |
| **Select** | **Pin 5** | Pull-up |

---

## 🚀 Setup Steps

### Step 1: Prepare Libraries
Install these libraries in your Arduino IDE:
1.  **EmonLib** (For energy monitoring)
2.  **RTClib** (For DS1307 Time)
3.  **LiquidCrystal** (Standard LCD)
4.  **Firebase Arduino Client Library for ESP8266 and ESP32** (By Mobizt)
5.  **ArduinoJson**

### Step 2: Configure ESP32 Code
Open `firmware/esp32_bridge.ino` and **EDIT** lines 6-13:
```cpp
#define WIFI_SSID "YOUR_WIFI_NAME"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"
#define API_KEY "..."     // From Firebase Console
#define DATABASE_URL "..." // From Firebase Console
#define HOUSE_ID "GSV01"  // This must match your Admin Dashboard
```

### Step 3: Upload Code
1.  **Arduino:** Upload `arduino_main.ino`. (Ensure TX/RX disconnected).
2.  **ESP32:** Upload `esp32_bridge.ino`.

### Step 4: Verify
1.  Power everything ON.
2.  LCD should show "BOOTING...".
3.  ESP32 Serial Monitor (115200 baud) should say:
    *   `Connecting to WiFi...`
    *   `Firebase Auth Success`
    *   `Received from Arduino: {"v":230...`
4.  Open **Web App Admin Dashboard**: The "Online" indicator should turn **Green**.

---

## ❓ Troubleshooting
*   **LCD Blank?** Adjust Contrast Potentiometer.
*   **No Data on Web?** Check ESP32 Serial Monitor. If it says "Firebase Error", check API Key/URL.
*   **Values are Wrong?** Adjust calibration constants `ICAL`, `A_CAL`, `B_CAL` in `arduino_main.ino`.
