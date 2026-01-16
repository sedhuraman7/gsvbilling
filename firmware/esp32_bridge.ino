#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>
#include <FirebaseESP32.h>
// #include <addons/TokenHelper.h> // Not needed for Legacy Auth
#include <ArduinoJson.h>

// ================= CONFIGURATION =================
// WiFi Credentials
String WIFI_SSID = "";
String WIFI_PASSWORD = "";

// AP Mode Credentials
// AP Mode Credentials
const char* apSSID = "gsv_billing";
const char* apPassword = "";

// Firebase Configuration - REPLACE WITH YOUR OWN!
// Firebase Configuration
#define FIREBASE_HOST "smart-billing-system-5c276-default-rtdb.firebaseio.com"
// IMPORTANT: Use your database SECRET here, NOT the API Key! 
// Go to Project Settings > Service Accounts > Database Secrets
#define FIREBASE_AUTH "AIzaSyCKTC_lcN-4YMtIwr-kWMzgRU7i379-BTg"

// Device Info
String deviceId;
String houseId = "NOT_REGISTERED";

// Meter rotation
int currentMeter = 1;
unsigned long lastMeterRotation = 0;
const unsigned long METER_INTERVAL = 2592000000UL; // 30 days

// ================= GLOBAL OBJECTS =================
FirebaseData firebaseData;
FirebaseAuth auth;
FirebaseConfig config;
WebServer server(80);
DNSServer dnsServer;
Preferences preferences;

// Communication with Arduino
String incomingData = "";
unsigned long lastFirebaseUpdate = 0;
unsigned long lastRegistrationCheck = 0;
const unsigned long FIREBASE_INTERVAL = 5000;
const unsigned long REGISTRATION_INTERVAL = 10000;

// Data from Arduino
float voltage = 0;
float current = 0;
float power = 0;
float energy = 0;
bool motorRunning = false;
int systemState = 0;
int currentMode = 0;
bool relay1 = false;
bool relay2 = false;

// Energy tracking
float energyToday = 0;
float energyMonth = 0;
unsigned long lastDayReset = 0;
unsigned long lastMonthReset = 0;

// System variables
unsigned long startTime;
bool wifiConnected = false;
bool portalActive = false;
bool firebaseInitialized = false;

// ================= SETUP =================
void setup() {
  Serial.begin(115200);
  Serial2.begin(9600, SERIAL_8N1, 16, 17); // RX=16, TX=17
  delay(2000); // Give time for serial monitor
  
  Serial.println("\n\n====================================");
  Serial.println("    SMART BILLING SYSTEM v2.0");
  Serial.println("====================================\n");
  
  // Get device ID from MAC address
  getDeviceID();
  
  // Load saved WiFi credentials
  loadWiFiConfig();
  
  // Start AP mode always
  startAP();
  
  // Setup web server
  setupWebServer();
  
  // Try to connect to WiFi if credentials exist
  if (WIFI_SSID != "") {
    connectToWiFi();
  }
  
  // Initialize Firebase if WiFi is connected
  if (WiFi.status() == WL_CONNECTED) {
    setupFirebase();
  }
  
  startTime = millis();
  Serial.println("\n✅ Setup Complete!");
  Serial.println("====================================\n");
}

// ================= MAIN LOOP =================
void loop() {
  // Handle DNS requests (captive portal)
  dnsServer.processNextRequest();
  
  // Handle web requests
  server.handleClient();
  
  // Read data from Arduino
  readFromArduino();
  
  // Check date change for energy reset
  checkDateChange();
  
  // Send to Firebase periodically
  static unsigned long lastFirebaseSend = 0;
  if (millis() - lastFirebaseSend > FIREBASE_INTERVAL) {
    if (WiFi.status() == WL_CONNECTED && houseId != "NOT_REGISTERED" && firebaseInitialized) {
      sendToFirebase();
    }
    lastFirebaseSend = millis();
  }
  
  // Check meter rotation
  checkMeterRotation();
  
  // Check Firebase commands
  if (firebaseInitialized && houseId != "NOT_REGISTERED") {
    checkFirebaseCommands();
  }
  
  // Check registration periodically if not registered
  static unsigned long lastRegCheck = 0;
  if (houseId == "NOT_REGISTERED" && millis() - lastRegCheck > REGISTRATION_INTERVAL) {
    if (WiFi.status() == WL_CONNECTED && firebaseInitialized) {
      checkRegistration();
    }
    lastRegCheck = millis();
  }
  
  // Monitor WiFi connection
  static unsigned long lastWiFiCheck = 0;
  if (millis() - lastWiFiCheck > 10000) { // Every 10 seconds
    if (WiFi.status() != WL_CONNECTED && wifiConnected) {
      Serial.println("WiFi disconnected! Checking status...");
      wifiConnected = false;
      // Don't auto-reconnect immediately, wait for manual intervention
    } else if (WiFi.status() == WL_CONNECTED && !wifiConnected) {
      wifiConnected = true;
      Serial.println("WiFi reconnected!");
    }
    lastWiFiCheck = millis();
  }
  
  delay(10); // Small delay for stability
}

