# VOLTRA MSME — IoT ESP32 Smart Home Energy & Circuit Protection

**Intelligent IoT Electrical Telemetry & Circuit Breaker System**

_ESP32 Smart Home Energy System_

---

## What is VOLTRA MSME?

VOLTRA MSME is an IoT-powered Smart Energy and Autonomous Circuit Protection system built on the ESP32-S3 dual-core microcontroller. It replaces slow mechanical bi-metal circuit breakers with sub-8ms solid-state relays, continuous 50Hz AC waveform sampling, and autonomous overcurrent protection.

> *"Sub-second circuit protection. Autonomous electrical peace of mind."*

---

## Architecture

| Layer | Stack |
|---|---|
| **Frontend** | React 19 + TanStack Router + TailwindCSS v4 + Recharts |
| **Microcontroller / IoT** | ESP32-S3 Dual-Core 240MHz (FreeRTOS, Web BLE GATT, WebSocket) |
| **Backend API** | FastAPI (Python) on `:8000` |
| **Connectivity** | Web Bluetooth GATT API + Wi-Fi WebSocket / REST |
| **Audit & Storage** | IndexedDB local storage + CSV export |

---

## Routes

| URL | Page | Description |
|---|---|---|
| `/` | Home | Cinematic landing, hardware architecture, and protection showcase |
| `/dashboard` | Dashboard | Phone-first homeowner console with 230V AC load telemetry & energy curve |
| `/breakers` | Smart Breakers | 5-branch circuit breaker control with sub-8ms trip actuation |
| `/stream` | Live Stream | High-speed AC waveform oscilloscope and raw ESP32 packet logs |
| `/analytics` | Analytics | 24-hour load profiling, dynamic tariff simulator, and CSV export |
| `/settings` | Settings | Data source, device connections, shared Groq key, and local exports |
| `/login` | Authentication | Homeowner & panel engineer login (Credentials + Google OAuth) |
| `/grid` | Redirect | Automatic redirect to `/dashboard` |

---

## Key Features

- **Sub-8ms Solid-State Tripping**: Zero-crossing triac and latching relay drivers isolate short circuits before plasma arc flash occurs.
- **5-Branch Circuit Monitoring**: Dedicated current transducer telemetry for Living Room HVAC, Kitchen Refrigeration, Lighting, EV Charger, and Utility circuits.
- **Dual Connectivity**: Web Bluetooth GATT for direct local pairing without cloud dependency + Wi-Fi WebSocket for multi-device dashboard control.
- **Overload Guardian**: Autonomous inverse-time overcurrent cut-off protects household wiring from sustained thermal stress while accommodating motor startup inrush.
- **Tariff & Cost Simulator**: Time-of-use rate optimization and dynamic energy billing calculators.

---

## Local Development

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Run test suite
npm test

# Production build
npm run build
```

## Android app

The Capacitor app embeds the production web bundle, so it does not need the Vite server. It still
connects to the FastAPI service for accounts, Groq, and cloud relay operations. On a phone, set the
backend address under **Settings → AI connection** to a deployed HTTPS API or to the computer's LAN
address, such as `http://192.168.1.20:8000`.

```bash
# Run from src/frontend. Requires Java 17 and Android SDK 34.
npm run android:apk

# Generated APK
android/app/build/outputs/apk/debug/app-debug.apk
```

For LAN access, start FastAPI on all interfaces from `src/backend`:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

MongoDB stores user accounts and sessions. Usage history, behavior learning, bill plans, device
preferences, and the optional browser Groq key currently stay in the browser or Android WebView
storage for that device.
