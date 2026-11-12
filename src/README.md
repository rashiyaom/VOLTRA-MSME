# Source Code — VOLTRA Smart Energy & Circuit Protection

This repository contains the complete implementation of the **VOLTRA** platform: the React 19 web application, FastAPI backend, and ESP32-S3 IoT firmware services.

---

## Directory Layout

```
src/
├── backend/
│   ├── main.py                    ← FastAPI application for telemetry & auth services
│   ├── auth_router.py             ← JWT + bcrypt + MongoDB Atlas + Google OAuth 2.0
│   └── test_endpoints.py          ← Test suite for API routes
│
└── frontend/                      ← VOLTRA React 19 + TanStack Router console
    ├── package.json               ← Dependencies: React 19, TanStack Router, Recharts, Radix UI
    ├── vite.config.ts             ← Vite build configuration
    ├── tsconfig.json              ← TypeScript compiler configuration
    └── src/
        ├── routes/                ← File-based routing (/, /dashboard, /breakers, /stream, /analytics, /settings, /login)
        ├── components/            ← Reusable UI elements, navigation, modals, and charts
        ├── cinematic/             ← Hero canvas and interactive overlay animations
        ├── services/              ← ESP32 REST, WebSocket, Web Bluetooth, and IndexedDB storage
        └── stores/                ← Authoritative state management (useVoltricsStore)
```

---

## Quickstart

### Frontend (React 19 + TanStack Router)

```bash
cd src/frontend
npm install
npm run dev      # Runs dev server on http://localhost:3000
npm test         # Runs Vitest suite
npm run build    # Produces production build
```

### Backend (FastAPI)

```bash
cd src
pip install -r requirements.txt
python -m uvicorn backend.main:app --reload --port 8000
```
