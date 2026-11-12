# VOLTRA ESP32 LAN Gateway + Blynk firmware

This replaces the supplied two-load sketch. It keeps the existing Blynk V0/V1/V2
mapping and adds a read-only HTTP API for the existing website's LAN gateway.
No separate ADC board is needed: analogReadMilliVolts uses the ESP32's internal ADC.

## 1. Hardware and dependencies

Target **original dual-core ESP32 / ESP32-WROOM-32 / ESP32 Dev Module**.
These pins do not transfer unchanged to an ESP32-S3, C3 or other board.

| Connection | ESP32 GPIO |
|---|---:|
| ACS712 load 1 analog output | 34 |
| ACS712 load 2 analog output | 32 |
| ZMPT analog output | 35 |
| LCD SDA | 21 |
| LCD SCL | 22 |

Install `esp32 by Espressif Systems` in Arduino IDE's Boards Manager.
Install `Blynk` and the same `LiquidCrystal_I2C` library used by your original
sketch. The latter must support `LiquidCrystal_I2C(0x27,16,2)`, `init()` and
`backlight()`. WiFi, WebServer, ESPmDNS, Preferences and FreeRTOS come with the
ESP32 board package. Set `ENABLE_BLYNK` to 0 if you want a LAN-only build.

Keep `MeterMath.h` beside `VOLTRA_Gateway.ino` in the `VOLTRA_Gateway` folder.
The `.mjs` file belongs to your website frontend and is not flashed to the board.
Open the `.ino`, select the board and USB port, then upload. No Python is required.

Before connecting sensor outputs, verify they remain inside the ESP32 input
limits across the intended operating range. A 5 V ACS712 normally centres at
2.5 V and can exceed the ADC measurement range on positive current peaks.
An output divider affects both the centre and sensitivity. A ZMPT module's
amplified output also needs checking. Attenuation does not provide 5 V protection.
The firmware flags readings outside approximately 0.15–3.05 V as unreliable.
If the LCD backpack pulls SDA/SCL up to 5 V, use appropriate level conversion.
Use properly insulated, enclosed mains hardware; the firmware cannot provide
electrical isolation or protect an unsafe module/wiring arrangement.

## 2. Edit configuration before uploading

Replace:

```cpp
const char WIFI_SSID[] = "10";
const char WIFI_PASSWORD[] = "PASTE_YOUR_WIFI_PASSWORD";
#define BLYNK_AUTH_TOKEN "PASTE_YOUR_NEW_BLYNK_TOKEN"
```

The previously pasted token is deliberately not included in this deliverable.
The existing Blynk template ID/name are retained. A missing token disables cloud
connection attempts while LAN measurement continues.

Also set:

- `ACS_VOLTS_PER_AMP[2]`: effective sensitivity at each ESP32 pin. For nominal
  ACS712-20A at 5 V with no divider, use 0.100 V/A. A 2/3 divider gives about
  0.066667 V/A. Confirm the actual sensor variant and calibrate each channel.
- `VOLTAGE_GAIN`: 766.66 is an initial value from the supplied sketch, not a
  validated value for calibrated millivolt readings. Recalibrate it.
- `ASSUMED_POWER_FACTOR[2]`: defaults to 1.0. This is an assumption, not a
  measured power factor. Motors, LED drivers, chargers and electronic loads
  can differ substantially. Do not claim their energy/cost values are measured.
- `TARIFF_RUPEES_PER_KWH`: defaults to the example value 7.0. This is a flat
  energy-charge estimate, excluding slab logic, taxes and fixed charges.
- `AP_PASSWORD`: change the example password `voltra123`.
- `WEBSITE_ORIGIN`: `*` allows cross-origin read access for the prototype.
  You can set the exact website origin without a trailing slash, e.g.
  `https://your-site.example`. This is CORS restriction, not authentication.

## 3. Get the IP link in Serial Monitor

Set Serial Monitor to **115200 baud**, then reset the ESP32.
The direct AP starts immediately. Router Wi-Fi connects without a waiting loop.
When router Wi-Fi connects, Serial prints something like:

```text
Website endpoint: http://192.168.1.50
Readings: http://192.168.1.50/api/readings
mDNS endpoint: http://voltra.local
Direct AP Wi-Fi: VOLTRA-Gateway
Direct AP endpoint: http://192.168.4.1
```

`192.168.1.50` is an example; use the IP actually printed by your device.
Enter **http://192.168.1.50** or **http://voltra.local** in the website endpoint
field. The frontend then requests `/api/ping` and `/api/readings`.

Your browser computer/phone and ESP32 must share a reachable local network.
Guest Wi-Fi, campus client isolation, VPN routing and some phone hotspots can
prevent clients reaching each other. mDNS availability also varies; the numeric
IP is the fallback. A DHCP reservation in the router stabilises the station IP.

For direct access without a router, connect to `VOLTRA-Gateway` and open
http://192.168.4.1. Its local diagnostics page works without internet.
The ESP32 AP does not route internet to clients. Your cloud-hosted website and
Blynk need their own internet connection; load the website beforehand or use
your network's normal router connection for the usual website workflow.