// ================= SYSTEM FUNCTIONS =================

void getDeviceID() {
  // Method 1: Use WiFi.macAddress() - Most reliable
  String mac = WiFi.macAddress();
  
  if (mac == "00:00:00:00:00:00" || mac == "FF:FF:FF:FF:FF:FF") {
    // Method 2: Use ESP.getEfuseMac()
    uint64_t chipId = ESP.getEfuseMac();
    char chipIdStr[13];
    snprintf(chipIdStr, sizeof(chipIdStr), "%04X%08X", 
             (uint16_t)(chipId >> 32), (uint32_t)chipId);
    deviceId = String(chipIdStr);
    
    Serial.print("Using Chip ID: ");
    Serial.println(deviceId);
  } else {
    deviceId = mac;
    deviceId.replace(":", "");
    Serial.print("Using MAC Address: ");
    Serial.println(deviceId);
  }
  
  // Also log the full MAC for debugging
  Serial.print("Full MAC: ");
  Serial.println(WiFi.macAddress());
  Serial.print("Chip ID (hex): 0x");
  Serial.println(ESP.getEfuseMac(), HEX);
  Serial.print("Chip Model: ");
  Serial.println(ESP.getChipModel());
  Serial.print("Chip Revision: ");
  Serial.println(ESP.getChipRevision());
}

void loadWiFiConfig() {
  preferences.begin("wifi-config", true); // Read-only mode
  WIFI_SSID = preferences.getString("ssid", "");
  WIFI_PASSWORD = preferences.getString("pass", "");
  preferences.end();
  
  Serial.print("Saved WiFi: ");
  if (WIFI_SSID == "") {
    Serial.println("None");
    portalActive = true;
  } else {
    Serial.println(WIFI_SSID);
  }
}

void startAP() {
  Serial.println("\nStarting Access Point...");
  
  // Generate unique AP name with last 4 chars of MAC
  String apName = String(apSSID);
  if (deviceId.length() >= 4) {
    apName += "-" + deviceId.substring(deviceId.length() - 4);
  }
  
  WiFi.softAP(apName.c_str(), apPassword);
  delay(100);
  
  Serial.print("AP SSID: ");
  Serial.println(apName);
  Serial.print("AP IP: ");
  Serial.println(WiFi.softAPIP());
  Serial.print("AP Password: ");
  Serial.println(apPassword);
  
  // Start DNS server for captive portal
  dnsServer.start(53, "*", WiFi.softAPIP());
  Serial.println("DNS server started (Captive Portal)");
}

void setupWebServer() {
  // Define routes
  server.on("/", HTTP_GET, handleRoot);
  server.on("/save", HTTP_POST, handleSave);
  server.on("/status", HTTP_GET, handleStatus);
  server.on("/reset", HTTP_GET, handleReset);
  server.on("/scan", HTTP_GET, handleScan);
  server.on("/data", HTTP_GET, handleData);
  server.on("/config", HTTP_GET, handleConfig);
  
  // Captive portal redirect
  server.onNotFound([]() {
    if (!isIp(server.hostHeader())) {
      server.sendHeader("Location", String("http://") + server.client().localIP().toString(), true);
      server.send(302, "text/plain", "");
    } else {
      server.send(404, "text/plain", "Page Not Found");
    }
  });
  
  server.begin();
  Serial.println("Web server started on port 80");
}

bool isIp(String str) {
  for (size_t i = 0; i < str.length(); i++) {
    int c = str.charAt(i);
    if (c != '.' && (c < '0' || c > '9')) {
      return false;
    }
  }
  return true;
}

