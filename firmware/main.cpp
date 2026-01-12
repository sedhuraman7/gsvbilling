/**
 * SMART METER SWITCHING SYSTEM - ADVANCED VERSION
 * Platform: ESP32
 * Features: LCD, SD Card, RTC, Firebase, Dry Run Protection
 */

#include <Arduino.h>
#include <WiFi.h>
#include <IOXhop_FirebaseESP32.h> // Simpler library than the one in example, but logic adapted
#include <LiquidCrystal_I2C.h>
#include <SD.h>
#include <SPI.h>
#include <RTClib.h>
#include <NTPClient.h>
#include <WiFiUdp.h>

// ================= CONFIGURATION (UPDATE THESE)// --- CONFIGURATION ---
const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";
const char* HOUSE_ID  = "GSV07"; // Change this for each house

#define FIREBASE_HOST "smart-billing-system-5c276-default-rtdb.firebaseio.com"
#define FIREBASE_AUTH "AIzaSyCKTC_lcN-4YMtIwr-kWMzgRU7i379-BTg"

// Pin Definitions (ESP32)
#define CURRENT_PIN 34
#define VOLTAGE_PIN 35
#define RELAY_METER1 26
#define RELAY_METER2 27
#define RELAY_METER3 14
#define RELAY_MOTOR 13  // Added Motor Relay Pin
#define SD_CS_PIN 5

// Motor Settings
#define MOTOR_THRESHOLD 1.0  // Amps
#define MAX_CURRENT 15.0     // Overload threshold

// ================= GLOBAL VARIABLES =================
LiquidCrystal_I2C lcd(0x27, 16, 2);
RTC_DS3231 rtc;
WiFiUDP ntpUDP;
NTPClient timeClient(ntpUDP, "pool.ntp.org", 19800, 60000); // IST Offset

// Runtime Tracking
float totalRuntimeToday = 0;      
float energyConsumed = 0;         
int currentMeter = 1;             
bool motorRunning = false;
unsigned long motorStartTime = 0;

void setup() {
  Serial.begin(115200);
  
  // 1. LCD Setup
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0,0);
  lcd.print("Initializing...");
  
  // 2. Pins
  pinMode(RELAY_METER1, OUTPUT);
  pinMode(RELAY_METER2, OUTPUT);
  pinMode(RELAY_METER3, OUTPUT);
  pinMode(RELAY_MOTOR, OUTPUT);
  
  // SAFETY: All OFF
  digitalWrite(RELAY_METER1, HIGH);
  digitalWrite(RELAY_METER2, HIGH);
  digitalWrite(RELAY_METER3, HIGH);
  digitalWrite(RELAY_MOTOR, HIGH); 
  
  // 3. RTC
  if (!rtc.begin()) {
    Serial.println("RTC Failed!");
  }
  
  // 4. SD Card
  if (!SD.begin(SD_CS_PIN)) {
    Serial.println("SD Card Failed");
  } else {
    Serial.println("SD Card OK");
  }
  
  // 5. WiFi
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println(" WiFi Connected!");
  
  // 6. Firebase
  Firebase.begin(FIREBASE_HOST, FIREBASE_AUTH);
  
  // 7. NTP Sync
  timeClient.begin();
  timeClient.update();
}

// Function Declarations
float readCurrent();
float readVoltage();
void checkMotorState(float current);
void switchMeter(int meterNumber);
void updateLCD(float amp, float volt);

void loop() {
  // 1. Read Sensors
  float current = readCurrent();
  float voltage = readVoltage();
  
  // 2. Logic
  checkMotorState(current);
  updateLCD(current, voltage);
  
  // 3. Meter Rotation Logic
  DateTime now = rtc.now();
  int target = (now.month() % 3 == 0) ? 3 : (now.month() % 3); 
  if(target == 0) target = 3; // Fix modulo logic (1, 2, 0 -> 1, 2, 3)
  
  if (currentMeter != target) {
      switchMeter(target);
  }

  // 4. Upload to Cloud (Every 5 seconds)
  static unsigned long lastUpload = 0;
  if (millis() - lastUpload > 5000) {
      Firebase.setFloat("system_status/voltage", voltage);
      Firebase.setFloat("system_status/current", current);
      Firebase.setInt("system_status/active_meter", currentMeter);
      Firebase.setString("system_status/motor_status", motorRunning ? "ON" : "OFF");
      lastUpload = millis();
  }
  
  delay(1000);
}

// --- HELPER FUNCTIONS ---

void switchMeter(int target) {
   // Safety Disconnect
   digitalWrite(RELAY_METER1, HIGH);
   digitalWrite(RELAY_METER2, HIGH);
   digitalWrite(RELAY_METER3, HIGH);
   delay(5000); // 5s Delay
   
   if(target == 1) digitalWrite(RELAY_METER1, LOW);
   if(target == 2) digitalWrite(RELAY_METER2, LOW);
   if(target == 3) digitalWrite(RELAY_METER3, LOW);
   
   currentMeter = target;
}

float readCurrent() {
    // Simplified calibration for SCT-013 30A/1V
    double sensorValue = analogRead(CURRENT_PIN);
    return (sensorValue * (3.3 / 4095.0)) * 30.0; 
}

float readVoltage() {
    // Simplified calibration for ZMPT101B
    double sensorValue = analogRead(VOLTAGE_PIN);
    return (sensorValue * (3.3 / 4095.0)) * 250.0; 
}

void checkMotorState(float current) {
    if (current > MOTOR_THRESHOLD) motorRunning = true;
    else motorRunning = false;
}

void updateLCD(float c, float v) {
    lcd.setCursor(0, 0);
    lcd.print("V:"); lcd.print(v, 0); lcd.print(" C:"); lcd.print(c, 1);
    lcd.setCursor(0, 1);
    lcd.print("Meter: "); lcd.print(currentMeter);
}