The link is a LAN link, not a public internet link. It is not reachable from
arbitrary networks and does not automatically open a browser when Serial starts.

## 4. First-run no-load calibration

1. Turn both monitored loads OFF while keeping the ESP32 and sensor electronics
   powered. Do not switch off the voltage reference supply if checking voltage.
2. Send the single letter `c` from Serial Monitor.
3. Keep the loads off until the calibration finishes (about 3 seconds of
   consecutive valid windows). It is saved automatically.
4. Check `/api/readings`: `noise_calibrated` should become true and
   `calibrating` false. If calibration keeps restarting, inspect
   `clipping_mask`, `missed_ticks` and `window_us`.
5. Turn on a known load and compare current and voltage with reference readings.

Calibration measures the no-load **noise variance**, not current sensitivity.
DC offset is removed afresh in every measurement window. This is AC-only logic.
Never calibrate noise with a running load; its waveform would be mistaken for
noise and subsequent current could be severely under-reported. Recalibrate
after changing wiring, sensor supply, divider, filtering or ADC configuration.

Voltage scale update:

```text
new VOLTAGE_GAIN = old VOLTAGE_GAIN × reference voltage / reported voltage
```

Current sensitivity update, independently for each channel:

```text
new volts-per-amp = old volts-per-amp × reported current / reference current
```

Use stable loads well above the noise floor for scale calibration. Check at
multiple load levels rather than adjusting to one reading only. The 0.05 A
cutoff can hide real small/standby currents; lower it only after validating
the sensor/ADC noise floor. More displayed decimal places do not prove accuracy.

Serial commands: `c` calibrates no-load noise, `i` prints links, `s` checkpoints
estimated energy before planned shutdown, `?` prints help. Newline characters
from Serial Monitor are ignored. Calibration is manual, not repeated on reboot.

## 5. API for the existing website

| Request | Purpose |
|---|---|
| `GET /api/ping` | Device identification, IPs, Wi-Fi/Blynk status, HTTP health |
| `GET /api/readings` | Cached measurements and estimated energy/cost |
| `GET /` | Small device-hosted diagnostics page |
| `OPTIONS /any-path` | CORS preflight response |

Aliases: `/api/data`, `/readings`, `/data` return readings; `/ping` and `/health`
return health. These aliases do not prove compatibility with an unseen website.

Principal readings fields:

| JSON field | Meaning |
|---|---|
| `voltage` | Sampled supply AC RMS voltage, V |
| `current1`, `current2` | Noise-corrected sampled AC RMS current, A |
| `apparent_power1_va`, `apparent_power2_va` | Vrms × Irms, VA |
| `power1`, `power2`, `total_power` | **Estimated** watts, using assumed PF |
| `energy1`, `energy2`, `total_energy` | **Estimated** cumulative kWh |
| `cost1`, `cost2`, `total_cost` | **Estimated** INR at the configured flat tariff |
| `power_mode` | Always `estimated_assumed_pf` in this firmware |
| `valid` | Latest sampling window passed range/timing/freshness checks |
| `noise_calibrated`, `calibrating`, `energy_ready` | Calibration / accumulation status |
| `age_ms`, `sequence` | Freshness and sample identity |
| `uptime_ms`, `sample_uptime_ms` | Milliseconds since boot, NOT Unix timestamps |
| `sensor_rms_v`, `sensor_centre_v` | [ZMPT, ACS1, ACS2] voltages at ADC pins |
| `noise_rms_v` | [ACS1, ACS2] stored no-load RMS noise in volts |
| `clipping_mask` | bit 0 = voltage; bit 1 = ACS1; bit 2 = ACS2 |
| `missed_ticks`, `window_us` | Acquisition timing diagnostics |
| `unmeasured_seconds` | Excluded acquisition intervals since this boot |

Plot voltage/current only when `valid` is true. In particular, a JSON number
does not become a valid reading just because it is present. `valid` checks
software-visible timing/range only; it does not certify calibration, electrical
safety, a connected sensor, waveform fidelity, or meter-grade accuracy.
Use browser receive time (`Date.now()`) for graph points. A successful HTTP ping
means the gateway is reachable, not that its sensor readings are trustworthy.

`website-lan-gateway.mjs` is an optional ES-module frontend adapter with endpoint
normalisation, HTTP ping, timeouts, polling, localStorage and status callbacks.
Example wiring to your website's controls:

```js
import { VoltraLanGateway } from './website-lan-gateway.mjs';

const gateway = new VoltraLanGateway({
  onData(data) {
    if (!data.valid) return;
    // Map these fields into your existing graph/data state:
    updateGraphs({ voltage: data.voltage, current1: data.current1,
                   current2: data.current2, time: data.received_at_ms });
    // Label power/energy/cost as estimates if you display them.
  },
  onStatus(status) { updateGatewayStatus(status.message); }
});

async function saveAndLink(endpointInputValue) {
  await gateway.connect(endpointInputValue);
}
async function pingAndConnect() {
  await gateway.connect(); // Uses saved endpoint and resumes polling.
}
// Call gateway.stop() when the component unmounts / user disconnects.
// Catch rejected connect() promises in button handlers to avoid unhandled errors.
```

