# Start VOLTRA MSME

Install dependencies once:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r src/requirements.txt
npm --prefix src/frontend ci
cp .env.example src/backend/.env
```

Start both the FastAPI backend and web app from the repository root:

```bash
npm run dev
```

The app runs at `http://localhost:3000`; the API runs at `http://localhost:8000`. For Android, build from `src/frontend` with `npm run android:apk`. See [the frontend guide](src/frontend/README.md) and [ESP32 gateway guide](docs/ESP32-LAN-GATEWAY.md).
