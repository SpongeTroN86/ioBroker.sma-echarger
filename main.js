'use strict';

const utils = require('@iobroker/adapter-core');
const { I18n } = utils;
const axios = require('axios');
const https = require('node:https');
const path = require('node:path');

function getLivePoints() {
	return [
		{
			channel: 'Measurement.Metering.GridMs.TotWIn.ChaSta',
			dp: 'chargingPower',
			name: I18n.getTranslatedObject('Aktuelle Ladeleistung'),
			unit: 'W',
		},
		{
			channel: 'Measurement.Metering.GridMs.TotWhIn.ChaSta',
			dp: 'totalEnergy',
			name: I18n.getTranslatedObject('Geladene Gesamtenergie'),
			unit: 'Wh',
		},
		{
			channel: 'Measurement.ChaSess.WhIn',
			dp: 'sessionEnergy',
			name: I18n.getTranslatedObject('Energie aktuelle Ladung'),
			unit: 'Wh',
		},
		{
			channel: 'Measurement.Operation.EVeh.ChaStt',
			dp: 'vehicleStatus',
			name: I18n.getTranslatedObject('Status Fahrzeug/Ladung'),
			unit: '',
			states: {
				200111: I18n.t('Kabel getrennt'),
				200112: I18n.t('Kabel angeschlossen'),
				200113: I18n.t('wird geladen'),
			},
		},
		{
			channel: 'Measurement.Operation.Health',
			dp: 'deviceStatus',
			name: I18n.getTranslatedObject('Status Wallbox. 307 bedeutet: Alles OK'),
			unit: '',
		},
		{
			channel: 'Measurement.GridMs.A.phsA',
			dp: 'currentL1',
			name: I18n.getTranslatedObject('Ladestrom Phase L1'),
			unit: 'A',
		},
		{
			channel: 'Measurement.GridMs.A.phsB',
			dp: 'currentL2',
			name: I18n.getTranslatedObject('Ladestrom Phase L2'),
			unit: 'A',
		},
		{
			channel: 'Measurement.GridMs.A.phsC',
			dp: 'currentL3',
			name: I18n.getTranslatedObject('Ladestrom Phase L3'),
			unit: 'A',
		},
		{
			channel: 'Measurement.GridMs.PhV.phsA',
			dp: 'voltageL1',
			name: I18n.getTranslatedObject('Voltage phase L1'),
			unit: 'V',
		},
		{
			channel: 'Measurement.GridMs.PhV.phsB',
			dp: 'voltageL2',
			name: I18n.getTranslatedObject('Spannung Phase L2'),
			unit: 'V',
		},
		{
			channel: 'Measurement.GridMs.PhV.phsC',
			dp: 'voltageL3',
			name: I18n.getTranslatedObject('Spannung Phase L3'),
			unit: 'V',
		},
		// Hier einfach weitere Kanäle ergänzen...
	];
}

