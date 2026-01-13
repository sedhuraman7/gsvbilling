#include <Wire.h>
#include <LiquidCrystal.h>
#include "EmonLib.h"
#include <RTClib.h>
#include <EEPROM.h>
#include <ArduinoJson.h>  // NEW: Add this library

// ======================= LCD PINS =======================
const uint8_t PIN_LCD_RS = 10;
const uint8_t PIN_LCD_EN = 11;
const uint8_t PIN_LCD_D4 = 12;
const uint8_t PIN_LCD_D5 = 7;
const uint8_t PIN_LCD_D6 = A2;
const uint8_t PIN_LCD_D7 = A3;

LiquidCrystal lcd(PIN_LCD_RS, PIN_LCD_EN,
                  PIN_LCD_D4, PIN_LCD_D5, PIN_LCD_D6, PIN_LCD_D7);

// ======================= RTC ============================
RTC_DS1307 rtc;
bool rtcOk = false;
long timeCorrectionSeconds = 0;

// ======================= BUTTONS ========================
const int btnMenu   = 2;
const int btnUp     = 4;
const int btnDown   = 3;
const int btnSelect = 5;

// Hold / repeat
const unsigned long HOLD_INITIAL_DELAY = 400;
const unsigned long HOLD_REPEAT_MIN    = 60;
const unsigned long HOLD_REPEAT_MAX    = 300;
const unsigned long HOLD_RAMP_MS       = 2000;

// ======================= RELAYS / MOTORS ================
const int relay1 = 8;
const int relay2 = 9;

bool relay1On = false;
bool relay2On = false;

const bool SIMULATE_RELAY_WITH_LED = true;
const bool RELAY_ACTIVE_LOW = true;
const bool LED_ACTIVE_LOW   = false;

// ======================= SENSING ========================
const int analogPin = A0;
const int ctPin     = A1;

const float R1 = 100.0;
const float R2 = 100.0;
const float Vref_HIGH = 3.4895;
const float Vref_LOW  = 3.65;
const float A_CAL     = 0.04385;
const float B_CAL     = 38.10;

EnergyMonitor emon1;
float ICAL = 5.5f;

float smoothCurrent_mA = 0.0f;
const float EMA_ALPHA = 0.25f;
const unsigned int RMS_SAMPLES = 1480;
const float NOISE_FLOOR_A = 0.01f;

unsigned long lastUpdate = 0;
const unsigned long updateInterval = 400;

float  Voltage_V = 0.0;
float Current_A = 0.0;
float Power_W   = 0.0;

// ====================== ESP32 COMMUNICATION ==============
// NEW: Variables for ESP32 communication
unsigned long lastDataSend = 0;
const unsigned long SEND_INTERVAL = 2000; // Send to ESP32 every 2 seconds
float totalEnergyKWh = 0.0; // Total energy in kWh
unsigned long lastEnergyUpdate = 0;
bool motorRunning = false; // Track motor state
unsigned long motorStartTime = 0;
float energySinceStart = 0.0;

// ======================= EEPROM / SETTINGS ==============
#define EEPROM_SIZE 1024
#define NUM_BACKUPS 3

const int MAX_PROGRAMS = 3;

struct ProgramSlot {
  byte dayOfWeek;
  byte onHour;
  byte onMinute;
  byte offHour;
  byte offMinute;
  bool relay1;
  bool relay2;
  bool active;
};

struct Settings {
  uint32_t magic1 = 0x55AA1234;
  uint32_t magic2 = 0xAA55DCBA;

  float voltageUpper = 250.0;
  float voltageLower = 180.0;
  float currentUpper = 15.0;
  float currentLower = 0.0;

  // 0=Cyclic, 1=Sequential, 2=Program, 3=WLC
  byte mode = 0;

  // Cyclic
  unsigned long cyclicOnTime  = 2000;
  unsigned long cyclicOffTime = 2000;

  // Sequential
  unsigned long seqDurations[2] = {5000, 5000};

  // WLC
  byte  wlcActiveSubMode = 0;
  float floatStartLevelM = 0.30;
  float floatEndLevelM   = 1.20;
  float ultraStartLevelM = 0.30;
  float ultraEndLevelM   = 1.20;

  // Program slots
  ProgramSlot programs[MAX_PROGRAMS];

  uint16_t crc = 0;
};

Settings currentSettings;

// ======================= MENU STATE =====================
enum MenuState {
  IDLE_DISPLAY,
  MAIN_MENU,
  CURRENT_MENU,
  VOLTAGE_MENU,
  MODE_MENU,
  CURRENT_ADJUST,
  VOLTAGE_ADJUST,
  CYCLIC_MENU,
  SEQUENTIAL_MENU,
  PROGRAM_MENU,
  PROGRAM_EDIT,
  WLC_MENU,
  WLC_ADJUST,
  SET_DATE_TIME_MENU,
  SET_YEAR,
  SET_MONTH,
  SET_DAY,
  SET_HOUR,
  SET_MINUTE,
  TIME_CORRECTION_MENU,
  TIME_CORRECTION_ADJUST
};

enum OperationMode {
  MODE_CYCLIC,
  MODE_SEQUENTIAL,
  MODE_PROGRAMMABLE,
  MODE_WLC
};

MenuState     menuState   = IDLE_DISPLAY;
OperationMode currentMode = MODE_CYCLIC;

// Menu indices
int mainIndex       = 0;
int currentSubIndex = 0;
int voltageSubIndex = 0;
int modeSubIndex    = 0;
int cyclicSubIndex  = 0;

// Sequential menu
int           seqMenuIndex       = 0;
unsigned long tempSeqDurations[2];
bool          seqModified        = false;

// Program menu
int         programMenuIndex  = 0;
int         programFieldIndex = 0;
ProgramSlot tempProgram;
bool        programModified   = false;

// WLC
int   wlcMenuIndex     = 0;
int   wlcParamIndex    = 0;
byte  wlcEditSubMode   = 0;
float tempStartLevelM  = 0.0;
float tempEndLevelM    = 0.0;
bool  wlcModified      = false;

// Adjust flags
bool voltageModified   = false;
bool currentModified   = false;
bool cyclicModified    = false;

float         tempVoltageUpper, tempVoltageLower;
float         tempCurrentUpper, tempCurrentLower;
unsigned long tempCyclicOnTime, tempCyclicOffTime;

