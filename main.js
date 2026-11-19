/* eslint-disable prettier/prettier */
'use strict';

const utils = require('@iobroker/adapter-core');
const { I18n } = utils;
const axios = require('axios');
const https = require('node:https');
const path = require('path');

function getLivePoints(){ 
	return [
		{
			channel: 'Measurement.Metering.GridMs.TotWIn.ChaSta',
			dp: 'Ladeleistung_W',
			name: I18n.getTranslatedObject('Aktuelle Ladeleistung'),
			unit: 'W',
		},
		{
			channel: 'Measurement.Metering.GridMs.TotWhIn.ChaSta',
			dp: 'Gesamtenergie_Wh',
			name: I18n.getTranslatedObject('Geladene Gesamtenergie'),
			unit: 'Wh',
		},
		{
			channel: 'Measurement.ChaSess.WhIn',
			dp: 'Sitzungsenergie_Wh',
			name: I18n.getTranslatedObject('Energie aktuelle Ladung'),
			unit: 'Wh',
		},
		{
			channel: 'Measurement.Operation.EVeh.ChaStt',
			dp: 'Fahrzeug_Status',
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
			dp: 'Geraete_Status',
			name: I18n.getTranslatedObject('Status Wallbox'),
			unit: '',
		},
		{
			channel: 'Measurement.GridMs.A.phsA',
			dp: 'Strom_L1_A',
			name: I18n.getTranslatedObject('Ladestrom Phase L1'),
			unit: 'A',
		},
		{
			channel: 'Measurement.GridMs.A.phsB',
			dp: 'Strom_L2_A',
			name: I18n.getTranslatedObject('Ladestrom Phase L2'),
			unit: 'A',
		},
		{
			channel: 'Measurement.GridMs.A.phsC',
			dp: 'Strom_L3_A',
			name: I18n.getTranslatedObject('Ladestrom Phase L3'),
			unit: 'A',
		},
		{
			channel: 'Measurement.GridMs.PhV.phsA',
			dp: 'Spannung_L1_V',
			name: I18n.getTranslatedObject('Voltage phase L1'),
			unit: 'V',
		},
		{
			channel: 'Measurement.GridMs.PhV.phsB',
			dp: 'Spannung_L2_V',
			name: I18n.getTranslatedObject('Spannung Phase L2'),
			unit: 'V',
		},
		{
			channel: 'Measurement.GridMs.PhV.phsC',
			dp: 'Spannung_L3_V',
			name: I18n.getTranslatedObject('Spannung Phase L3'),
			unit: 'V',
		},
		// Hier einfach weitere Kanäle ergänzen...
	];
}

function getControlStates() {
	return [
		{
			id: 'Control.Lademodus',
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
			id: 'Control.Inverter_WMaxIn',
			channelId: 'Parameter.Inverter.WMaxIn',
			initial: 11000,
			common: {
				name: I18n.getTranslatedObject('Maximale Wirkleistung (WMaxIn) setzen'),
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
			id: 'Control.Ladefreigabe',
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
			id: 'Control.Inverter_WMax',
			channelId: 'Parameter.Inverter.WMax',
			initial: 11000,
			common: {
				name: I18n.getTranslatedObject('Maximale Wirkleistung setzen (WMax)'),
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

// Mapping-Tabelle automatisch aus LIVE_POINTS erzeugen
//const LIVE_MAPPING = Object.fromEntries(LIVE_POINTS.map(item => [item.channel, item.dp]));
// Reagiert auf Änderungen des Datenpunkts (ack: false)
// Zuordnung: [Datenpunkt unter DP_PREFIX] -> [SMA Parameter-Kanal]

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
	}

	async onReady() {
		await I18n.init(path.join(__dirname, 'admin'), this);
		//await I18n.init(__dirname, this);

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
			const existing = await this.getState(fullId);
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
			const existing = await this.getState(item.id);
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
			this.log.info(jsonString);
			/////
			let apiResponse = jsonString;
			// 1. Falls die Antwort noch ein JSON-String ist, in ein Objekt umwandeln
			const data = typeof apiResponse === 'string' ? JSON.parse(apiResponse) : apiResponse;

			// 2. Prüfen, ob data[0] und das innere values-Array vorhanden sind
			if (!Array.isArray(data) || data.length === 0 || !Array.isArray(data[0].values)) {
				this.log.warn(I18n.t('Ungültiges SMA-Parameter-Format.'));
				return;
			}

			// 3. Alle Parameter aus data[0].values durchlaufen
			data[0].values.forEach(param => {
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

				// Datenpunkt anlegen und Wert setzen
				this.setObjectNotExistsAsync(cleanId, {
					type: 'state',
					common: commonObj,
					native: {},
				});
				this.setState(cleanId, { val: finalValue, ack: true });
			});
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
			if (Array.isArray(paramRes.data)) {
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
	async onStateChange(id, state) {
		if (!state) {
			return;
		}

		const shortId = id.replace(`${this.namespace}.`, '');

		// FALL 1: Steuerbefehl (ack === false) -> Suche über item.id
		if (!state.ack) {
			const controlItem = this.controlStates.find(item => item.id === shortId);
			if (controlItem) {
				await this.setValueOneCharger(controlItem.channelId, controlItem.id, state.val);
			}
			return;
		}

		// FALL 2: Wert von der Wallbox (ack === true) -> Suche über item.channelId
		const syncItem = this.controlStates.find(item => item.channelId === shortId);
		if (syncItem) {
			const wallboxVal = Number(state.val);
			const controlState = await this.getState(syncItem.id);

			if (!isNaN(wallboxVal) && controlState && controlState.ack === true && controlState.val !== wallboxVal) {
				await this.setState(syncItem.id, { val: wallboxVal, ack: true });
				this.log.info(I18n.t('SMA Sync: %s auf %s aktualisiert.', syncItem.id, wallboxVal));
			}
		}
	}

	async setValueOneCharger(param, dp, value) {
		try {
			const putResponse = await this.smaRequest('put', '/api/v1/parameters/IGULD:SELF/', {
				values: [
					{
						channelId: param,
						timestamp: new Date().toISOString(),
						value: String(value),
					},
				],
			});

			if (putResponse) {
				this.log.info(I18n.t('SMA eCharger %s erfolgreich auf %s gesetzt (HTTP %s)', param, value, putResponse.status));
				const numVal = Number(value);
				await this.setState(dp, { val: numVal, ack: true });
				await this.setState(param, { val: numVal, ack: true });
			}
		} catch (error) {
			const details = error.response ? JSON.stringify(error.response.data) : error.message;
			this.log.error(I18n.t('SMA eCharger Fehler beim Setzen von %s: %s', param, details));
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
