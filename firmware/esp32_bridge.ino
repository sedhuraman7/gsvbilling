
#include <WiFi.h>
#include <FirebaseESP32.h>
#include <ArduinoJson.h>

// ================= CONFIGURATION =================
// WiFi Credentials
const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Firebase Configuration
#define FIREBASE_HOST "smart-billing-system-5c276-default-rtdb.firebaseio.com"
#define FIREBASE_AUTH "AIzaSyCKTC_lcN-4YMtIwr-kWMzgRU7i379-BTg" // API Key (If fails, search 'Database Secret' in Firebase Console)

// Device Info
String deviceId = "";
String houseId = "NOT_REGISTERED";

// Meter rotation
int currentMeter = 1; // 1, 2, or 3
unsigned long lastMeterRotation = 0;
const unsigned long METER_INTERVAL = 2592000000UL; // 30 days

// ================= GLOBAL OBJECTS =================
FirebaseData firebaseData;
FirebaseAuth auth;
FirebaseConfig config;

String incomingData = "";
unsigned long lastFirebaseUpdate = 0;
const unsigned long FIREBASE_INTERVAL = 5000; // 5 seconds

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

// ================= SETUP =================
void setup() {
  Serial.begin(115200); // For debugging
  Serial2.begin(9600, SERIAL_8N1, 16, 17); // RX=GPIO16, TX=GPIO17
  
  // Get device ID from MAC address
  deviceId = WiFi.macAddress();
  deviceId.replace(":", "");
  Serial.print("Device ID: ");
  Serial.println(deviceId);
  
  // Connect to WiFi
  connectToWiFi();
  
  // Initialize Firebase (Mobizt Library v4+)
  config.api_key = FIREBASE_AUTH;
  config.database_url = "https://" FIREBASE_HOST; // URL needs valid scheme
  
  // Sign up anonymously
  if (Firebase.signUp(&config, &auth, "", "")) {
    Serial.println("Firebase Auth Success");
  } else {
    Serial.printf("Firebase Auth Failed: %s\n", config.signer.signupError.message.c_str());
  }

  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
  
  // Check registration
  checkRegistration();
  
  Serial.println("ESP32 Ready - Listening to Arduino...");
}

// ================= MAIN LOOP =================
void loop() {
  // 1. Read data from Arduino
  readFromArduino();
  
  // 2. Check date change
  checkDateChange();
  
  // 3. Send to Firebase every 5 seconds
  if (millis() - lastFirebaseUpdate > FIREBASE_INTERVAL) {
    sendToFirebase();
    lastFirebaseUpdate = millis();
  }
  
  // 4. Check meter rotation
  checkMeterRotation();
  
  // 5. Check for commands from Firebase
  checkFirebaseCommands();
  
  delay(100);
}

// ================= FUNCTIONS =================

void connectToWiFi() {
  Serial.print("Connecting to WiFi...");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi Connected!");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
  }
}

void readFromArduino() {
  while (Serial2.available()) {
    char c = Serial2.read();
    
    if (c == '\n') {
      processArduinoData();
      incomingData = "";
    } else {
      incomingData += c;
    }
  }
}

void processArduinoData() {
  // Parse JSON from Arduino
  StaticJsonDocument<300> doc;
  DeserializationError error = deserializeJson(doc, incomingData);
  
  if (error) {
    Serial.print("JSON Parse Error: ");
    Serial.println(error.c_str());
    return;
  }
  
  // Extract data
  voltage = doc["voltage"];
  current = doc["current"];
  power = doc["power"];
  energy = doc["energy"];
  
  String motorState = doc["motor_state"];
  motorRunning = (motorState == "ON");
  
  relay1 = doc["relay1"];
  relay2 = doc["relay2"];
  systemState = doc["system_state"];
  currentMode = doc["mode"];
  
  // Add to daily/monthly energy
  energyToday = energy;
  energyMonth = energy;
  
  // Log for debugging
  Serial.print("Arduino Data: V=");
  Serial.print(voltage);
  Serial.print("V, I=");
  Serial.print(current);
  Serial.print("A, Motor=");
  Serial.println(motorState);
}

void checkDateChange() {
  unsigned long currentDay = millis() / 86400000UL; // Days since power on
  
  if (currentDay != lastDayReset) {
    // New day - reset daily energy
    energyToday = 0;
    lastDayReset = currentDay;
    Serial.println("New day - reset daily energy");
  }
  
  // Simple month tracking (30 days)
  if (millis() - lastMonthReset > 2592000000UL) { // 30 days
    energyMonth = 0;
    lastMonthReset = millis();
    Serial.println("New month - reset monthly energy");
  }
}

void sendToFirebase() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (houseId == "NOT_REGISTERED") return;
  
  // Create JSON for Firebase
  FirebaseJson json;
  
  // Basic data
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
  json.set("timestamp", millis());
  
  // Send real-time data
  String path = "/houses/" + houseId + "/realtime";
  if (Firebase.setJSON(firebaseData, path, json)) {
    Serial.println("Sent to Firebase");
  } else {
    Serial.print("Firebase Error: ");
    Serial.println(firebaseData.errorReason());
  }
  
  // Add to history for charts (optional)
  String historyPath = "/houses/" + houseId + "/history";
  Firebase.pushJSON(firebaseData, historyPath, json);
}

void checkRegistration() {
  String path = "/devices/" + deviceId;
  
  if (Firebase.getString(firebaseData, path + "/houseId")) {
    houseId = firebaseData.stringData();
    Serial.print("Registered to house: ");
    Serial.println(houseId);
  } else {
    Serial.println("Not registered. Waiting for registration...");
    
    // Create device entry
    FirebaseJson deviceInfo;
    deviceInfo.set("mac", WiFi.macAddress());
    deviceInfo.set("ip", WiFi.localIP().toString());
    deviceInfo.set("first_seen", millis());
    deviceInfo.set("status", "waiting_registration");
    
    Firebase.setJSON(firebaseData, path, deviceInfo);
  }
}

void checkMeterRotation() {
  // Simple meter rotation every 30 days
  if (millis() - lastMeterRotation > METER_INTERVAL) {
    currentMeter = (currentMeter % 3) + 1;
    lastMeterRotation = millis();
    
    // Send event
    sendEvent("meter_rotated", "Auto-rotated to Meter " + String(currentMeter));
    
    Serial.print("Meter rotated to: ");
    Serial.println(currentMeter);
  }
}

void sendEvent(String eventType, String message) {
  if (houseId == "NOT_REGISTERED") return;
  
  FirebaseJson event;
  event.set("type", eventType);
  event.set("message", message);
  event.set("timestamp", millis());
  event.set("meter", currentMeter);
  
  String path = "/houses/" + houseId + "/events";
  Firebase.pushJSON(firebaseData, path, event);
}

void checkFirebaseCommands() {
  if (houseId == "NOT_REGISTERED") return;
  
  String path = "/houses/" + houseId + "/commands";
  
  if (Firebase.getString(firebaseData, path)) {
    String command = firebaseData.stringData();
    
    if (command.length() > 0) {
      Serial.print("Command received: ");
      Serial.println(command);
      
      // Send command to Arduino
      Serial2.println(command);
      
      // Clear command
      Firebase.setString(firebaseData, path, "");
    }
  }
}