// Date/time menu vars
int setYear, setMonth, setDay, setHour, setMinute;
int daySelectIndex = 0;

// Time correction
int timeCorrectionIndex = 0;

// Idle timeout
unsigned long lastInteraction = 0;
const unsigned long idleTimeout = 10000;

// Debounce
unsigned long lastDebounceTime = 0;
const unsigned long debounceDelay = 50;

// =================== PROTECTION / STATE =================
enum SystemState {
  SYS_NO_INPUT,
  SYS_NORMAL,
  SYS_TRIP
};

bool relaysForcedOff = false;
unsigned long relayOffTimestamp = 0;
const unsigned long RELAY_OFF_HOLD_MS = 3000;

SystemState systemState = SYS_NO_INPUT;

bool lastVHigh = false;
bool lastVLow  = false;
bool lastIHigh = false;
bool lastILow  = false;

unsigned long tripStartMillis = 0;

// For alternating normal screens
unsigned long lastScreenToggle = 0;
byte          screenPage       = 0;

// Mode timer variables
unsigned long modeTimerStart = 0;
unsigned long modeDuration = 0;
bool modeTimerRunning = false;

// ======================= CRC / EEPROM ===================
uint16_t calculateCRC(const Settings &d) {
  uint16_t crc = 0xFFFF;
  const uint8_t* p = (const uint8_t*)&d;
  for (size_t i = 0; i < sizeof(d) - sizeof(d.crc); i++) {
    crc ^= (uint16_t)p[i] << 8;
    for (uint8_t j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : (crc << 1);
    }
  }
  return crc;
}

void initDefaultPrograms(Settings &s) {
  for (int i = 0; i < MAX_PROGRAMS; i++) {
    s.programs[i].active    = false;
    s.programs[i].dayOfWeek = 0;
    s.programs[i].onHour    = 6;
    s.programs[i].onMinute  = 0;
    s.programs[i].offHour   = 7;
    s.programs[i].offMinute = 0;
    s.programs[i].relay1    = true;
    s.programs[i].relay2    = false;
  }
}

void saveSettings() {
  currentSettings.crc = calculateCRC(currentSettings);
  for (int i = 0; i < NUM_BACKUPS; i++) {
    int addr = i * (EEPROM_SIZE / NUM_BACKUPS);
    EEPROM.put(addr, currentSettings);
#if defined(ESP8266) || defined(ESP32)
    EEPROM.commit();
#endif
    delay(5);
  }
  
  EEPROM.put(900, timeCorrectionSeconds);
#if defined(ESP8266) || defined(ESP32)
  EEPROM.commit();
#endif
}

void loadSettings() {
  Settings tmp;
  int good = -1;
  for (int i = 0; i < NUM_BACKUPS; i++) {
    int addr = i * (EEPROM_SIZE / NUM_BACKUPS);
    EEPROM.get(addr, tmp);
    bool ok = (tmp.magic1 == 0x55AA1234) && (tmp.magic2 == 0xAA55DCBA);
    ok &= (calculateCRC(tmp) == tmp.crc);
    if (ok) { good = i; break; }
  }

  if (good >= 0) {
    EEPROM.get(good * (EEPROM_SIZE / NUM_BACKUPS), currentSettings);
  } else {
    currentSettings = Settings();
    initDefaultPrograms(currentSettings);
    saveSettings();
  }

  if (currentSettings.mode > 3) currentSettings.mode = 0;
  currentMode = (OperationMode)currentSettings.mode;
  
  EEPROM.get(900, timeCorrectionSeconds);
}

// ======================= HELPERS ========================
float readCurrent_mA() {
  float Irms_A = emon1.calcIrms(RMS_SAMPLES);
  if (Irms_A < NOISE_FLOOR_A) Irms_A = 0.0;
  return Irms_A * 1000.0;
}

void drawPowerLayout() {
  lcd.clear();
  lcd.setCursor(0,0); lcd.print(F("V:"));
  lcd.setCursor(6,0); lcd.print(F("V"));
  lcd.setCursor(8,0); lcd.print(F("I:"));
  lcd.setCursor(14,0); lcd.print(F("A"));
  lcd.setCursor(0,1); lcd.print(F("P:"));
}

void displayIdle() {
  drawPowerLayout();
  menuState = IDLE_DISPLAY;
}

DateTime getCorrectedDateTime() {
  if (!rtcOk) {
    static unsigned long lastMillis = 0;
    static DateTime fallbackTime = DateTime(2024, 1, 1, 0, 0, 0);
    
    unsigned long currentMillis = millis();
    if (currentMillis - lastMillis >= 1000) {
      fallbackTime = fallbackTime + TimeSpan(0, 0, 0, 1);
      lastMillis = currentMillis;
    }
    return fallbackTime;
  } else {
    DateTime now = rtc.now();
    return now + TimeSpan(timeCorrectionSeconds);
  }
}

void getRTCTime(int &hour, int &minute, int &second) {
  DateTime corrected = getCorrectedDateTime();
  hour = corrected.hour();
  minute = corrected.minute();
  second = corrected.second();
}

void printTime24(int col, int row) {
  int hh, mm, ss;
  getRTCTime(hh, mm, ss);
  lcd.setCursor(col, row);
  if (hh < 10) lcd.print('0');
  lcd.print(hh);
  lcd.print(':');
  if (mm < 10) lcd.print('0');
  lcd.print(mm);
}

void formatRemainingTime(unsigned long remainingMs, char* buffer, size_t bufferSize) {
  unsigned long seconds = remainingMs / 1000;
  if (seconds >= 60) {
    unsigned long minutes = seconds / 60;
    seconds = seconds % 60;
    snprintf(buffer, bufferSize, "%02lu:%02lu", minutes, seconds);
  } else {
    snprintf(buffer, bufferSize, "%02lus", seconds);
  }
}

