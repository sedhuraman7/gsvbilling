
#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include <ArduinoJson.h>

// ================= CREDENTIALS =================
#define WIFI_SSID "YOUR_WIFI_NAME"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

// From your Firebase Console
#define API_KEY "AIzaSy..." 
#define DATABASE_URL "https://smart-meter-billing-default-rtdb.firebaseio.com/"

// HOUSE CONFIG
#define HOUSE_ID "GSV01"  // Change this for each device

// ================= SERIAL PINS =================
// Connect Arduino TX -> ESP32 RX (GPIO 16)
// Connect Arduino RX -> ESP32 TX (GPIO 17)
#define RXD2 16
#define TXD2 17

// ================= FIREBASE OBJ ================
FirebaseData fbDO;
FirebaseAuth auth;
FirebaseConfig config;
bool signupOK = false;

unsigned long lastUpload = 0;

void setup() {
  Serial.begin(115200);
  
  // Initialize Serial2 for communicating with Arduino
  Serial2.begin(115200, SERIAL_8N1, RXD2, TXD2);
  Serial.println("ESP32 Bridge Started...");

  // WiFi
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    Serial.print(".");
    delay(300);
  }
  Serial.println();
  Serial.print("Connected with IP: ");
  Serial.println(WiFi.localIP());

  // Firebase
  config.api_key = API_KEY;
  config.database_url = DATABASE_URL;
  if (Firebase.signUp(&config, &auth, "", "")) {
    Serial.println("Firebase Auth Success");
    signupOK = true;
  } else {
    Serial.printf("%s\n", config.signer.signupError.message.c_str());
  }

  config.token_status_callback = tokenStatusCallback;
  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
}

void loop() {
  // Check for data from Arduino
  if (Serial2.available()) {
    String line = Serial2.readStringUntil('\n');
    Serial.print("Received from Arduino: ");
    Serial.println(line);

    if (line.startsWith("{") && line.endsWith("}")) {
      processData(line);
    }
  }
}

void processData(String jsonString) {
  if (!signupOK) return;

  // Use ArduinoJson to parse
  StaticJsonDocument<200> doc;
  DeserializationError error = deserializeJson(doc, jsonString);

  if (error) {
    Serial.print(F("deserializeJson() failed: "));
    Serial.println(error.f_str());
    return;
  }

  float v = doc["v"];
  float i = doc["i"];
  float p = doc["p"];
  int r1 = doc["r1"];
  int r2 = doc["r2"];

  // Upload to Firebase (Throttled to every 2 seconds to save bandwidth if needed, or real-time)
  // For 'RTDB', direct updates are fast.
  
  if (Firebase.ready() && (millis() - lastUpload > 2000)) {
    lastUpload = millis();

    // Set System Status Node
    String path = "houses/" + String(HOUSE_ID) + "/system_status";
    
    FirebaseJson json;
    json.set("voltage", v);
    json.set("current", i);
    json.set("power", p);
    json.set("motor_status", r1 == 1 ? "ON" : "OFF"); // Assuming R1 is Motor
    json.set("active_meter", 1);
    json.set("updated_at", millis());

    if (Firebase.RTDB.setJSON(&fbDO, path.c_str(), &json)) {
      Serial.println("Firebase Update Success");
    } else {
      Serial.println("Firebase Update Failed: " + fbDO.errorReason());
    }
  }
}