`updateGraphs` and `updateGatewayStatus` above are placeholders for your actual
website's state setters. If it expects different API paths or key names, map
them in the frontend or alter the firmware to match. The website's source was
not supplied, so its two existing buttons have not themselves been modified.
A normal web page cannot switch the computer's Wi-Fi network; that connection
is made in the operating system. The button performs an HTTP ping, not ICMP.

## 6. Hosted HTTPS websites and browser permission

The ESP32 serves HTTP. Modern Chrome supports public HTTPS websites accessing
local HTTP endpoints behind Local Network Access permission, with exemptions
for private IPs and `.local` names. Allow that permission when your website asks.
The adapter supplies `targetAddressSpace: 'local'` for browsers supporting it.
Behaviour varies by browser and policy; unsupported browsers can block this
as mixed content. CORS and the private-network header alone do not bypass it.

Fetch the ESP32 **from browser-side JavaScript**, not a Vercel/cloud/server API
route: that server cannot reach your home LAN's private IP. If the site's CSP
restricts `connect-src`, add the chosen gateway HTTP origin to that policy.
Do not use `mode: 'no-cors'`; it makes the response unreadable. If LAN access
is unavailable, continue using the existing Blynk source and show LAN offline.
The adapter exposes status; choosing that fallback remains your website logic.

## 7. What the optimisation does, and its limits

- One ADC acquisition task reads the original ADC1 pins using calibrated
  millivolts, paced by a FreeRTOS notification from an ESP timer.
- Target rate is 2 kHz per channel. Three ADC conversions are sequential,
  not simultaneous. The firmware does not calculate waveform real power.
- RMS uses constant-memory running variance over approximately 200 ms;
  offset and AC magnitude come from the same acquisition window.
- HTTP responses, LCD and Blynk use a locked copy of cached readings; HTTP
  requests do not initiate thousands of ADC reads or pause the sampling task.
- ADC clipping, missing timer ticks and stale readings are surfaced. Invalid
  windows and calibration periods are excluded from energy accumulation.
- Estimated energy integrates inside the acquisition task with actual elapsed
  time and trapezoidal integration; main-loop network waits do not stall it.
- LCD fields are padded to 16 columns, avoiding repeated clears/flicker.
- Wi-Fi setup does not wait for internet. The direct AP remains available.
- Blynk uses configuration plus periodic short connection attempts, rather
  than blocking startup with Blynk.begin. Library DNS/TCP behaviour can still
  delay the web/main loop briefly; this is not a hard real-time web server.
- Flash checkpoints occur at calibration and about every 10 minutes, not
  at every sample. Sudden power loss can lose up to that interval of estimates.
  Unpowered periods are not measured. `s` saves before planned power-off.

If `missed_ticks` is persistently nonzero with your core/library combination,
change `SAMPLE_PERIOD_US` from 500 to 1000 and `WINDOW_FRAMES` from 400 to 200,
keeping the same 200 ms window. Verify performance on the actual board rather
than assuming an advertised target rate is achieved. Avoid interpreting aliased
high-frequency noise or heavily distorted waveforms as accurate RMS readings.
Noise-variance subtraction assumes a stable, uncorrelated baseline; it is a
prototype correction, not a guarantee of small-load accuracy.

This version has no measured power factor, real-power metering, AI prediction,
tariff slabs, offline Blynk backfill, relay control or third current channel.
For reliable household energy/cost, use validated time-aligned waveform
measurement with phase calibration or an appropriate energy-metering front end.
Do not put a cosmetic PF constant in place of an actual measurement.

## 8. Blynk datastream mapping

The three existing mappings remain unchanged:

| Virtual pin | Value |
|---|---|
| V0 | Load 1 RMS current, A |
| V1 | Supply RMS voltage, V |
| V2 | Load 2 RMS current, A |

Leave `PUBLISH_EXTRA_BLYNK_FIELDS` at 0 to preserve the existing setup. To send
additional estimates, first create Double datastreams V3–V8 and change it to 1:

| Virtual pin | Estimated value |
|---|---|
| V3 / V4 | Load 1 / 2 watts |
| V5 / V6 | Load 1 / 2 kWh |
| V7 / V8 | Load 1 / 2 INR |

Local JSON contains these fields regardless of the extra Blynk flag. Invalid
readings are not published; the cloud may retain its last value, so your
website should use data age / device connectivity to mark stale cloud data.

## Official references

- ESP32 ADC API: https://docs.espressif.com/projects/arduino-esp32/en/latest/api/adc.html
- ESP32 Wi-Fi AP/STA: https://docs.espressif.com/projects/arduino-esp32/en/latest/api/wifi.html
- ESP32 Preferences: https://docs.espressif.com/projects/arduino-esp32/en/latest/api/preferences.html
- Blynk config/connect: https://docs.blynk.io/en/blynk-library-firmware-api/configuration
- ACS712 datasheet: https://www.allegromicro.com/-/media/Files/Datasheets/ACS712-Datasheet.ashx
- Chrome local network access: https://developer.chrome.com/blog/local-network-access
