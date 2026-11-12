# Validation performed

Passed in the workspace:

- Host C++ syntax/format checks with ESP32 API stubs, with Blynk enabled,
  disabled, and optional extra datastream publishing enabled.
- Synthetic AC waveforms: RMS value, DC-offset removal, divider sensitivity,
  no-load noise subtraction, zero clamp and low-current cutoff.
- Energy calculation: a constant 1 kW for one hour integrates to 1 kWh;
  a second 500 W channel integrates independently; load-step trapezoidal
  integration and invalid-window / long-gap exclusion pass.
- The firmware JSON response functions produce parseable readings/health;
  totals, units, freshness flags, route registration and CORS preflight pass
  in the host harness.
- Browser-adapter JavaScript syntax, endpoint normalisation, saved endpoint,
  device/API identification, callbacks, failure states and polling/session
  cleanup pass with mocked HTTP responses.

Not performed: compilation against the actual Arduino ESP32 toolchain and
installed Blynk/LCD versions, upload to the ESP32, measurements on the actual
ADC/sensors, sampling timing under actual Wi-Fi load, mDNS discovery on your
network, or integration with your website's unseen source code. The host API
stubs validate language/response logic; they do not prove the ESP32 libraries'
binary/API compatibility or hardware behaviour.

Required on-board acceptance check: upload, open Serial at 115200, verify IP
and /api/ping, verify /api/readings, check missed_ticks / clipping_mask,
calibrate no-load noise, calibrate voltage/current against references, and
exercise both existing website buttons with browser local-network permission.
Check that measurement/LCD/API continue while Blynk or router internet is down.

All watt, kWh and cost values in this build are explicitly estimates based
on assumed PF; no claimed metering accuracy or measured power factor.