// ================= UPDATED WiFi CONNECTION FUNCTION =================
void connectToWiFi() {
  Serial.print("\nConnecting to WiFi: ");
  Serial.println(WIFI_SSID);
  
  // Step 1: Disable AP temporarily for better STA connection
  WiFi.softAPdisconnect(true);
  delay(100);
  
  // Step 2: Set to STA mode only
  WiFi.mode(WIFI_STA);
  delay(100);
  
  // Step 3: Disconnect any existing connection
  WiFi.disconnect(true);
  delay(1000);
  
  // Step 4: Begin connection
  WiFi.begin(WIFI_SSID.c_str(), WIFI_PASSWORD.c_str());
  
  Serial.print("Connecting");
  int attempts = 0;
  bool connected = false;
  
  // Try for 20 seconds
  while (attempts < 40) {
    delay(500);
    Serial.print(".");
    attempts++;
    
    wl_status_t status = WiFi.status();
    if (status == WL_CONNECTED) {
      connected = true;
      break;
    } else if (status == WL_NO_SSID_AVAIL) {
      Serial.println("\nSSID not found!");
      break;
    } else if (status == WL_CONNECT_FAILED) {
      Serial.println("\nConnection failed - wrong password?");
      break;
    }
  }
  
  if (connected) {
    wifiConnected = true;
    Serial.println("\n✅ WiFi Connected Successfully!");
    
    Serial.print("SSID: ");
    Serial.println(WiFi.SSID());
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
    Serial.print("Signal Strength (RSSI): ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");
    
    // Step 5: Re-enable AP mode alongside STA
    WiFi.mode(WIFI_AP_STA);
    delay(100);
    
    // Restart AP
    String apName = String(apSSID);
    if (deviceId.length() >= 4) {
      apName += "-" + deviceId.substring(deviceId.length() - 4);
    }
    WiFi.softAP(apName.c_str(), apPassword);
    
    // Setup Firebase if not already initialized
    if (!firebaseInitialized) {
      setupFirebase();
    }
    
  } else {
    Serial.println("\n❌ WiFi Connection Failed!");
    
    // Fall back to AP mode only for configuration
    WiFi.mode(WIFI_AP);
    delay(100);
    
    String apName = String(apSSID);
    if (deviceId.length() >= 4) {
      apName += "-" + deviceId.substring(deviceId.length() - 4);
    }
    WiFi.softAP(apName.c_str(), apPassword);
    
    wifiConnected = false;
    portalActive = true;
    Serial.println("AP mode active for configuration");
  }
}

void setupFirebase() {
  Serial.println("\nInitializing Firebase (Legacy Mode)...");

  // 1. Configuration - Ref: User's Example
  config.database_url = FIREBASE_HOST; // No https:// prefix needed usually
  config.host = FIREBASE_HOST; // For some library versions
  config.signer.tokens.legacy_token = FIREBASE_AUTH; // Use Database Secret
  
  // 2. Timeout Settings (From your reference code)
  config.timeout.serverResponse = 10 * 1000;
  config.timeout.wifiReconnect = 10 * 1000;
  config.timeout.socketConnection = 10 * 1000;
  config.timeout.sslHandshake = 20 * 1000;

  // 3. Buffer Settings
  firebaseData.setBSSLBufferSize(4096, 1024);
  firebaseData.setResponseSize(2048);

  // 4. Initialize
  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
  
  Serial.println("✅ Firebase Initialized with Legacy Token");
  Serial.println("Make sure FIREBASE_AUTH is your Database Secret (starts with 0K...), NOT API Key!");
  
  firebaseInitialized = true;
  checkRegistration();
}

// ================= ARDUINO COMMUNICATION =================

void readFromArduino() {
  while (Serial2.available()) {
    char c = Serial2.read();
    
    if (c == '\n') {
      processArduinoData();
      incomingData = "";
    } else if (c != '\r') {
      incomingData += c;
    }
  }
}