// ============ SMALL HELPER: ADJUST SCREEN ===============
void displayAdjustScreen() {
  lcd.clear();
  if (menuState == CURRENT_ADJUST) {
    lcd.setCursor(0,0);
    lcd.print(currentSubIndex == 0 ? "Curr Upper:" : "Curr Lower:");
    lcd.setCursor(0,1);
    lcd.print(currentSubIndex == 0 ? tempCurrentUpper : tempCurrentLower, 1);
  } else if (menuState == VOLTAGE_ADJUST) {
    lcd.setCursor(0,0);
    lcd.print(voltageSubIndex == 0 ? "Volt Upper:" : "Volt Lower:");
    lcd.setCursor(0,1);
    lcd.print(voltageSubIndex == 0 ? tempVoltageUpper : tempVoltageLower, 1);
  }
}

// ================= BUTTON HANDLING (HOLD/REPEAT) ========
bool buttonPressed(int pin) {
  const unsigned long debounce = 120;
  static bool init = false;
  static bool lastState[6];
  static bool latched[6];
  static unsigned long lastTime[6];
  static unsigned long firstPress[6];
  static unsigned long lastRepeat[6];

  unsigned long now = millis();
  bool raw = digitalRead(pin);

  if (!init) {
    for (int i = 0; i < 20; i++) {
      lastState[i]  = HIGH;
      latched[i]    = false;
      lastTime[i]   = 0;
      firstPress[i] = 0;
      lastRepeat[i] = 0;
    }
    init = true;
  }

  if (raw != lastState[pin]) {
    lastState[pin] = raw;
    lastTime[pin]  = now;
  }

  if ((now - lastTime[pin]) > debounce) {
    if (raw == LOW && !latched[pin]) {
      latched[pin]    = true;
      firstPress[pin] = now;
      lastRepeat[pin] = now;
      return true;
    }
    if (raw == HIGH && latched[pin]) {
      latched[pin]    = false;
      firstPress[pin] = 0;
      lastRepeat[pin] = 0;
      return false;
    }
    if (raw == LOW && latched[pin] && (pin == btnUp || pin == btnDown)) {
      unsigned long held = now - firstPress[pin];
      if (held >= HOLD_INITIAL_DELAY) {
        float t = (held > HOLD_RAMP_MS) ? 1.0f : (float)held / (float)HOLD_RAMP_MS;
        unsigned long interval = (unsigned long)(
          HOLD_REPEAT_MAX - t * (HOLD_REPEAT_MAX - HOLD_REPEAT_MIN)
        );
        if (now - lastRepeat[pin] >= interval) {
          lastRepeat[pin] = now;
          return true;
        }
      }
    }
  }
  return false;
}

// ================= DATE/TIME SETTING ====================
void displaySetDateTimeMenu() {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(F("SET DATE/TIME"));
  lcd.setCursor(0, 1);
  lcd.print(F("> "));
  switch(daySelectIndex) {
    case 0: lcd.print(F("Set Year")); break;
    case 1: lcd.print(F("Set Month")); break;
    case 2: lcd.print(F("Set Day")); break;
    case 3: lcd.print(F("Set Hour")); break;
    case 4: lcd.print(F("Set Minute")); break;
    case 5: lcd.print(F("Save & Exit")); break;
    case 6: lcd.print(F("Exit")); break;
  }
}

void handleSetDateTime() {
  DateTime now = rtc.now();
  
  switch (daySelectIndex) {
    case 0: // Set Year
      lcd.clear();
      lcd.print(F("Set Year:"));
      lcd.setCursor(0, 1);
      lcd.print(setYear);
      if (buttonPressed(btnUp)) setYear++;
      if (buttonPressed(btnDown)) setYear--;
      if (buttonPressed(btnSelect)) daySelectIndex++;
      if (buttonPressed(btnMenu)) menuState = MAIN_MENU;
      break;
      
    case 1: // Set Month
      lcd.clear();
      lcd.print(F("Set Month:"));
      lcd.setCursor(0, 1);
      lcd.print(setMonth);
      if (buttonPressed(btnUp)) setMonth = (setMonth % 12) + 1;
      if (buttonPressed(btnDown)) setMonth = (setMonth == 1 ? 12 : setMonth - 1);
      if (buttonPressed(btnSelect)) daySelectIndex++;
      if (buttonPressed(btnMenu)) menuState = MAIN_MENU;
      break;
      
    case 2: // Set Day
      lcd.clear();
      lcd.print(F("Set Day:"));
      lcd.setCursor(0, 1);
      lcd.print(setDay);
      if (buttonPressed(btnUp)) setDay = (setDay % 31) + 1;
      if (buttonPressed(btnDown)) setDay = (setDay == 1 ? 31 : setDay - 1);
      if (buttonPressed(btnSelect)) daySelectIndex++;
      if (buttonPressed(btnMenu)) menuState = MAIN_MENU;
      break;
      
    case 3: // Set Hour
      lcd.clear();
      lcd.print(F("Set Hour:"));
      lcd.setCursor(0, 1);
      lcd.print(setHour);
      if (buttonPressed(btnUp)) setHour = (setHour + 1) % 24;
      if (buttonPressed(btnDown)) setHour = (setHour == 0 ? 23 : setHour - 1);
      if (buttonPressed(btnSelect)) daySelectIndex++;
      if (buttonPressed(btnMenu)) menuState = MAIN_MENU;
      break;
      
    case 4: // Set Minute
      lcd.clear();
      lcd.print(F("Set Minute:"));
      lcd.setCursor(0, 1);
      lcd.print(setMinute);
      if (buttonPressed(btnUp)) setMinute = (setMinute + 1) % 60;
      if (buttonPressed(btnDown)) setMinute = (setMinute == 0 ? 59 : setMinute - 1);
      if (buttonPressed(btnSelect)) daySelectIndex++;
      if (buttonPressed(btnMenu)) menuState = MAIN_MENU;
      break;
      
    case 5: // Save & Exit
      rtc.adjust(DateTime(setYear, setMonth, setDay, setHour, setMinute, 0));
      lcd.clear();
      lcd.print(F("Time Saved!"));
      delay(1000);
      menuState = MAIN_MENU;
      daySelectIndex = 0;
      break;
      
    case 6: // Exit without save
      menuState = MAIN_MENU;
      daySelectIndex = 0;
      break;
  }
}

