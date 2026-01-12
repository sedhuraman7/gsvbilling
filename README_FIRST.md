# Smart Meter IoT System - Dashboard

## 🚀 How to Run locally

1.  **Start the Dashboard:**
    Open a terminal in this folder and run:
    ```bash
    npm run dev
    ```
    Then open [http://localhost:3000](http://localhost:3000)

2.  **Start the Hardware Simulation:**
    Open **another** terminal window and run:
    ```bash
    node scripts/mock_hardware.js
    ```
    This will start printing random Voltage/Current values to the console (and later to Firebase).

## 🔑 Tenant Login
There are no passwords yet.
*   **Owner View:** Go to `/` (Home)
*   **Tenant View:** Click the link or go to `/tenant`

## 🛠 Troubleshooting
If the server stops, try deleting `.next` folder and running `npm run dev` again.