void processArduinoData() {
  if (incomingData.length() == 0) return;
  
  // Log raw data for debugging
  Serial.print("Raw Arduino Data: ");
  Serial.println(incomingData);
  
  StaticJsonDocument<300> doc;
  DeserializationError error = deserializeJson(doc, incomingData);
  
  if (error) {
    Serial.print("JSON Parse Error: ");
    Serial.println(error.c_str());
    Serial.print("Data: ");
    Serial.println(incomingData);
    return;
  }
  
  // Extract data with defaults
  voltage = doc["voltage"] | 0.0;
  current = doc["current"] | 0.0;
  power = doc["power"] | 0.0;
  energy = doc["energy"] | 0.0;
  
  String motorState = doc["motor_state"] | "OFF";
  motorRunning = (motorState == "ON");
  
  relay1 = doc["relay1"] | false;
  relay2 = doc["relay2"] | false;
  systemState = doc["system_state"] | 0;
  currentMode = doc["mode"] | 0;
  
  // Update energy tracking
  energyToday = energy;
  energyMonth = energy;
  
  // Log parsed data
  Serial.print("Parsed - V: ");
  Serial.print(voltage);
  Serial.print("V, I: ");
  Serial.print(current);
  Serial.print("A, P: ");
  Serial.print(power);
  Serial.print("W, Motor: ");
  Serial.println(motorState);
}

// ================= ENERGY MANAGEMENT =================

void checkDateChange() {
  // Simple day tracking based on millis()
  unsigned long currentMillis = millis();
  unsigned long days = currentMillis / 86400000UL;
  
  if (days != lastDayReset) {
    energyToday = 0;
    lastDayReset = days;
    Serial.println("New day - daily energy reset");
  }
  
  // Month tracking (30 days)
  if (currentMillis - lastMonthReset > 2592000000UL) {
    energyMonth = 0;
    lastMonthReset = currentMillis;
    Serial.println("New month - monthly energy reset");
  }
}

void checkMeterRotation() {
  if (millis() - lastMeterRotation > METER_INTERVAL) {
    currentMeter = (currentMeter % 3) + 1;
    lastMeterRotation = millis();
    
    sendEvent("meter_rotated", "Auto-rotated to Meter " + String(currentMeter));
    
    Serial.print("Meter rotated to: ");
    Serial.println(currentMeter);
  }
}

// ================= FIREBASE FUNCTIONS =================

void sendToFirebase() {
  if (!firebaseInitialized || houseId == "NOT_REGISTERED") return;
  
  FirebaseJson json;
  
  // Basic readings
  json.set("voltage", voltage);
  json.set("current", current);
  json.set("power", power);
  json.set("energy_today", energyToday);
  json.set("energy_month", energyMonth);
  json.set("total_energy", energy);
  json.set("motor_running", motorRunning);
  json.set("relay1", relay1);
  json.set("relay2", relay2);
  json.set("system_state", systemState);
  json.set("mode", currentMode);
  json.set("current_meter", currentMeter);
  json.set("wifi_strength", WiFi.RSSI());
  json.set("timestamp", millis() / 1000); // Unix timestamp in seconds
  
  // Send to realtime path
  String path = "/houses/" + houseId + "/realtime";
  if (Firebase.setJSON(firebaseData, path, json)) {
    Serial.println("✅ Data sent to Firebase");
  } else {
    Serial.print("Firebase Error: ");
    Serial.println(firebaseData.errorReason());
  }
}

void checkRegistration() {
  if (!firebaseInitialized) return;
  
  String path = "/devices/" + deviceId;
  Serial.print("Checking registration for device: ");
  Serial.println(deviceId);
  
  if (Firebase.getString(firebaseData, path + "/houseId")) {
    String fetchedId = firebaseData.stringData();
    if (fetchedId.length() > 0 && fetchedId != "null" && fetchedId != "NOT_REGISTERED") {
      houseId = fetchedId;
      Serial.print("✅ Registered to house: ");
      Serial.println(houseId);
      
      // Update device status
      FirebaseJson update;
      update.set("status", "active");
      update.set("last_seen", millis() / 1000);
      update.set("ip", WiFi.localIP().toString());
      Firebase.updateNode(firebaseData, path, update);
    }
  } else {
    // Create device entry if it doesn't exist
    Serial.println("Creating device entry in Firebase...");
    
    FirebaseJson deviceInfo;
    deviceInfo.set("mac", deviceId);
    deviceInfo.set("houseId", "NOT_REGISTERED");
    deviceInfo.set("status", "waiting");
    deviceInfo.set("ip", WiFi.localIP().toString());
    deviceInfo.set("created_at", millis() / 1000);
    deviceInfo.set("last_seen", millis() / 1000);
    
    Firebase.setJSON(firebaseData, path, deviceInfo);
  }
}