// ================= RELAY HELPER =========================
void setRelayPin(int pin, bool on) {
  if (RELAY_ACTIVE_LOW)
    digitalWrite(pin, on ? LOW : HIGH);
  else
    digitalWrite(pin, on ? HIGH : LOW);

  if (SIMULATE_RELAY_WITH_LED) {
    if (LED_ACTIVE_LOW)
      digitalWrite(pin, on ? LOW : HIGH);
    else
      digitalWrite(pin, on ? HIGH : LOW);
  }

  if (pin == relay1) relay1On = on;
  if (pin == relay2) relay2On = on;
}

// ==================== DISPLAY MENUS =====================
const char* dayNames[7] = {"Sun","Mon","Tue","Wed","Thu","Fri","Sat"};

void displaySubMenu() {
  lcd.clear();
  if (menuState == MAIN_MENU) {
    lcd.setCursor(0,0); lcd.print(F("MAIN MENU:"));
    lcd.setCursor(0,1);
    const char* items[5] = { "CURRENT","VOLTAGE","MODE","SET TIME","TIME CORR" };
    lcd.print("> "); lcd.print(items[mainIndex]);
  }
  else if (menuState == CURRENT_MENU) {
    lcd.setCursor(0,0); lcd.print(F("CURRENT MENU:"));
    lcd.setCursor(0,1);
    const char* items[5] = { "Upper","Lower","Set","Reset","Return" };
    lcd.print("> "); lcd.print(items[currentSubIndex]);
  }
  else if (menuState == VOLTAGE_MENU) {
    lcd.setCursor(0,0); lcd.print(F("VOLTAGE MENU:"));
    lcd.setCursor(0,1);
    const char* items[5] = { "Upper","Lower","Set","Reset","Return" };
    lcd.print("> "); lcd.print(items[voltageSubIndex]);
  }
  else if (menuState == MODE_MENU) {
    lcd.setCursor(0,0); lcd.print(F("MODE: "));
    if      (currentMode == MODE_CYCLIC)       lcd.print(F("Cyclic     "));
    else if (currentMode == MODE_SEQUENTIAL)   lcd.print(F("Sequential "));
    else if (currentMode == MODE_PROGRAMMABLE) lcd.print(F("Program    "));
    else if (currentMode == MODE_WLC)          lcd.print(F("WLC        "));

    lcd.setCursor(0,1);
    const char* modes[5] = { "Cyclic","Sequential","Program","WLC","Return" };
    lcd.print("> "); lcd.print(modes[modeSubIndex]);
  }
  else if (menuState == CYCLIC_MENU) {
    lcd.setCursor(0,0); lcd.print(F("CYCLIC MODE:"));
    lcd.setCursor(0,1);
    if (cyclicSubIndex == 0) {
      lcd.print("Run: "); lcd.print(tempCyclicOnTime/1000); lcd.print(F("s"));
    } else if (cyclicSubIndex == 1) {
      lcd.print("Rest: "); lcd.print(tempCyclicOffTime/1000); lcd.print(F("s"));
    } else if (cyclicSubIndex == 2) {
      lcd.print(F("> Set"));
    } else {
      lcd.print(F("> Exit"));
    }
  }
  else if (menuState == SEQUENTIAL_MENU) {
    lcd.setCursor(0,0); lcd.print(F("SEQ MODE:"));
    lcd.setCursor(0,1);
    if (seqMenuIndex == 0) {
      lcd.print(F("R1: ")); lcd.print(tempSeqDurations[0]/1000); lcd.print(F("s"));
    } else if (seqMenuIndex == 1) {
      lcd.print(F("R2: ")); lcd.print(tempSeqDurations[1]/1000); lcd.print(F("s"));
    } else if (seqMenuIndex == 2) {
      lcd.print(F("> Set"));
    } else {
      lcd.print(F("> Exit"));
    }
  }
  else if (menuState == PROGRAM_MENU) {
    lcd.setCursor(0,0); lcd.print(F("PROGRAM MENU:"));
    lcd.setCursor(0,1);
    const char* items[4] = { "Prg1","Prg2","Prg3","Return" };
    lcd.print(F("> ")); lcd.print(items[programMenuIndex]);
  }
  else if (menuState == PROGRAM_EDIT) {
    lcd.setCursor(0,0);
    lcd.print(F("Prg")); lcd.print(programMenuIndex+1); lcd.print(F(" "));

    switch (programFieldIndex) {
      case 0:
        lcd.print(F("Active:"));
        lcd.setCursor(0,1); lcd.print(tempProgram.active ? "ON" : "OFF");
        break;
      case 1:
        lcd.print(F("Day:"));
        lcd.setCursor(0,1); lcd.print(dayNames[tempProgram.dayOfWeek]);
        break;
      case 2:
        lcd.print(F("On Hr:"));
        lcd.setCursor(0,1);
        if (tempProgram.onHour < 10) lcd.print('0');
        lcd.print(tempProgram.onHour);
        break;
      case 3:
        lcd.print(F("On Min:"));
        lcd.setCursor(0,1);
        if (tempProgram.onMinute < 10) lcd.print('0');
        lcd.print(tempProgram.onMinute);
        break;
      case 4:
        lcd.print(F("Off Hr:"));
        lcd.setCursor(0,1);
        if (tempProgram.offHour < 10) lcd.print('0');
        lcd.print(tempProgram.offHour);
        break;
      case 5:
        lcd.print(F("Off Min:"));
        lcd.setCursor(0,1);
        if (tempProgram.offMinute < 10) lcd.print('0');
        lcd.print(tempProgram.offMinute);
        break;
      case 6:
        lcd.print(F("R1:"));
        lcd.setCursor(0,1); lcd.print(tempProgram.relay1 ? "ON" : "OFF");
        break;
      case 7:
        lcd.print(F("R2:"));
        lcd.setCursor(0,1); lcd.print(tempProgram.relay2 ? "ON" : "OFF");
        break;
      case 8:
        lcd.print(F("Save?"));
        lcd.setCursor(0,1); lcd.print(F("> Select"));
        break;
      case 9:
        lcd.print(F("Back"));
        lcd.setCursor(0,1); lcd.print(F("> Select"));
        break;
    }
  }
  else if (menuState == WLC_MENU) {
    lcd.setCursor(0,0); lcd.print(F("WLC MODE:"));
    lcd.setCursor(0,1);
    const char* items[3] = {"Float Opt","Ultra Opt","Return"};
    lcd.print(F("> ")); lcd.print(items[wlcMenuIndex]);
  }
  else if (menuState == WLC_ADJUST) {
    lcd.setCursor(0,0);
    if (wlcEditSubMode == 0) lcd.print(F("FLOAT "));
    else                     lcd.print(F("ULTRA "));

    if (wlcParamIndex == 0) {
      lcd.print(F("Start:"));
      lcd.setCursor(0,1); lcd.print(tempStartLevelM,2); lcd.print(F(" m"));
    } else if (wlcParamIndex == 1) {
      lcd.print(F("End  :"));
      lcd.setCursor(0,1); lcd.print(tempEndLevelM,2); lcd.print(F(" m"));
    } else if (wlcParamIndex == 2) {
      lcd.print(F("Save?"));
      lcd.setCursor(0,1); lcd.print(F("> Select"));
    } else if (wlcParamIndex == 3) {
      lcd.print(F("Back"));
      lcd.setCursor(0,1); lcd.print(F("> Select"));
    }
  }
  else if (menuState == TIME_CORRECTION_MENU) {
    lcd.clear();
    lcd.setCursor(0,0);
    lcd.print(F("TIME CORRECTION"));
    lcd.setCursor(0,1);
    
    if (timeCorrectionSeconds == 0) {
      lcd.print(F("> 0 sec"));
    } else if (timeCorrectionSeconds > 0) {
      lcd.print(F("> +"));
      lcd.print(timeCorrectionSeconds);
      lcd.print(F(" sec"));
    } else {
      lcd.print(F("> "));
      lcd.print(timeCorrectionSeconds);
      lcd.print(F(" sec"));
    }
  }
}