function getControlStates() {
	return [
		{
			id: 'Control.planTargetTimeInput',
			channelId: '',
			initial: '',
			common: {
				name: I18n.getTranslatedObject('Zielzeitpunkt eingeben (DD.MM.YYYY HH:MM oder YYYY-MM-DD HH:MM)'),
				type: 'string',
				role: 'text',
				read: true,
				write: true,
			},
		},
		{
			id: 'Control.chargingCurrentLimit',
			channelId: 'Parameter.Inverter.AcALim',
			initial: 16,
			common: {
				name: I18n.getTranslatedObject('Maximaler Ladestrom in Ampere'),
				type: 'number',
				role: 'level.current',
				unit: 'A',
				min: 6,
				max: 32,
				read: true,
				write: true,
			},
		},
		{
			id: 'Control.chargingLock',
			channelId: 'Parameter.Chrg.ChrgLok',
			initial: 1129,
			common: {
				name: I18n.getTranslatedObject('Ladesperre aktivieren'),
				type: 'number',
				role: 'level',
				read: true,
				write: true,
				states: {
					1129: I18n.t('Entsperrt'),
					1130: I18n.t('Gesperrt'),
				},
			},
		},
		{
			id: 'Control.planTargetEnergy',
			channelId: 'Parameter.Chrg.Plan.En',
			initial: 0,
			common: {
				name: I18n.getTranslatedObject('Ladeplan Energiemenge (Wh)'),
				type: 'number',
				role: 'level.energy',
				unit: 'kWh',
				min: 0,
				read: true,
				write: true,
			},
		},
		{
			id: 'Control.planDuration',
			channelId: 'Parameter.Chrg.Plan.DurTmm',
			initial: 0,
			common: {
				name: I18n.getTranslatedObject('Ladeplan Dauer in Minuten'),
				type: 'number',
				role: 'level.timer',
				unit: 'min',
				min: 0,
				read: true,
				write: true,
			},
		},
		{
			id: 'Control.planStopTime',
			channelId: 'Parameter.Chrg.Plan.StopTm',
			initial: 0,
			common: {
				name: I18n.getTranslatedObject('Ladeplan Zielzeit (Unix-Zeitstempel in Sekunden)'),
				type: 'number',
				role: 'value',
				unit: 's',
				min: 0,
				read: true,
				write: true,
			},
		},
		{
			id: 'Control.chargingMode',
			channelId: 'Parameter.Chrg.ActChaMod',
			initial: 4719,
			common: {
				name: I18n.getTranslatedObject('Lademodus für eCharger festlegen'),
				type: 'number',
				role: 'level',
				read: true,
				write: true,
				states: {
					4718: I18n.t('Schnellladen'),
					4719: I18n.t('PV-Überschuss'),
					4720: I18n.t('Laden mit Zielvorgabe'),
					4721: I18n.t('LadenStop'),
				},
			},
		},
		{
			id: 'Control.inverterMaxPowerIn',
			channelId: 'Parameter.Inverter.WMaxIn',
			initial: 11000,
			common: {
				name: I18n.getTranslatedObject('Maximale Wirkleistung (WMaxIn) setzen (Bezug/Ladeleistung)'),
				type: 'number',
				role: 'level.power',
				unit: 'W',
				min: 4500,
				max: 11000,
				read: true,
				write: true,
			},
		},
		{
			id: 'Control.chargingRelease',
			channelId: 'Parameter.Chrg.ChrgApv',
			initial: 5171,
			common: {
				name: I18n.getTranslatedObject('Ladefreigabe'),
				type: 'number',
				role: 'level',
				read: true,
				write: true,
				states: {
					5172: I18n.t('Ja'),
					5171: I18n.t('Nein'),
				},
			},
		},
		{
			id: 'Control.inverterMaxPower',
			channelId: 'Parameter.Inverter.WMax',
			initial: 11000,
			common: {
				name: I18n.getTranslatedObject('Maximale Wirkleistung setzen (WMax) (Abgabe/Entladeleistung)'),
				type: 'number',
				role: 'level.power',
				unit: 'W',
				min: 4500,
				max: 11000,
				read: true,
				write: true,
			},
		},
	];
}

const TARGET_PARAMS = [
	'Parameter.Chrg.ActChaMod',
	'Parameter.Inverter.WMax',
	'Parameter.Inverter.WMaxIn',
	'Parameter.Inverter.AcALim',
	'Parameter.Chrg.ChrgLok',
	'Parameter.Chrg.ChrgApv',
	'Parameter.Inverter.OutPhs',
	'Parameter.Chrg.Plan.DurTmm',
	'Parameter.Chrg.Plan.En',
	'Parameter.Chrg.Plan.StopTm',
];
const queryItems = TARGET_PARAMS.map(id => ({
	componentId: 'IGULD:SELF',
	channelId: id,
}));

