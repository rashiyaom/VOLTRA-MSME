# ESP32 relay control for VOLTRA

The website maps the two monitored loads to the relay virtual pins used by the current firmware.

| Load | Current telemetry | Relay command state | ESP32 GPIO |
| --- | --- | --- | --- |
| Load 1 | V0 | V3 | GPIO 26 |
| Load 2 | V2 | V4 | GPIO 27 |
| Supply voltage | V1 | — | GPIO 35 sensor input |

Create V3 and V4 as integer Blynk datastreams with minimum `0`, maximum `1`, and default `0`. The website sends `1` for relay on and `0` for relay off. The attached firmware uses an active-low relay board, so the ESP32 writes `LOW` for on and `HIGH` for off.

## Recommended fail-safe relay code

Keep the relay output state separate from measured current. A relay can be on while an appliance is idle, so current alone is not a reliable relay-state signal.

```cpp
bool relay1On = false;
bool relay2On = false;

void applyRelay(uint8_t pin, bool &savedState, bool turnOn) {
  savedState = turnOn;
  digitalWrite(pin, turnOn ? RELAY_ON : RELAY_OFF);
}

BLYNK_WRITE(V3) {
  applyRelay(RELAY1_PIN, relay1On, param.asInt() == 1);
}

BLYNK_WRITE(V4) {
  applyRelay(RELAY2_PIN, relay2On, param.asInt() == 1);
}

BLYNK_CONNECTED() {
  // Fail-safe policy: keep both loads off after a reboot and make the
  // cloud state match the actual GPIO outputs.
  applyRelay(RELAY1_PIN, relay1On, false);
  applyRelay(RELAY2_PIN, relay2On, false);
  Blynk.virtualWrite(V3, 0);
  Blynk.virtualWrite(V4, 0);
}
```

This intentionally replaces `Blynk.syncVirtual(V3, V4)`. Syncing restores the last cloud command after a reboot, which can energize an appliance without a new user action. If automatic restoration is a deliberate product requirement, keep `syncVirtual`, label that behavior clearly, and only use it for loads that are safe to resume unattended.

Call `Blynk.config(BLYNK_AUTH_TOKEN)` during setup before any connection attempt, even when the first Wi-Fi connection fails. This lets the later reconnection path initialize Blynk correctly.

## Firmware recommendations

- Rotate the Blynk device token and Wi-Fi password that were included in the shared sketch. Put replacements in a local `secrets.h` file excluded from source control.
- Keep relay outputs off from the first possible setup instructions, before sensor calibration or network connection.
- Do not infer the commanded relay state from ACS current. Report V3/V4 explicitly, as the website now does.
- V3/V4 confirm the cloud command state, not the mechanical position of the relay contacts. For true contact verification, add an electrically isolated auxiliary-contact feedback input and publish it on separate read-only datastreams.
- Avoid long blocking sensor loops where possible. The current measurement cycle occupies the processor for several hundred milliseconds and delays `Blynk.run()`. Sample in shorter windows or use a timer/state machine.
- Validate ADC calibration against a trusted meter. The fixed 3.3 V conversion and single voltage multiplier do not compensate for ESP32 ADC reference variation or sensor offset drift.
- Treat software overcurrent logic as monitoring and supplementary control. Use correctly rated hardware protection, isolation, enclosure, conductor sizing, and a qualified electrician for mains wiring.

## Browser behavior

Enter the replacement device token under **Settings → Device connection → Blynk Cloud**. The token is kept in memory for the browser session and cleared on disconnect. On the Branch Circuits page, the two switches then command V3 and V4. Failed writes roll the UI back, and the next telemetry poll reconciles both switches with the Blynk command values.