void checkFirebaseCommands() {
  if (!firebaseInitialized || houseId == "NOT_REGISTERED") return;
  
  String path = "/houses/" + houseId + "/commands";
  
  if (Firebase.getString(firebaseData, path)) {
    String command = firebaseData.stringData();
    
    if (command.length() > 0 && command != "null") {
      Serial.print("Command received: ");
      Serial.println(command);
      
      // Send command to Arduino
      Serial2.println(command);
      
      // Clear command
      Firebase.setString(firebaseData, path, "");
    }
  }
}

void sendEvent(String eventType, String message) {
  if (!firebaseInitialized || houseId == "NOT_REGISTERED") return;
  
  FirebaseJson event;
  event.set("type", eventType);
  event.set("message", message);
  event.set("timestamp", millis() / 1000);
  event.set("meter", currentMeter);
  
  String path = "/houses/" + houseId + "/events";
  Firebase.pushJSON(firebaseData, path, event);
}

// ================= WEB SERVER HANDLERS =================
// NO CHANGES TO HTML CODE BELOW - EXACTLY AS BEFORE

void handleRoot() {
  String html = R"rawliteral(
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Smart Meter Setup</title>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        .container {
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            overflow: hidden;
            width: 100%;
            max-width: 500px;
            animation: fadeIn 0.5s ease;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .header {
            background: linear-gradient(to right, #4facfe 0%, #00f2fe 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        .header h1 {
            font-size: 28px;
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
        }
        .header h1 i {
            font-size: 32px;
        }
        .content {
            padding: 30px;
        }
        .status-box {
            background: #f8f9fa;
            border-radius: 10px;
            padding: 20px;
            margin-bottom: 25px;
            border-left: 4px solid #4facfe;
        }
        .status-item {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
            padding-bottom: 8px;
            border-bottom: 1px solid #eaeaea;
        }
        .status-item:last-child {
            border-bottom: none;
            margin-bottom: 0;
        }
        .status-label {
            color: #666;
            font-weight: 500;
        }
        .status-value {
            font-weight: 600;
            color: #333;
        }
        .connected { color: #28a745 !important; }
        .disconnected { color: #dc3545 !important; }
        .form-group {
            margin-bottom: 20px;
        }
        .form-group label {
            display: block;
            margin-bottom: 8px;
            color: #555;
            font-weight: 500;
        }
        .form-input {
            width: 100%;
            padding: 14px;
            border: 2px solid #eaeaea;
            border-radius: 10px;
            font-size: 16px;
            transition: border-color 0.3s;
        }
        .form-input:focus {
            outline: none;
            border-color: #4facfe;
        }
        .btn {
            display: block;
            width: 100%;
            padding: 16px;
            border: none;
            border-radius: 10px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
            text-align: center;
            text-decoration: none;
            margin-bottom: 15px;
        }
        .btn-primary {
            background: linear-gradient(to right, #4facfe 0%, #00f2fe 100%);
            color: white;
        }
        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 20px rgba(79, 172, 254, 0.3);
        }
        .btn-secondary {
            background: #6c757d;
            color: white;
        }
        .btn-secondary:hover {
            background: #5a6268;
        }
        .btn-danger {
            background: #dc3545;
            color: white;
        }
        .btn-danger:hover {
            background: #c82333;
        }
        .btn-success {
            background: #28a745;
            color: white;
        }
        .btn-success:hover {
            background: #218838;
        }
        .network-list {
            max-height: 200px;
            overflow-y: auto;
            border: 1px solid #eaeaea;
            border-radius: 10px;
            padding: 10px;
            margin-top: 10px;
        }
        .network-item {
            padding: 12px;
            margin-bottom: 8px;
            background: #f8f9fa;
            border-radius: 8px;
            cursor: pointer;
            transition: background 0.3s;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .network-item:hover {
            background: #e9ecef;
        }
        .network-icon {
            font-size: 20px;
        }
        .network-info {
            flex-grow: 1;
        }
        .network-name {
            font-weight: 600;
            color: #333;
        }
        .network-rssi {
            font-size: 14px;
            color: #666;
        }
        .hidden {
            display: none;
        }
        .loading {
            text-align: center;
            padding: 20px;
            color: #666;
        }
        .current-data {
            background: #e8f4fd;
            border-radius: 10px;
            padding: 15px;
            margin-bottom: 20px;
        }
        .data-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
            margin-top: 10px;
        }
        .data-item {
            background: white;
            padding: 10px;
            border-radius: 8px;
            text-align: center;
        }
        .data-value {
            font-size: 24px;
            font-weight: bold;
            color: #4facfe;
        }
        .data-label {
            font-size: 12px;
            color: #666;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>⚡ Smart Meter Setup</h1>
            <p>Configure your smart billing system</p>
        </div>
        
        <div class="content">
            <div class="status-box">
                <div class="status-item">
                    <span class="status-label">Device ID:</span>
                    <span class="status-value">)rawliteral" + deviceId + R"rawliteral(</span>
                </div>
                <div class="status-item">
                    <span class="status-label">WiFi Status:</span>
                    <span class="status-value )rawliteral" + (WiFi.status() == WL_CONNECTED ? "connected" : "disconnected") + R"rawliteral(">
                        )rawliteral" + (WiFi.status() == WL_CONNECTED ? 
                        "Connected to " + WiFi.SSID() : "Disconnected") + R"rawliteral(
                    </span>
                </div>
                <div class="status-item">
                    <span class="status-label">AP IP:</span>
                    <span class="status-value">192.168.4.1</span>
                </div>
                <div class="status-item">
                    <span class="status-label">Uptime:</span>
                    <span class="status-value">)rawliteral" + String((millis() - startTime) / 1000) + R"rawliteral( seconds</span>
                </div>
                <div class="status-item">
                    <span class="status-label">Firebase:</span>
                    <span class="status-value )rawliteral" + (firebaseInitialized ? "connected" : "disconnected") + R"rawliteral(">
                        )rawliteral" + (firebaseInitialized ? "Connected" : "Disconnected") + R"rawliteral(
                    </span>
                </div>
                <div class="status-item">
                    <span class="status-label">House ID:</span>
                    <span class="status-value">)rawliteral" + houseId + R"rawliteral(</span>
                </div>
            </div>

            <div class="current-data" id="currentData">
                <h3 style="text-align: center; margin-bottom: 15px; color: #333;">📊 Current Readings</h3>
                <div class="data-grid">
                    <div class="data-item">
                        <div class="data-value" id="voltage">)rawliteral" + String(voltage, 1) + R"rawliteral(</div>
                        <div class="data-label">Voltage (V)</div>
                    </div>
                    <div class="data-item">
                        <div class="data-value" id="current">)rawliteral" + String(current, 2) + R"rawliteral(</div>
                        <div class="data-label">Current (A)</div>
                    </div>
                    <div class="data-item">
                        <div class="data-value" id="power">)rawliteral" + String(power, 1) + R"rawliteral(</div>
                        <div class="data-label">Power (W)</div>
                    </div>
                    <div class="data-item">
                        <div class="data-value" id="energy">)rawliteral" + String(energy, 1) + R"rawliteral(</div>
                        <div class="data-label">Energy (kWh)</div>
                    </div>
                </div>
            </div>

            <button class="btn btn-success" onclick="scanNetworks()">
                📶 Scan WiFi Networks
            </button>
            
            <div class="network-list hidden" id="networkList">
                <div class="loading">Scanning networks...</div>
            </div>

            <form id="wifiForm" action="/save" method="POST">
                <div class="form-group">
                    <label for="ssid">WiFi Network Name (SSID)</label>
                    <input type="text" id="ssid" name="ssid" class="form-input" 
                           placeholder="Enter WiFi name" required 
                           value=")rawliteral" + String(WIFI_SSID) + R"rawliteral(">
                </div>
                
                <div class="form-group">
                    <label for="pass">WiFi Password</label>
                    <input type="password" id="pass" name="pass" class="form-input" 
                           placeholder="Enter WiFi password">
                </div>
                
                <button type="submit" class="btn btn-primary">
                    💾 Save & Connect to WiFi
                </button>
            </form>
            
            <div style="display: flex; gap: 10px; margin-top: 20px;">
                <a href="/status" class="btn btn-secondary">🔄 System Status</a>
                <a href="/reset" class="btn btn-danger" onclick="return confirm('Are you sure? This will erase all settings!')">
                    🗑️ Factory Reset
                </a>
            </div>
        </div>
    </div>

    <script>
        function scanNetworks() {
            const networkList = document.getElementById('networkList');
            networkList.classList.remove('hidden');
            networkList.innerHTML = '<div class="loading">Scanning networks...</div>';
            
            fetch('/scan')
                .then(response => response.text())
                .then(data => {
                    networkList.innerHTML = data;
                })
                .catch(error => {
                    networkList.innerHTML = '<div class="loading">Error scanning networks</div>';
                });
        }
        
        function selectNetwork(ssid) {
            document.getElementById('ssid').value = ssid;
            document.getElementById('ssid').focus();
            document.getElementById('networkList').classList.add('hidden');
        }
        
        // Auto-refresh data every 5 seconds
        setInterval(() => {
            fetch('/data')
                .then(response => response.json())
                .then(data => {
                    if (data.voltage !== undefined) {
                        document.getElementById('voltage').textContent = data.voltage.toFixed(1);
                        document.getElementById('current').textContent = data.current.toFixed(2);
                        document.getElementById('power').textContent = data.power.toFixed(1);
                        document.getElementById('energy').textContent = data.energy.toFixed(1);
                    }
                })
                .catch(error => console.error('Error fetching data:', error));
        }, 5000);
    </script>
</body>
</html>
)rawliteral";
  
  server.send(200, "text/html", html);
}

void handleSave() {
  if (server.hasArg("ssid") && server.arg("ssid").length() > 0) {
    String newSSID = server.arg("ssid");
    String newPass = server.arg("pass");
    
    Serial.print("Saving WiFi credentials: ");
    Serial.println(newSSID);
    
    // Save to preferences
    preferences.begin("wifi-config", false);
    preferences.putString("ssid", newSSID);
    preferences.putString("pass", newPass);
    preferences.end();
    
    // Update global variables
    WIFI_SSID = newSSID;
    WIFI_PASSWORD = newPass;
    
    // Send response
    String html = R"rawliteral(
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="refresh" content="3;url=/">
        <title>Settings Saved</title>
        <style>
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                display: flex;
                justify-content: center;
                align-items: center;
                min-height: 100vh;
                margin: 0;
                padding: 20px;
            }
            .message-box {
                background: white;
                padding: 50px;
                border-radius: 20px;
                text-align: center;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                max-width: 500px;
                animation: fadeIn 0.5s ease;
            }
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(-20px); }
                to { opacity: 1; transform: translateY(0); }
            }
            .success-icon {
                font-size: 80px;
                color: #28a745;
                margin-bottom: 20px;
                animation: bounce 1s infinite;
            }
            @keyframes bounce {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-10px); }
            }
            h1 {
                color: #333;
                margin-bottom: 20px;
            }
            p {
                color: #666;
                margin-bottom: 10px;
                line-height: 1.6;
            }
            .countdown {
                color: #4facfe;
                font-weight: bold;
                font-size: 18px;
            }
        </style>
    </head>
    <body>
        <div class="message-box">
            <div class="success-icon">✅</div>
            <h1>Settings Saved Successfully!</h1>
            <p>WiFi SSID: <strong>)rawliteral" + newSSID + R"rawliteral(</strong></p>
            <p>The device will now attempt to connect to this network.</p>
            <p>Device will restart in <span class="countdown">3</span> seconds...</p>
            <p>If connection fails, the setup portal will remain accessible.</p>
        </div>
        <script>
            let count = 3;
            const countdownEl = document.querySelector('.countdown');
            setInterval(() => {
                count--;
                countdownEl.textContent = count;
                if (count <= 0) {
                    window.location.href = '/';
                }
            }, 1000);
        </script>
    </body>
    </html>
    )rawliteral";
    
    server.send(200, "text/html", html);
    
    // Restart to apply new settings
    delay(1000);
    ESP.restart();
    
  } else {
    server.send(400, "text/plain", "SSID is required");
  }
}