class SmaEcharger extends utils.Adapter {
	constructor(options) {
		super({
			...options,
			name: 'sma-echarger',
		});

		this.on('ready', this.onReady.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		this.on('unload', this.onUnload.bind(this));

		this.httpsAgent = new https.Agent({ rejectUnauthorized: false });
		this.cachedToken = null;
		this.pollTimer = null;
		this.liveMapping = {};
		this.controlStates = [];
		this.lastWriteTimes = {};
	}

	async onReady() {
		await I18n.init(path.join(__dirname, 'admin'), this);

		this.log.info(I18n.t('=== PARAMETER-ANALYSE & LIVE-TEST STARTET ==='));

		if (!this.config.ipAddress || !this.config.password) {
			this.log.error(I18n.t('ABBRUCH: IP-Adresse oder Passwort ist leer!'));
			return;
		}

		const livePoints = getLivePoints();
		this.liveMapping = Object.fromEntries(livePoints.map(item => [item.channel, item.dp]));
		this.controlStates = getControlStates();

		// 1. Debug-Datenpunkt für alle Parameter anlegen
		await this.setObjectNotExistsAsync('Debug.All_Parameters', {
			type: 'state',
			common: {
				name: I18n.t('Komplette JSON-Antwort aller Parameter'),
				type: 'string',
				role: 'json',
				read: true,
				write: false,
			},
			native: {},
		});

		// Übergeordneten Kanal "Live" anlegen
		await this.setObjectNotExists('Live', {
			type: 'channel',
			common: { name: I18n.t('Live-Messwerte') },
			native: {},
		});

		// Alle Live-Datenpunkte aus LIVE_POINTS anlegen
		// Alle Live-Datenpunkte aus LIVE_POINTS anlegen/aktualisieren
		for (const item of livePoints) {
			const fullId = `Live.${item.dp}`;

			/** @type {ioBroker.StateCommon} */
			const commonObj = {
				name: item.name,
				type: 'number',
				role: 'value',
				unit: item.unit,
				read: true,
				write: false,
			};

			if (item.states) {
				commonObj.states = item.states;
			}

			await this.extendObject(fullId, {
				type: 'state',
				common: commonObj,
				native: { channelId: item.channel },
			});

			// Initial auf 0 setzen, falls der Datenpunkt noch leer (null) ist
			const existing = await this.getStateAsync(fullId);
			if (!existing || existing.val === null) {
				await this.setState(fullId, { val: 0, ack: true });
			}
		}
		// 2b. Alle Control-Datenpunkte anlegen und auf Änderungen lauschen

		for (const item of this.controlStates) {
			await this.extendObject(item.id, {
				type: 'state',
				common: item.common,
				native: { channelId: item.channelId },
			});

			// Initialwert nur setzen, falls der Datenpunkt noch leer (null) ist
			const existing = await this.getStateAsync(item.id);
			if (!existing || existing.val === null) {
				await this.setState(item.id, { val: item.initial, ack: true });
			}
		}

		this.subscribeStates('Control.*');
		this.subscribeStates('Parameter.*');

		// 3. Einmalig ALLE Parameter abrufen und speichern
		await this.listAllParameters();

		// 4. Live-Werte sofort einmal abfragen und Intervall starten
		await this.readLiveValues();
		const intervalMs = (this.config.pollInterval || 15) * 1000;
		this.pollTimer = this.setInterval(() => this.readLiveValues(), intervalMs);
	}

	async getToken(forceRefresh = false) {
		if (this.cachedToken && !forceRefresh) {
			return this.cachedToken;
		}
		const response = await axios.post(
			`https://${this.config.ipAddress}/api/v1/token`,
			`grant_type=password&username=${encodeURIComponent(this.config.username || 'user')}&password=${encodeURIComponent(this.config.password)}`,
			{
				httpsAgent: this.httpsAgent,
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				timeout: 10000,
			},
		);
		this.cachedToken = response.data.access_token;
		return this.cachedToken;
	}

	async smaRequest(method, endpoint, data) {
		for (let attempt = 0; attempt < 2; attempt++) {
			try {
				const token = await this.getToken(attempt > 0);
				return await axios.request({
					method: method,
					url: `https://${this.config.ipAddress}${endpoint}`,
					data: data,
					httpsAgent: this.httpsAgent,
					headers: {
						Authorization: `Bearer ${token}`,
						'Content-Type': 'application/json',
					},
					timeout: 10000,
				});
			} catch (error) {
				if (error.response && error.response.status === 401 && attempt === 0) {
					this.cachedToken = null;
					continue;
				}
				throw error;
			}
		}
	}

	async listAllParameters() {
		try {
			const res = await this.smaRequest('post', '/api/v1/parameters/search/', {
				queryItems: [{ componentId: 'IGULD:SELF' }],
			});
			if (!res || !res.data) {
				this.log.warn(I18n.t('Keine Daten von der SMA-Wallbox erhalten.'));
				return;
			}
			const jsonString = JSON.stringify(res.data);

			await this.setState('Debug.All_Parameters', { val: jsonString, ack: true });
			this.log.debug(jsonString);

			let apiResponse = jsonString;
			// 1. Falls die Antwort noch ein JSON-String ist, in ein Objekt umwandeln
			const data = typeof apiResponse === 'string' ? JSON.parse(apiResponse) : apiResponse;

			// 2. Prüfen, ob data[0] und das innere values-Array vorhanden sind
			if (!Array.isArray(data) || data.length === 0 || !Array.isArray(data[0].values)) {
				this.log.warn(I18n.t('Ungültiges SMA-Parameter-Format.'));
				return;
			}

			// 3. Alle Parameter aus data[0].values durchlaufen
			for (const param of data[0].values) {
				// Punkt-Notation für saubere Ordnerstruktur in ioBroker beibehalten
				const cleanId = param.channelId.replace(/\[\]$/, '');

				// Wert auslesen (beachtet sowohl "value" als auch das Array "values[0]")
				let rawValue = '';
				if (param.value !== undefined) {
					rawValue = param.value;
				} else if (Array.isArray(param.values) && param.values.length > 0) {
					rawValue = param.values[0];
				}

				// Prüfen, ob der Wert eine Zahl ist (z. B. "5500" oder "14.000")
				const isNumber = rawValue !== '' && !isNaN(Number(rawValue));
				const finalValue = isNumber ? Number(rawValue) : String(rawValue);

				// Datenpunkt-Eigenschaften aufbauen
				/** @type {ioBroker.StateCommon} */
				const commonObj = {
					name: param.channelId,
					type: isNumber ? 'number' : 'string',
					role: 'value',
					read: true,
					write: Boolean(param.editable),
				};

				if (isNumber && param.min !== undefined) {
					commonObj.min = Number(param.min);
				}
				if (isNumber && param.max !== undefined) {
					commonObj.max = Number(param.max);
				}

				// Erst warten bis das Objekt existiert, DANN den Wert schreiben!
				await this.setObjectNotExistsAsync(cleanId, {
					type: 'state',
					common: commonObj,
					native: {},
				});
				await this.setState(cleanId, { val: finalValue, ack: true });
			}
			if (Array.isArray(res.data) && res.data.length > 0 && Array.isArray(res.data[0].values)) {
				this.log.info(
					I18n.t(
						'Erfolg! %s Parameter gefunden und in Debug.All_Parameters gespeichert.',
						res.data[0].values.length,
					),
				);
			} else {
				this.log.warn(I18n.t('Antwort erhalten, Struktur bitte im Datenpunkt Debug.All_Parameters ansehen.'));
			}
		} catch (error) {
			const details = error.response
				? `${error.response.status} - ${JSON.stringify(error.response.data)}`
				: error.message;
			this.log.error(I18n.t('Fehler beim Parameter-Abruf: %s', details));
		}
	}

	async readLiveValues() {
		try {
			// Live-Messwerte abrufen
			const liveRes = await this.smaRequest('post', '/api/v1/measurements/live/', [
				{ componentId: 'IGULD:SELF' },
			]);
			if (!liveRes || !liveRes.data) {
				this.log.warn(I18n.t('Keine Daten von der SMA-Wallbox erhalten.'));
				return;
			}

			if (Array.isArray(liveRes.data)) {
				for (const item of liveRes.data) {
					const targetDp = this.liveMapping[item.channelId];
					if (targetDp && item.values && item.values.length > 0) {
						const val = Number(item.values[0].value);
						this.setState(`Live.${targetDp}`, { val: val, ack: true });
					}
				}
			}
			// Alle gewünschten Parameter in einem einzigen Request abrufen
			const paramRes = await this.smaRequest('post', '/api/v1/parameters/search/', { queryItems: queryItems });

			// Antwort prüfen und mit einer Schleife in die Datenpunkte schreiben
			if (paramRes && Array.isArray(paramRes.data)) {
				for (let i = 0; i < paramRes.data.length; i++) {
					const componentObj = paramRes.data[i];

					if (componentObj && Array.isArray(componentObj.values)) {
						for (let j = 0; j < componentObj.values.length; j++) {
							const item = componentObj.values[j];
							const rawVal = item.value;

							// Prüfen, ob der Wert eine Zahl ist (z. B. "4719" oder "14.000")
							const finalVal = rawVal !== '' && !isNaN(Number(rawVal)) ? Number(rawVal) : String(rawVal);

							// Schreibt z. B. in item.channelId-{Parameter.Chrg.ActChaMod}-, finalVal-{4719}-, ack-{true}- <-- 4719 steht für PV-Überschussladen
							this.setState(item.channelId, finalVal, true);
						}
					}
				}
			}
			await this.setState('info.connection', true, true);
		} catch (error) {
			await this.setState('info.connection', false, true);
			const details = error.response ? JSON.stringify(error.response.data) : error.message;
			this.log.error(I18n.t('Fehler beim Lesen der Live-Werte: %s', details));
		}
	}

	parseDateToUnixSeconds(input) {
		if (!input || typeof input !== 'string') {
			return null;
		}
		const trimmed = input.trim();

		// 1. Deutsches Format prüfen: DD.MM.YYYY HH:MM (Sekunden optional)
		const deMatch = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})[\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
		if (deMatch) {
			const [, day, month, year, hour, minute, second = '0'] = deMatch;
			const dateObj = new Date(
				Number(year),
				Number(month) - 1,
				Number(day),
				Number(hour),
				Number(minute),
				Number(second),
			);
			if (!isNaN(dateObj.getTime())) {
				return Math.floor(dateObj.getTime() / 1000);
			}
		}

		// 2. ISO- / Standard-Format prüfen: YYYY-MM-DD HH:MM oder ISO-String
		const parsedMs = Date.parse(trimmed.replace(' ', 'T'));
		if (!isNaN(parsedMs)) {
			return Math.floor(parsedMs / 1000);
		}
		return null;
	}

