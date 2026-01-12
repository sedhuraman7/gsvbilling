# 🛒 Hardware Shopping List (Smart Meter System)

This list contains everything you need to build the box that controls the meters.

## 1. Core Electronics (The Brain)
| Item | Quantity | Approx Price | Function |
| - | - | - | - |
| **ESP32 Dev Module** (30 pin) | 1 | ₹350 | Main WiFi Controller |
| **4-Channel Relay Module** (5V) | 1 | ₹250 | To switch the big Contactors |
| **DS3231 RTC Module** | 1 | ₹150 | Keeps time correctly even if power cut |
| **5V 2A Power Adapter** (USB) | 1 | ₹150 | To power the ESP32 |

## 2. Power Handling (The Muscle)
*These handle the full house load. Do not buy cheap plastics here.*

| Item | Quantity | Spec | Function |
| - | - | - | - |
| **AC Contactor (2 Pole)** | 3 | **63A / 230V Coil** | Switches the main lines safely. |
| **MCB (Double Pole)** | 3 | 32A or 63A | Protection for each meter line. |
| **Distribution Box** | 1 | 8-12 Way | To house the MCBs and Contactors. |

## 3. Sensors (The Eyes)
| Item | Quantity | Function |
| - | - | - |
| **ZMPT101B Voltage Sensor** | 1 | Measures Voltage (230V) safely |
| **SCT-013-030 (30A)** | 1 | CT Sensor to clip around wire (Current) |

## 4. Wires & Misc
- **Connection Wires:** 4 sq.mm or 6 sq.mm for Main Load.
- **Jumper Wires:** Male-Female for ESP32.
- **Enclosure:** PVC Box (IP65) if placing outside.

## 🔗 Recommended Links (India)
- [Robu.in](https://robu.in/) (Good for ESP32 & Sensors)
- [Amazon.in](https://amazon.in) (For Contactors - Look for brands like L&T, Schneider, or quality Generic like Chint)
