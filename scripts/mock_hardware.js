// SIMULATION SCRIPT
// Run this to pretend you are the ESP32 Hardware

const FIREBASE_URL = "https://smart-billing-system-5c276-default-rtdb.firebaseio.com";
const SIMULATION_INTERVAL = 5000; // 5 seconds

console.log("🔌 Hardware Simulation Started...");
console.log("   Press Ctrl+C to stop.");

let motorStatus = false;

function getRandomVoltage() {
    // Normal voltage is 230V +- 10V
    return (220 + Math.random() * 20).toFixed(1);
}

function getRandomCurrent() {
    if (!motorStatus) return 0.0;
    // Motor takes about 5-8 Amps
    return (5 + Math.random() * 3).toFixed(2);
}

setInterval(async () => {
    // 1. Simulate changing sensors
    const voltage = getRandomVoltage();
    const current = getRandomCurrent();

    // 2. Randomly turn motor ON/OFF every once in a while
    if (Math.random() > 0.8) {
        motorStatus = !motorStatus;
        console.log(`🤖 User toggled motor: ${motorStatus ? 'ON' : 'OFF'}`);
    }

    const payload = {
        voltage: parseFloat(voltage),
        current: parseFloat(current),
        motor_status: motorStatus ? "ON" : "OFF", // Match Firebase key style
        last_updated: new Date().toISOString()
    };

    console.log(`📡 Sending Data: ${voltage}V | ${current}A | Motor: ${motorStatus ? 'ON' : 'OFF'}`);

    // 3. Send to Firebase (Real Cloud Update)
    try {
        const res = await fetch(`${FIREBASE_URL}/system_status.json`, {
            method: 'PUT',
            body: JSON.stringify(payload)
        });
        if (res.ok) console.log("   ✅ Cloud Success!");
        else console.log("   ❌ Cloud Error:", res.status);
    } catch (err) {
        console.log("   ❌ Network Error:", err.message);
    }

}, SIMULATION_INTERVAL);