// ================= MODE LOGIC ===========================
void handleModes() {
  DateTime now = getCorrectedDateTime();
  
  // ---------- TRIP / NO INPUT ----------
  if (systemState != SYS_NORMAL) {
    if (!relaysForcedOff) {
      setRelayPin(relay1, false);
      setRelayPin(relay2, false);
      relayOffTimestamp = millis();
      relaysForcedOff = true;
      modeTimerRunning = false;
    }
    return;
  }

  // ---------- BACK TO NORMAL ----------
  relaysForcedOff = false;

  static bool relaysOn = false;
  static unsigned long lastToggle = 0;

  static int seqIndex = 0;
  static unsigned long seqStart = 0;
  static bool seqActive = false;

  switch (currentMode) {

    case MODE_CYCLIC: {
      unsigned long interval = relaysOn ? currentSettings.cyclicOnTime
                                        : currentSettings.cyclicOffTime;

      if (!modeTimerRunning) {
        modeTimerStart = millis();
        modeDuration = interval;
        modeTimerRunning = true;
      }

      if (millis() - lastToggle >= interval) {
        relaysOn = !relaysOn;
        setRelayPin(relay1, relaysOn);
        setRelayPin(relay2, relaysOn);
        lastToggle = millis();
        modeTimerStart = millis();
        modeDuration = relaysOn ? currentSettings.cyclicOnTime : currentSettings.cyclicOffTime;
      }
      break;
    }

    case MODE_SEQUENTIAL: {
      if (!seqActive) {
        setRelayPin(relay1, false);
        setRelayPin(relay2, false);
        int pin = (seqIndex == 0) ? relay1 : relay2;
        setRelayPin(pin, true);
        seqStart = millis();
        seqActive = true;
        modeTimerStart = millis();
        modeDuration = currentSettings.seqDurations[seqIndex];
        modeTimerRunning = true;
      } else {
        unsigned long dur = currentSettings.seqDurations[seqIndex];
        if (millis() - seqStart >= dur) {
          int pin = (seqIndex == 0) ? relay1 : relay2;
          setRelayPin(pin, false);
          seqIndex = (seqIndex + 1) % 2;
          seqActive = false;
          modeTimerRunning = false;
        }
      }
      break;
    }

    case MODE_PROGRAMMABLE: {
      int currentDay = now.dayOfTheWeek();
      int currentHour = now.hour();
      int currentMinute = now.minute();
      int currentMinutes = currentHour * 60 + currentMinute;
      
      bool relay1ShouldBeOn = false;
      bool relay2ShouldBeOn = false;
      
      for (int i = 0; i < MAX_PROGRAMS; i++) {
        ProgramSlot &p = currentSettings.programs[i];
        if (!p.active) continue;
        if (p.dayOfWeek != currentDay) continue;
        
        int onMinutes = p.onHour * 60 + p.onMinute;
        int offMinutes = p.offHour * 60 + p.offMinute;
        
        bool inTimeSlot;
        if (onMinutes <= offMinutes) {
          inTimeSlot = (currentMinutes >= onMinutes && currentMinutes < offMinutes);
        } else {
          inTimeSlot = (currentMinutes >= onMinutes || currentMinutes < offMinutes);
        }
        
        if (inTimeSlot) {
          if (p.relay1) relay1ShouldBeOn = true;
          if (p.relay2) relay2ShouldBeOn = true;
        }
      }
      
      setRelayPin(relay1, relay1ShouldBeOn);
      setRelayPin(relay2, relay2ShouldBeOn);
      modeTimerRunning = false;
      break;
    }

    case MODE_WLC:
      setRelayPin(relay1, true);
      setRelayPin(relay2, true);
      modeTimerRunning = false;
      break;
  }
}

