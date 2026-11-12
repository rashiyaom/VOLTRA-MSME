# VOLTRA MSME frontend guidance

This frontend is the ESP32 based smart home energy monitoring and circuit control app. Keep routes, labels, examples, and visual assets centered on household circuits, energy use, and ESP32 devices. The distribution grid risk advisor belongs to its separate BOBathon repository.

## Stack

- React 19, TanStack Start and Router, Vite, Tailwind CSS v4, Recharts, and Lucide icons.
- FastAPI services for accounts, telemetry, and household assistant requests.
- ESP32 device integration over local Wi-Fi, Web Bluetooth, and configured Blynk data.

Use the existing design tokens and components. Clearly label simulated readings and estimated values. Keep device controls tied to the configured connection state and document hardware assumptions.