void handleStatus() {
  String json = "{";
  json += "\"deviceId\":\"" + deviceId + "\",";
  json += "\"wifiConnected\":" + String(WiFi.status() == WL_CONNECTED ? "true" : "false") + ",";
  json += "\"wifiSSID\":\"" + WiFi.SSID() + "\",";
  json += "\"ipAddress\":\"" + WiFi.localIP().toString() + "\",";
  json += "\"gateway\":\"" + WiFi.gatewayIP().toString() + "\",";
  json += "\"apIP\":\"" + WiFi.softAPIP().toString() + "\",";
  json += "\"rssi\":" + String(WiFi.RSSI()) + ",";
  json += "\"houseId\":\"" + houseId + "\",";
  json += "\"firebaseInitialized\":" + String(firebaseInitialized ? "true" : "false") + ",";
  json += "\"freeHeap\":" + String(ESP.getFreeHeap()) + ",";
  json += "\"uptime\":" + String(millis() - startTime);
  json += "}";
  
  server.send(200, "application/json", json);
}

void handleData() {
  String json = "{";
  json += "\"voltage\":" + String(voltage, 2) + ",";
  json += "\"current\":" + String(current, 3) + ",";
  json += "\"power\":" + String(power, 2) + ",";
  json += "\"energy\":" + String(energy, 3) + ",";
  json += "\"motorRunning\":" + String(motorRunning ? "true" : "false") + ",";
  json += "\"relay1\":" + String(relay1 ? "true" : "false") + ",";
  json += "\"relay2\":" + String(relay2 ? "true" : "false") + ",";
  json += "\"systemState\":" + String(systemState) + ",";
  json += "\"currentMode\":" + String(currentMode) + ",";
  json += "\"currentMeter\":" + String(currentMeter) + ",";
  json += "\"energyToday\":" + String(energyToday, 3) + ",";
  json += "\"energyMonth\":" + String(energyMonth, 3);
  json += "}";
  
  server.send(200, "application/json", json);
}