// ================= MENU BUTTON HANDLERS =================
void handleMenuButton() {
  if (millis() - lastDebounceTime < debounceDelay) return;
  lastDebounceTime = millis();
  lastInteraction  = millis();

  if (menuState == IDLE_DISPLAY) {
    menuState = MAIN_MENU;
    displaySubMenu();
    return;
  }

  switch (menuState) {
    case MAIN_MENU:
      mainIndex = (mainIndex + 1) % 5;
      displaySubMenu();
      break;
    case CURRENT_MENU:
      currentSubIndex = (currentSubIndex + 1) % 5;
      displaySubMenu();
      break;
    case VOLTAGE_MENU:
      voltageSubIndex = (voltageSubIndex + 1) % 5;
      displaySubMenu();
      break;
    case MODE_MENU:
      modeSubIndex = (modeSubIndex + 1) % 5;
      displaySubMenu();
      break;
    case CYCLIC_MENU:
      cyclicSubIndex = (cyclicSubIndex + 1) % 4;
      displaySubMenu();
      break;
    case SEQUENTIAL_MENU:
      seqMenuIndex = (seqMenuIndex + 1) % 4;
      displaySubMenu();
      break;
    case PROGRAM_MENU:
      programMenuIndex = (programMenuIndex + 1) % 4;
      displaySubMenu();
      break;
    case PROGRAM_EDIT:
      programFieldIndex = (programFieldIndex + 1) % 10;
      displaySubMenu();
      break;
    case WLC_MENU:
      wlcMenuIndex = (wlcMenuIndex + 1) % 3;
      displaySubMenu();
      break;
    case WLC_ADJUST:
      wlcParamIndex = (wlcParamIndex + 1) % 4;
      displaySubMenu();
      break;
    case SET_DATE_TIME_MENU:
      daySelectIndex = (daySelectIndex + 1) % 7;
      displaySetDateTimeMenu();
      break;
    case TIME_CORRECTION_MENU:
      timeCorrectionIndex = (timeCorrectionIndex + 1) % 3;
      displaySubMenu();
      break;
    default:
      break;
  }
}

void handleSelectButton() {
  if (millis() - lastDebounceTime < debounceDelay) return;
  lastDebounceTime = millis();
  lastInteraction  = millis();

  switch (menuState) {
    case MAIN_MENU:
      if (mainIndex == 3) {
        menuState = SET_DATE_TIME_MENU;
        daySelectIndex = 0;
        DateTime now = rtc.now();
        setYear = now.year();
        setMonth = now.month();
        setDay = now.day();
        setHour = now.hour();
        setMinute = now.minute();
        displaySetDateTimeMenu();
      } else if (mainIndex == 4) {
        menuState = TIME_CORRECTION_MENU;
        displaySubMenu();
      } else {
        menuState = (mainIndex == 0) ? CURRENT_MENU :
                    (mainIndex == 1 ? VOLTAGE_MENU : MODE_MENU);
        displaySubMenu();
      }
      break;

    case CURRENT_MENU: {
      int idx = currentSubIndex;
      if (idx==0 || idx==1) {
        tempCurrentUpper = currentSettings.currentUpper;
        tempCurrentLower = currentSettings.currentLower;
        currentModified  = false;
        menuState        = CURRENT_ADJUST;
        displayAdjustScreen();
      } else if (idx==2) {
        if (currentModified) {
          currentSettings.currentUpper = tempCurrentUpper;
          currentSettings.currentLower = tempCurrentLower;
          saveSettings();
        }
        currentModified = false;
        menuState = IDLE_DISPLAY;
        displayIdle();
      } else if (idx==3) {
        currentSettings.currentUpper = 15.0;
        currentSettings.currentLower = 0.0;
        saveSettings();
        menuState = IDLE_DISPLAY;
        displayIdle();
      } else if (idx==4) {
        menuState = MAIN_MENU;
        displaySubMenu();
      }
      break;
    }

    case VOLTAGE_MENU: {
      int idx = voltageSubIndex;
      if (idx==0 || idx==1) {
        tempVoltageUpper = currentSettings.voltageUpper;
        tempVoltageLower = currentSettings.voltageLower;
        voltageModified  = false;
        menuState        = VOLTAGE_ADJUST;
        displayAdjustScreen();
      } else if (idx==2) {
        if (voltageModified) {
          currentSettings.voltageUpper = tempVoltageUpper;
          currentSettings.voltageLower = tempVoltageLower;
          saveSettings();
        }
        voltageModified = false;
        menuState = IDLE_DISPLAY;
        displayIdle();
      } else if (idx==3) {
        currentSettings.voltageUpper = 250.0;
        currentSettings.voltageLower = 180.0;
        saveSettings();
        menuState = IDLE_DISPLAY;
        displayIdle();
      } else if (idx==4) {
        menuState = MAIN_MENU;
        displaySubMenu();
      }
      break;
    }

    case MODE_MENU:
      if (modeSubIndex == 4) {
        menuState = MAIN_MENU;
        displaySubMenu();
      } else if (modeSubIndex == 0) {
        tempCyclicOnTime  = currentSettings.cyclicOnTime;
        tempCyclicOffTime = currentSettings.cyclicOffTime;
        cyclicSubIndex    = 0;
        menuState         = CYCLIC_MENU;
        displaySubMenu();
      } else if (modeSubIndex == 1) {
        for (int i=0;i<2;i++) tempSeqDurations[i] = currentSettings.seqDurations[i];
        seqMenuIndex = 0;
        seqModified  = false;
        menuState    = SEQUENTIAL_MENU;
        displaySubMenu();
      } else if (modeSubIndex == 2) {
        programMenuIndex = 0;
        menuState        = PROGRAM_MENU;
        displaySubMenu();
      } else if (modeSubIndex == 3) {
        wlcMenuIndex = 0;
        menuState    = WLC_MENU;
        displaySubMenu();
      }
      break;

    case CYCLIC_MENU:
      if (cyclicSubIndex == 2) {
        currentSettings.cyclicOnTime  = tempCyclicOnTime;
        currentSettings.cyclicOffTime = tempCyclicOffTime;
        currentSettings.mode          = MODE_CYCLIC;
        currentMode                   = MODE_CYCLIC;
        saveSettings();
        menuState = IDLE_DISPLAY;
        displayIdle();
      } else if (cyclicSubIndex == 3) {
        menuState = MODE_MENU;
        displaySubMenu();
      }
      break;

    case SEQUENTIAL_MENU:
      if (seqMenuIndex == 2) {
        for (int i=0;i<2;i++) currentSettings.seqDurations[i] = tempSeqDurations[i];
        currentSettings.mode = MODE_SEQUENTIAL;
        currentMode          = MODE_SEQUENTIAL;
        saveSettings();
        menuState = IDLE_DISPLAY;
        displayIdle();
      } else if (seqMenuIndex == 3) {
        menuState = MODE_MENU;
        displaySubMenu();
      }
      break;

    case PROGRAM_MENU:
      if (programMenuIndex == 3) {
        menuState = MODE_MENU;
        displaySubMenu();
      } else {
        tempProgram       = currentSettings.programs[programMenuIndex];
        programFieldIndex = 0;
        programModified   = false;
        menuState         = PROGRAM_EDIT;
        displaySubMenu();
      }
      break;

    case PROGRAM_EDIT:
      if (programFieldIndex == 8) {
        currentSettings.programs[programMenuIndex] = tempProgram;
        currentSettings.mode = MODE_PROGRAMMABLE;
        currentMode          = MODE_PROGRAMMABLE;
        saveSettings();
        menuState = IDLE_DISPLAY;
        displayIdle();
      } else if (programFieldIndex == 9) {
        menuState = PROGRAM_MENU;
        displaySubMenu();
      }
      break;

    case WLC_MENU:
      if (wlcMenuIndex == 2) {
        menuState = MODE_MENU;
        displaySubMenu();
      } else {
        wlcEditSubMode = (wlcMenuIndex == 0) ? 0 : 1;
        if (wlcEditSubMode == 0) {
          tempStartLevelM = currentSettings.floatStartLevelM;
          tempEndLevelM   = currentSettings.floatEndLevelM;
        } else {
          tempStartLevelM = currentSettings.ultraStartLevelM;
          tempEndLevelM   = currentSettings.ultraEndLevelM;
        }
        wlcParamIndex = 0;
        wlcModified   = false;
        menuState     = WLC_ADJUST;
        displaySubMenu();
      }
      break;

    case WLC_ADJUST:
      if (wlcParamIndex == 2) {
        if (wlcEditSubMode == 0) {
          currentSettings.floatStartLevelM = tempStartLevelM;
          currentSettings.floatEndLevelM   = tempEndLevelM;
        } else {
          currentSettings.ultraStartLevelM = tempStartLevelM;
          currentSettings.ultraEndLevelM   = tempEndLevelM;
        }
        currentSettings.wlcActiveSubMode = wlcEditSubMode;
        currentSettings.mode             = MODE_WLC;
        currentMode                      = MODE_WLC;
        saveSettings();
        menuState = IDLE_DISPLAY;
        displayIdle();
      } else if (wlcParamIndex == 3) {
        menuState = WLC_MENU;
        displaySubMenu();
      }
      break;

    case CURRENT_ADJUST:
      menuState = CURRENT_MENU;
      displaySubMenu();
      break;

    case VOLTAGE_ADJUST:
      menuState = VOLTAGE_MENU;
      displaySubMenu();
      break;

    case SET_DATE_TIME_MENU:
      handleSetDateTime();
      break;

    case TIME_CORRECTION_MENU:
      timeCorrectionSeconds += increase ? 60 : -60;
      if (timeCorrectionSeconds > 7200) timeCorrectionSeconds = 7200;
      if (timeCorrectionSeconds < -7200) timeCorrectionSeconds = -7200;
      displaySubMenu();
      break;

    default:
      break;
  }
}

