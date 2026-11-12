import urllib.request
import json

def test_endpoints():
    base = "http://localhost:8000"

    # 1. Health
    r = urllib.request.urlopen(f"{base}/health")
    data = json.loads(r.read())
    print("=== /health ===")
    print(f"Status: {data.get('status')} | Service: {data.get('service')}")

    # 2. Live Telemetry
    r = urllib.request.urlopen(f"{base}/api/telemetry/live")
    data = json.loads(r.read())
    print("\n=== /api/telemetry/live ===")
    print(f"Voltage: {data['voltage_rms']}V | Current: {data['current_rms']}A | Power: {data['active_power']}W")

    # 3. Circuits
    r = urllib.request.urlopen(f"{base}/api/circuits")
    data = json.loads(r.read())
    print("\n=== /api/circuits ===")
    for c in data['circuits']:
        print(f"  [{c['id']}] {c['name']}: {c['state']} ({c['current']}A / {c['rated_current']}A)")

    # 4. Tariff
    r = urllib.request.urlopen(f"{base}/api/tariff")
    data = json.loads(r.read())
    print("\n=== /api/tariff ===")
    print(f"Base Rate: {data['base_rate_per_kwh']} {data['currency']}/kWh | Slab: {data['current_slab']}")

if __name__ == "__main__":
    try:
        test_endpoints()
    except Exception as e:
        print(f"Endpoint test error: {e}")