	async onStateChange(id, state) {
		if (!state) {
			return;
		}

		const shortId = id.replace(`${this.namespace}.`, '');

		// FALL 1: Steuerbefehl (ack === false) -> Suche über item.id
		// FALL 1: Steuerbefehl (ack === false) -> Suche über item.id
		if (!state.ack) {
			// Sonderbehandlung für den Datums-Hilfspunkt
			if (shortId === 'Control.planTargetTimeInput') {
				const unixSec = this.parseDateToUnixSeconds(String(state.val));
				if (unixSec === null) {
					this.log.warn(
						I18n.t(
							'Ungültiges Datumsformat "%s". Bitte DD.MM.YYYY HH:MM oder YYYY-MM-DD HH:MM verwenden.',
							state.val,
						),
					);
					await this.setState('Control.planTargetTimeInput', { val: '', ack: true });
					return;
				}
				await this.setState('Control.planTargetTimeInput', { val: String(state.val).trim(), ack: true });
				this.log.debug(I18n.t('Datum "%s" in Epoch-Zeitstempel %s umgerechnet.', state.val, unixSec));

				// Direkt auch an die Wallbox (StopTm) senden
				await this.setValueOneCharger('Parameter.Chrg.Plan.StopTm', 'Control.Ladeplan_Stoppzeit', unixSec);
				return;
			}

			const controlItem = this.controlStates.find(item => item.id === shortId);
			if (controlItem) {
				await this.setValueOneCharger(controlItem.channelId, controlItem.id, state.val);
			}
			return;
		}

		// FALL 2: Wert von der Wallbox (ack === true) -> Suche über item.channelId
		const syncItem = this.controlStates.find(item => item.channelId && item.channelId === shortId);
		if (syncItem) {
			const wallboxVal = Number(state.val);
			const controlState = await this.getStateAsync(syncItem.id);

			if (!isNaN(wallboxVal) && controlState && controlState.ack === true && controlState.val !== wallboxVal) {
				await this.setState(syncItem.id, { val: wallboxVal, ack: true });
				this.log.debug(I18n.t('SMA Sync: %s auf %s aktualisiert.', syncItem.id, wallboxVal));
			}
		}
	}