void handleScan() {
  Serial.println("Scanning WiFi networks...");
  
  // Scan networks
  int n = WiFi.scanNetworks(false, true); // async=false, show_hidden=false
  
  String html = "<h4 style='margin-bottom: 15px; color: #333;'>Available Networks:</h4>";
  
  if (n == 0) {
    html += "<div style='text-align: center; color: #666; padding: 20px;'>No networks found</div>";
  } else {
    for (int i = 0; i < n; ++i) {
      String ssid = WiFi.SSID(i);
      int rssi = WiFi.RSSI(i);
      String security = (WiFi.encryptionType(i) == WIFI_AUTH_OPEN) ? "🔓 Open" : "🔒 Secured";
      
      html += "<div class='network-item' onclick=\"selectNetwork('" + ssid + "')\">";
      html += "<div class='network-icon'>📶</div>";
      html += "<div class='network-info'>";
      html += "<div class='network-name'>" + ssid + "</div>";
      html += "<div class='network-rssi'>Signal: " + String(rssi) + " dBm | " + security + "</div>";
      html += "</div>";
      html += "</div>";
    }
  }
  
  server.send(200, "text/html", html);
  
  // Clean up scan results
  WiFi.scanDelete();
}

void handleConfig() {
  String json = "{";
  json += "\"deviceId\":\"" + deviceId + "\",";
  json += "\"apSSID\":\"" + String(apSSID) + "\",";
  json += "\"firebaseHost\":\"" + String(FIREBASE_HOST) + "\",";
  json += "\"savedSSID\":\"" + WIFI_SSID + "\"";
  json += "}";
  
  server.send(200, "application/json", json);
}

