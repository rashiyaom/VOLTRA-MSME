# Terminal 1 — frontend
cd "/Users/omvipulbhairashiya/Downloads/voltra msme/src/frontend"
npm run dev
# Terminal 2 — FastAPI backend
cd "/Users/omvipulbhairashiya/Downloads/voltra msme/src/backend"
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Android APK (frontend is bundled; only the FastAPI backend above is needed at runtime)
cd "/Users/omvipulbhairashiya/Downloads/voltra msme/src/frontend"
npm run android:apk