	async resetControlToWallboxValue(param, dp) {
		const wallboxState = await this.getStateAsync(param);
		if (wallboxState && wallboxState.val !== null) {
			await this.setState(dp, { val: wallboxState.val, ack: true });
		}
	}

	async setValueOneCharger(param, dp, value) {
		const numVal = Number(value);

		// 1. Typ-Prüfung: Nur gültige Zahlen zulassen
		if (isNaN(numVal)) {
			this.log.warn(I18n.t('Ungültiger Wert "%s" für %s ignoriert.', value, param));
			await this.resetControlToWallboxValue(param, dp);
			return;
		}

		// 2. Min/Max-Grenzen aus CONTROL_STATES prüfen
		const controlConfig = this.controlStates.find(item => item.channelId === param);
		if (controlConfig && controlConfig.common) {
			if (controlConfig.common.min !== undefined && numVal < controlConfig.common.min) {
				this.log.warn(
					I18n.t('Wert %s für %s überschreitet Minimum (%s).', numVal, param, controlConfig.common.min),
				);
				await this.resetControlToWallboxValue(param, dp);
				return;
			}
			if (controlConfig.common.max !== undefined && numVal > controlConfig.common.max) {
				this.log.warn(
					I18n.t('Wert %s für %s überschreitet Maximum (%s).', numVal, param, controlConfig.common.max),
				);
				await this.resetControlToWallboxValue(param, dp);
				return;
			}
		}

		// 2b. Plausibilitätsprüfung für Ladeplan-Energiemenge (darf bei > 0 nicht kleiner als Sitzungsenergie sein)
		if (param === 'Parameter.Chrg.Plan.En' && numVal > 0) {
			const sessionState = await this.getStateAsync('Live.sessionEnergy');
			if (sessionState && typeof sessionState.val === 'number') {
				const sessionKwh = Number((sessionState.val / 1000).toFixed(3));
				if (numVal < sessionKwh) {
					this.log.warn(
						I18n.t(
							'Ladeplan-Energiemenge (%s kWh) darf nicht kleiner als die bereits geladene Sitzungsenergie (%s kWh) sein.',
							numVal,
							sessionKwh,
						),
					);
					await this.resetControlToWallboxValue(param, dp);
					return;
				}
			}
		}

		// 3. Duplikat-Filter: Nichts senden, wenn der Parameter schon diesen Wert hat
		const currentParamState = await this.getStateAsync(param);
		if (currentParamState && currentParamState.ack && Number(currentParamState.val) === numVal) {
			this.log.debug(I18n.t('SMA eCharger %s steht bereits auf %s – kein Schreibbefehl nötig.', param, numVal));
			await this.setState(dp, { val: numVal, ack: true });
			return;
		}

		// 4. Cooldown / Rate-Limit (mind. 5 Sekunden Abstand je Parameter)
		const COOLDOWN_MS = 5000;
		const now = Date.now();
		const lastWrite = this.lastWriteTimes[param] || 0;

		if (now - lastWrite < COOLDOWN_MS) {
			const waitSec = ((COOLDOWN_MS - (now - lastWrite)) / 1000).toFixed(1);
			this.log.warn(
				I18n.t('Rate-Limit: Schreibbefehl für %s blockiert (bitte noch %ss warten).', param, waitSec),
			);
			await this.resetControlToWallboxValue(param, dp);
			return;
		}

		// Zeitstempel vor dem Request setzen (verhindert parallele Doppel-Requests)
		this.lastWriteTimes[param] = now;

		try {
			const putResponse = await this.smaRequest('put', '/api/v1/parameters/IGULD:SELF/', {
				values: [
					{
						channelId: param,
						timestamp: new Date().toISOString(),
						value: String(numVal),
					},
				],
			});

			if (putResponse) {
				this.log.info(
					I18n.t('SMA eCharger %s erfolgreich auf %s gesetzt (HTTP %s)', param, numVal, putResponse.status),
				);
				await this.setState(dp, { val: numVal, ack: true });
				await this.setState(param, { val: numVal, ack: true });
			}
		} catch (error) {
			// Bei Fehler Sperrzeit zurücksetzen, damit ein erneuter Versuch möglich ist
			delete this.lastWriteTimes[param];
			const details = error.response ? JSON.stringify(error.response.data) : error.message;
			this.log.error(I18n.t('SMA eCharger Fehler beim Setzen von %s: %s', param, details));
			await this.resetControlToWallboxValue(param, dp);
		}
	}
	onUnload(callback) {
		if (this.pollTimer) {
			this.clearInterval(this.pollTimer);
		}
		callback();
	}
}

if (require.main !== module) {
	module.exports = options => new SmaEcharger(options);
} else {
	new SmaEcharger();
}
