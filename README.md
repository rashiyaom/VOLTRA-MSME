# VOLTRA MSME

**ESP32 based home energy monitoring and circuit control.** VOLTRA MSME connects a household dashboard to ESP32 telemetry so people can review electrical readings, track circuit use, and manage supported smart breakers.

![VOLTRA home energy dashboard](src/frontend/public/assets/cinematic/last-frame.webp)

## What’s in this repository

- Home energy dashboard for live voltage, current, power, and circuit state.
- ESP32 connectivity over local Wi-Fi, Web Bluetooth, and supported Blynk feeds.
- Circuit controls, telemetry history, usage patterns, bill planning, and a household energy assistant.
- FastAPI services for accounts, telemetry, and assistant requests.
- Android app packaging through Capacitor.
- ESP32 gateway setup and calibration notes in [the gateway guide](docs/ESP32-LAN-GATEWAY.md).

The IBM BOBathon grid risk advisor is maintained as a separate project in the [BOBathon repository](https://github.com/Yash-Bharvada/bob-ai-hackathon-Techtonics).

## Run locally

Requirements: Node.js 22+, Python 3.11+, and npm.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r src/requirements.txt
npm --prefix src/frontend ci
cp .env.example src/backend/.env
npm run dev
```

The development command starts the frontend at `http://localhost:3000` and the API at `http://localhost:8000`. Set MongoDB and Google OAuth values in `src/backend/.env` only if you need those account features. Add a Groq key in the app’s Settings to enable assistant features.

To build the frontend:

```bash
npm run build
```

See [the frontend guide](src/frontend/README.md) for routes, Android packaging, and more setup details.

## ESP32 and measurement notes

The browser can use demo data before a physical device is connected. Readings and energy estimates depend on the sensors, calibration, and firmware configuration. Review the [gateway guide](docs/ESP32-LAN-GATEWAY.md) and [relay control notes](src/frontend/ESP32_RELAY_CONTROL.md) before connecting hardware. Those documents include limitations and electrical safety checks.

## Project identity

This repository contains the VOLTRA MSME smart home energy system. Its UI, API, docs, and setup flow describe home circuits and ESP32 devices. The distribution grid analysis project lives in its own repository, linked above.