void handleReset() {
  Serial.println("Performing factory reset...");
  
  // Clear all preferences
  preferences.begin("wifi-config", false);
  preferences.clear();
  preferences.end();
  
  // Send response
  String html = R"rawliteral(
  <!DOCTYPE html>
  <html>
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="refresh" content="5;url=/">
      <title>Factory Reset</title>
      <style>
          body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              margin: 0;
              padding: 20px;
          }
          .message-box {
              background: white;
              padding: 50px;
              border-radius: 20px;
              text-align: center;
              box-shadow: 0 20px 60px rgba(0,0,0,0.3);
              max-width: 500px;
          }
          .reset-icon {
              font-size: 80px;
              color: #dc3545;
              margin-bottom: 20px;
          }
          h1 {
              color: #333;
              margin-bottom: 20px;
          }
          p {
              color: #666;
              margin-bottom: 10px;
              line-height: 1.6;
          }
      </style>
  </head>
  <body>
      <div class="message-box">
          <div class="reset-icon">🔄</div>
          <h1>Factory Reset Complete</h1>
          <p>All settings have been erased.</p>
          <p>The device will restart and return to setup mode.</p>
          <p>Redirecting to setup page in 5 seconds...</p>
      </div>
  </body>
  </html>
  )rawliteral";
  
  server.send(200, "text/html", html);
  
  delay(3000);
  ESP.restart();
}