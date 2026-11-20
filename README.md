![Logo](admin/sma-echarger.png)

# ioBroker.sma-echarger

[![NPM version](https://img.shields.io/npm/v/iobroker.sma-echarger.svg)](https://www.npmjs.com/package/iobroker.sma-echarger)
[![Downloads](https://img.shields.io/npm/dm/iobroker.sma-echarger.svg)](https://www.npmjs.com/package/iobroker.sma-echarger)
![Number of Installations](https://iobroker.live/badges/sma-echarger-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/sma-echarger-stable.svg)

[![NPM](https://nodei.co/npm/iobroker.sma-echarger.png?downloads=true)](https://nodei.co/npm/iobroker.sma-echarger/)

**Tests:** ![Test and Release](<https://github.com/SpongeTroN86/ioBroker.sma-echarger/workflows/Test%20and%20Release/badge.svg>)

[German documentation / Deutsche Dokumentation](docs/de/README.md)

## SMA eCharger adapter for ioBroker

This adapter connects your **SMA eCharger** (e.g., EVC22-3AC-20) locally via its HTTPS JSON API to ioBroker. It allows you to monitor live charging values, read device parameters, and control charging modes or power limits.

### Features

* **Live Measurements (`Live.*`):** Current charging power (`chargingPower`), total and session energy (`totalEnergy`, `sessionEnergy`), vehicle/charging status (`vehicleStatus`), device health (`deviceStatus`), phase currents (`currentL1`–`currentL3`), and voltages (`voltageL1`–`voltageL3`).
* **Device Parameters (`Parameter.*`):** Automatic retrieval of all readable SMA eCharger configuration parameters.
* **Remote Control (`Control.*`):**
  * Change the charging mode (`Control.chargingMode`: Fast, PV Surplus, Target Charging, Stop).
  * Adjust maximum active power (`Control.inverterMaxPower` / `Control.inverterMaxPowerIn`) and maximum charging current (`Control.chargingCurrentLimit`, 6–32 A).
  * Enable/disable charging release (`Control.chargingRelease`) and charging lock (`Control.chargingLock`).
  * **Target Charging (`Control.plan*`):**
    1. Set the target energy in kWh via `Control.planTargetEnergy` (`Parameter.Chrg.Plan.En`). **Note:** The target energy (`> 0`) must not be smaller than the already charged session energy (`Live.sessionEnergy` / 1000), otherwise the wallbox stops charging and falls back to *PV Surplus* (protected automatically by the adapter).
    2. Set **either** the remaining duration in minutes via `Control.planDuration` (`DurTmm`) **or** a fixed target time via `Control.planStopTime` (`StopTm`, Unix timestamp in seconds) — alternatively, enter a readable date/time (`DD.MM.YYYY HH:MM` or `YYYY-MM-DD HH:MM`) into `Control.planTargetTimeInput` to calculate and apply it automatically.
    3. Set `Control.chargingMode` (`Parameter.Chrg.ActChaMod`) to `4720` (*Target charging*) to start.
  * Built-in 5-second cooldown per parameter, duplicate filtering, and automatic value reset on blocked commands to protect the wallbox hardware.

### Configuration

1. Open the adapter instance settings in ioBroker.
2. Enter the local **IP address** of your SMA eCharger.
3. Enter your **Username** (`user` for reading values, or `admin` / an installer account if you want to modify inverter power limits like `WMax`) and **Password**.
4. Set the desired **Poll interval** in seconds (default: `15` seconds).

### Disclaimer

*SMA* and *eCharger* are registered trademarks of SMA Solar Technology AG. This project is an independent open-source adapter and is not affiliated with or endorsed by SMA Solar Technology AG.

## Changelog

<!--
    Placeholder for the next version (at the beginning of the line):
    ### **WORK IN PROGRESS**
-->

### **WORK IN PROGRESS

* (SpongeTroN86) **BREAKING CHANGE:** Standardized all `Live.*` and `Control.*` state IDs to English naming conventions (existing scripts and visualizations must be updated)
* (SpongeTroN86) feat: add control states for charging current limit (`AcALim`), charging lock (`ChrgLok`), and target charging plan (`Plan.En`, `Plan.DurTmm`, `Plan.StopTm`)
* (SpongeTroN86) feat: add date-to-epoch helper state (`Control.planTargetTimeInput`)
* (SpongeTroN86) feat: add 5-second rate limit, duplicate filtering, session energy validation, and automatic state reset on blocked commands

### 0.1.12 (2026-11-20)

* (SpongeTroN86) fix: remove specific schedule time from dependabot configuration
  feat: add placeholder for future changes in CHANGELOG_OLD.md

### 0.1.11 (2026-11-19)

* (SpongeTroN86) feat: update README files for improved documentation and add German translation

### 0.1.10 (2026-11-19)

* (SpongeTroN86) Added multi-language support (`de`, `en`, `es`, `fr`, `it`, `nl`, `pl`, `pt`, `ru`, `uk`, `zh-cn`) for states, logs, and configuration.

### 0.1.9 (2026-11-18)

* (SpongeTroN86) Updated README documentation and fixed repository metadata in io-package.json

### 0.1.1 (2026-11-18)

* (SpongeTroN) initial release

## License

MIT License

Copyright (c) 2026 SpongeTroN <rolf@bunter-waeschekorb.de>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