// ================= UPDATE POWER SCREEN ==================
void updatePowerScreen() {
  if (menuState != IDLE_DISPLAY) return;
  unsigned long nowMs = millis();
  if (nowMs - lastUpdate < updateInterval) return;
  lastUpdate = nowMs;

  long sum = 0;
  const int samples = 50;
  for (int i=0;i<samples;i++) {
    sum += analogRead(analogPin);
    delay(2);
  }
  float adcValue = sum / (float)samples;

  float Vpin_mV_first = adcValue * (Vref_LOW / 1023.0) * 1000.0;
  float Vin_mV_first  = Vpin_mV_first * ((R1+R2)/R2);
  float Vout_first    = A_CAL * Vin_mV_first + B_CAL;
  float Vref_used     = (Vout_first > 100.0) ? Vref_HIGH : Vref_LOW;

  float Vpin_mV = adcValue * (Vref_used / 1023.0) * 1000.0;
  float Vin_mV  = Vpin_mV * ((R1+R2)/R2);
  Voltage_V     = A_CAL * Vin_mV + B_CAL;
  if (Voltage_V < 0.0) Voltage_V = 0.0;

  float instant_mA = readCurrent_mA();
  smoothCurrent_mA = (EMA_ALPHA * instant_mA) + ((1.0f-EMA_ALPHA)*smoothCurrent_mA);
  Current_A        = smoothCurrent_mA / 1000.0;
  Power_W          = Voltage_V * Current_A;

  // Detect motor running state
  bool motorNowRunning = (Current_A > 1.0); // Threshold for motor detection
  
  // Track motor state changes and energy
  if (motorNowRunning && !motorRunning) {
    motorRunning = true;
    motorStartTime = millis();
  } else if (!motorNowRunning && motorRunning) {
    motorRunning = false;
    unsigned long runtime = millis() - motorStartTime;
    float energyUsed = Power_W * (runtime / 3600000.0) / 1000.0; // kWh
    totalEnergyKWh += energyUsed;
  }
  
  // Calculate energy while motor is running
  if (motorRunning) {
    unsigned long runtime = millis() - motorStartTime;
    float energyThisSecond = Power_W / 3600000.0; // kWh per second
    totalEnergyKWh += energyThisSecond;
  }

  // Determine system state
  SystemState newState;
  bool vHigh = false, vLow = false, iHigh = false, iLow = false;

  if (Voltage_V < 50.0) {
    newState = SYS_NO_INPUT;
  } else {
    if (Voltage_V > currentSettings.voltageUpper) vHigh = true;
    if (Voltage_V < currentSettings.voltageLower) vLow  = true;
    if (Current_A > currentSettings.currentUpper) iHigh = true;
    if (Current_A < currentSettings.currentLower && currentSettings.currentLower > 0.0) iLow = true;

    if (vHigh || vLow || iHigh || iLow) {
      newState = SYS_TRIP;
    } else {
      newState = SYS_NORMAL;
    }
  }

  if (newState == SYS_TRIP && systemState != SYS_TRIP) {
    tripStartMillis = millis();
    lastVHigh = vHigh;
    lastVLow  = vLow;
    lastIHigh = iHigh;
    lastILow  = iLow;
  }

  systemState = newState;

  // -------- Display logic --------
  // Case 1: NO INPUT
  if (systemState == SYS_NO_INPUT) {
    lcd.clear();
    lcd.setCursor(0,0);
    lcd.print(F("NO INPUT       "));
    printTime24(4,1);
    lcd.print(F("          "));
    return;
  }

  // Case 2: TRIP (show for 5 seconds)
  if (systemState == SYS_TRIP && (millis() - tripStartMillis) < 5000UL) {
    lcd.clear();
    lcd.setCursor(0,0);
    if (lastVHigh)      lcd.print(F("TRIP V HIGH  "));
    else if (lastVLow)  lcd.print(F("TRIP V LOW   "));
    else if (lastIHigh) lcd.print(F("TRIP I HIGH  "));
    else if (lastILow)  lcd.print(F("TRIP I LOW   "));
    else                lcd.print(F("TRIP!        "));

    lcd.setCursor(0,1);
    lcd.print(F("V:"));
    lcd.print(Voltage_V,0);
    lcd.print(F(" I:"));
    lcd.print(Current_A,2);
    lcd.print(F(" "));
    printTime24(13,1);
    return;
  }

  // Case 3: NORMAL → alternate 2 pages every 5s
  if (millis() - lastScreenToggle >= 5000UL) {
    screenPage = 1 - screenPage;
    lastScreenToggle = millis();
  }

  lcd.clear();
  if (screenPage == 0) {
    // Page 0: V / I, P + time
    lcd.setCursor(0,0);
    lcd.print(F("V:"));
    lcd.print(Voltage_V,1);
    lcd.print(F(" I:"));
    lcd.print(Current_A,2);

    lcd.setCursor(0,1);
    lcd.print(F("P:"));
    lcd.print(Power_W,0);
    lcd.print(F("W "));
    printTime24(10,1);
  } else {
    // Page 1: Relay statuses + Mode + Timer
    lcd.setCursor(0,0);
    lcd.print(F("R1:"));
    lcd.print(relay1On ? "ON " : "OFF");
    lcd.print(F(" R2:"));
    lcd.print(relay2On ? "ON" : "OFF");

    lcd.setCursor(0,1);
    
    char modeStr[5];
    switch (currentMode) {
      case MODE_CYCLIC: strcpy(modeStr, "CYC"); break;
      case MODE_SEQUENTIAL: strcpy(modeStr, "SEQ"); break;
      case MODE_PROGRAMMABLE: strcpy(modeStr, "PRG"); break;
      case MODE_WLC: strcpy(modeStr, "WLC"); break;
      default: strcpy(modeStr, "---");
    }
    lcd.print(modeStr);
    
    if (modeTimerRunning && (currentMode == MODE_CYCLIC || currentMode == MODE_SEQUENTIAL)) {
      unsigned long elapsed = millis() - modeTimerStart;
      if (elapsed < modeDuration) {
        unsigned long remaining = modeDuration - elapsed;
        char timeStr[7];
        formatRemainingTime(remaining, timeStr, sizeof(timeStr));
        lcd.setCursor(4,1);
        lcd.print(timeStr);
      }
    }
    
    printTime24(10,1);
  }
}

