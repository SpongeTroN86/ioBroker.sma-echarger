![Logo](../../admin/sma-echarger.png)

# ioBroker.sma-echarger

[English documentation](../../README.md)

## SMA eCharger Adapter für ioBroker

Dieser Adapter bindet deinen **SMA eCharger** (z. B. EVC22-3AC-20) lokal über die HTTPS-JSON-Schnittstelle an ioBroker an. Damit lassen sich Live-Messwerte auslesen, Geräteparameter überwachen sowie Lademodus und Leistungsbegrenzungen direkt steuern.

### Funktionen
* **Live-Messwerte (`Live.*`):** Aktuelle Ladeleistung (`chargingPower`), Gesamt- und Sitzungsenergie (`totalEnergy`, `sessionEnergy`), Fahrzeug-/Ladestatus (`vehicleStatus`), Gerätestatus (`deviceStatus`) sowie Phasenströme (`currentL1`–`currentL3`) und Spannungen (`voltageL1`–`voltageL3`).
* **Geräteparameter (`Parameter.*`):** Automatisches Auslesen der Konfigurationsparameter des SMA eChargers.
* **Steuerung (`Control.*`):**
  * Umschalten des Lademodus (`Control.chargingMode`: Schnellladen, PV-Überschuss, Laden mit Zielvorgabe, Stopp).
  * Einstellen der maximalen Wirkleistung (`Control.inverterMaxPower` / `Control.inverterMaxPowerIn`) und des maximalen Ladestroms (`Control.chargingCurrentLimit`, 6–32 A).
  * Schalten der Ladefreigabe (`Control.chargingRelease`) und Ladesperre (`Control.chargingLock`).
  * **Laden mit Zielvorgabe (`Control.plan*`):**
    1. Gewünschte Energiemenge in kWh über `Control.planTargetEnergy` (`Parameter.Chrg.Plan.En`) festlegen. **Hinweis:** Die Ziel-Energiemenge (`> 0`) darf nicht kleiner sein als die in der aktuellen Sitzung bereits geladene Energie (`Live.sessionEnergy` / 1000), da die Wallbox den Ladevorgang sonst beendet und auf das Fallback *PV-Überschuss* zurückschaltet (wird vom Adapter automatisch abgefangen).
    2. **Entweder** die verbleibende Zeit in Minuten über `Control.planDuration` (`DurTmm`) **oder** den festen Zielzeitpunkt über `Control.planStopTime` (`StopTm`, Unix-Zeitstempel in Sekunden) vorgeben – alternativ kannst du einfach ein lesbares Datum (`DD.MM.YYYY HH:MM` oder `YYYY-MM-DD HH:MM`) in `Control.planTargetTimeInput` eintragen, um den Zeitstempel automatisch berechnen und setzen zu lassen.
    3. `Control.chargingMode` (`Parameter.Chrg.ActChaMod`) auf `4720` (*Laden mit Zielvorgabe*) setzen, um den Ladeplan zu starten.
  * Integrierter 5-Sekunden-Schutz (Rate-Limit) pro Parameter, Duplikat-Filter sowie automatischer Reset auf den aktuellen Wallbox-Wert bei blockierten Befehlen.

### Konfiguration
1. Öffne die Instanz-Einstellungen des Adapters im ioBroker Admin-Panel.
2. Trage die lokale **IP-Adresse** deines SMA eChargers ein.
3. Hinterlege **Benutzername** (`user` zum reinen Auslesen, oder `admin` bzw. ein Installateur-Konto, wenn Leistungsparameter wie `WMax` geschrieben werden sollen) und **Passwort**.
4. Lege das gewünschte **Abfrageintervall** in Sekunden fest (Standard: `15` Sekunden).

### Haftungsausschluss
*SMA* und *eCharger* sind eingetragene Marken der SMA Solar Technology AG. Dieses Projekt ist ein unabhängiger Open-Source-Adapter und steht in keiner Verbindung zur SMA Solar Technology AG.