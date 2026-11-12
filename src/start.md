# VOLTRA MSME development

Run the complete home energy app from the repository root with `npm run dev`.
For the web frontend alone, run `npm run dev --prefix src/frontend`.
For the API alone, activate the project virtual environment and run:

```bash
python -m uvicorn src.backend.main:app --reload --host 0.0.0.0 --port 8000
```

Hardware connection and calibration instructions are in `docs/ESP32-LAN-GATEWAY.md`.