// ================= ESP32 COMMUNICATION ==================
// NEW: Function to send data to ESP32
void sendDataToESP32() {
  // Create JSON object
  StaticJsonDocument<300> doc;
  
  // Add all sensor data
  doc["voltage"] = Voltage_V;
  doc["current"] = Current_A;
  doc["power"] = Power_W;
  doc["energy"] = totalEnergyKWh; // Total energy in kWh
  doc["motor_state"] = motorRunning ? "ON" : "OFF";
  doc["relay1"] = relay1On;
  doc["relay2"] = relay2On;
  doc["system_state"] = systemState;
  doc["mode"] = currentMode;
  
  // Add time from RTC
  if (rtcOk) {
    DateTime now = rtc.now();
    doc["hour"] = now.hour();
    doc["minute"] = now.minute();
    doc["second"] = now.second();
    doc["day"] = now.day();
    doc["month"] = now.month();
    doc["year"] = now.year();
  }
  
  doc["timestamp"] = millis();
  
  // Send via Serial to ESP32
  serializeJson(doc, Serial); // IMPORTANT: Use Serial, not Serial2
  Serial.println(); // Newline is the delimiter
  
  // Debug output
  Serial.print("Sent to ESP32: ");
  serializeJson(doc, Serial);
  Serial.println();
}

// ======================== SETUP ========================
void setup() {
#if defined(ESP8266) || defined(ESP32)
  EEPROM.begin(EEPROM_SIZE);
#endif

  Serial.begin(9600); // For ESP32 communication

  lcd.begin(16,2);
  lcd.clear();
  lcd.setCursor(0,0); lcd.print(F("BOOTING..."));
  lcd.setCursor(0,1); lcd.print(F("Please wait"));
  delay(1000);

  pinMode(btnMenu,   INPUT_PULLUP);
  pinMode(btnUp,     INPUT_PULLUP);
  pinMode(btnDown,   INPUT_PULLUP);
  pinMode(btnSelect, INPUT_PULLUP);

  pinMode(relay1, OUTPUT);
  pinMode(relay2, OUTPUT);
  setRelayPin(relay1, false);
  setRelayPin(relay2, false);

  emon1.current(ctPin, ICAL);

  // Initialize RTC
  Wire.begin();
  if (!rtc.begin()) {
    lcd.clear();
    lcd.print(F("RTC FAIL"));
    rtcOk = false;
    delay(2000);
  } else {
    rtcOk = true;
    
    if (!rtc.isrunning()) {
      lcd.clear();
      lcd.setCursor(0,0);
      lcd.print(F("RTC NOT RUNNING"));
      lcd.setCursor(0,1);
      lcd.print(F("Setting time..."));
      
      rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));
      delay(2000);
    }
  }

  loadSettings();

  lastInteraction = millis();
  displayIdle();
  
  Serial.println("Arduino System Ready");
}

// ========================= LOOP ========================
void loop() {
  if (buttonPressed(btnMenu))   handleMenuButton();
  if (buttonPressed(btnSelect)) handleSelectButton();
  if (buttonPressed(btnUp))     handleAdjustment(true);
  if (buttonPressed(btnDown))   handleAdjustment(false);

  if (millis() - lastInteraction > idleTimeout && menuState != IDLE_DISPLAY) {
    displayIdle();
  }

  updatePowerScreen();
  handleModes();
  
  // NEW: Send data to ESP32 every 2 seconds
  if (millis() - lastDataSend > SEND_INTERVAL) {
    sendDataToESP32();
    lastDataSend = millis();
  }
}
