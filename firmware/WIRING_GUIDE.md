# Electrical Wiring Guide - Smart Meter Switcher

## ⚠️ Safety Warning
**Danger: High Voltage (230V AC)**. This system must be installed by a certified electrician. 
Ensure all Main MCBs are OFF before touching any wires.

## 1. Power Circuit (The Heavy Load)
This logic ensures **only one meter** powers the house at a time.

### Components:
- 3x Contactors (2-Pole, 63A, 230V Coil) - Labeled **K1, K2, K3**
- 3x MCBs (2-Pole, 32A/63A) - One for each input meter
- 1x Main Output Busbar (To House Load)

### Wiring Diagram (Interlock Logic):
**Goal:** K1 cannot turn ON if K2 or K3 is strictly ON.

1.  **Meter 1 Line:**
    *   Meter 1 -> MCB 1 -> **Contactor K1 (Input Terminals)**
    *   **Contactor K1 (Output Terminals)** -> House Load Busbar

2.  **Meter 2 Line:**
    *   Meter 2 -> MCB 2 -> **Contactor K2 (Input Terminals)**
    *   **Contactor K2 (Output Terminals)** -> House Load Busbar

3.  **Meter 3 Line:**
    *   Meter 3 -> MCB 3 -> **Contactor K3 (Input Terminals)**
    *   **Contactor K3 (Output Terminals)** -> House Load Busbar

## 2. Control Circuit (The Brain)
This controls the **Coils (A1/A2)** of the contactors. ESP32 sends 3.3V signals to a 4-Channel Relay Module, which switches 230V to the contactor coils.

### Hardware Interlock (Electrical Safety):
*This prevents short circuits even if software fails.*

*   **To Coil K1 (A1):**
    *   Phase -> **Relay 1 (NO)** -> **K2 (NC Aux)** -> **K3 (NC Aux)** -> **K1 (Coil A1)**
    *   *Explanation:* Power only reaches K1 Coil if Relay 1 is ON **AND** K2 is OFF **AND** K3 is OFF.

*   **To Coil K2 (A1):**
    *   Phase -> **Relay 2 (NO)** -> **K1 (NC Aux)** -> **K3 (NC Aux)** -> **K2 (Coil A1)**

*   **To Coil K3 (A1):**
    *   Phase -> **Relay 3 (NO)** -> **K1 (NC Aux)** -> **K2 (NC Aux)** -> **K3 (Coil A1)**

## 3. Sensors Wiring
*   **Voltage Sensor (ZMPT101B):** Connect Parallel to the **Output Busbar** (House Load).
*   **Current Sensor (SCT-013):** Clamp around the **Phase Wire** of the Output Busbar.
