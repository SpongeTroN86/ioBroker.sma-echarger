'use strict';

const utils = require('@iobroker/adapter-core');
const { I18n } = utils;
const axios = require('axios');
const https = require('node:https');

function getLivePoints() {
	return [
		{
			channel: 'Measurement.Metering.GridMs.TotWIn.ChaSta',
			dp: 'Ladeleistung_W',
			name: I18n.getTranslatedObject('Current charging power'),
			unit: 'W',
		},
		{
			channel: 'Measurement.Metering.GridMs.TotWhIn.ChaSta',
			dp: 'Gesamtenergie_Wh',
			name: I18n.getTranslatedObject('Total charged energy'),
			unit: 'Wh',
		},
		{
			channel: 'Measurement.ChaSess.WhIn',
			dp: 'Sitzungsenergie_Wh',
			name: I18n.getTranslatedObject('Current session energy'),
			unit: 'Wh',
		},
		{
			channel: 'Measurement.Operation.EVeh.ChaStt',
			dp: 'Fahrzeug_Status',
			name: I18n.getTranslatedObject('Vehicle/charging status'),
			unit: '',
			states: {
				200111: I18n.t('Cable disconnected'),
				200112: I18n.t('Cable connected'),
				200113: I18n.t('Charging'),
			},
		},
		{
			channel: 'Measurement.Operation.Health',
			dp: 'Geraete_Status',
			name: I18n.getTranslatedObject('Wallbox status'),
			unit: '',
		},
		{
			channel: 'Measurement.GridMs.A.phsA',
			dp: 'Strom_L1_A',
			name: I18n.getTranslatedObject('Charging current phase L1'),
			unit: 'A',
		},
		{
			channel: 'Measurement.GridMs.A.phsB',
			dp: 'Strom_L2_A',
			name: I18n.getTranslatedObject('Charging current phase L2'),
			unit: 'A',
		},
		{
			channel: 'Measurement.GridMs.A.phsC',
			dp: 'Strom_L3_A',
			name: I18n.getTranslatedObject('Charging current phase L3'),
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
			name: I18n.getTranslatedObject('Voltage phase L2'),
			unit: 'V',
		},
		{
			channel: 'Measurement.GridMs.PhV.phsC',
			dp: 'Spannung_L3_V',
			name: I18n.getTranslatedObject('Voltage phase L3'),
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
				name: I18n.getTranslatedObject('Set charging mode for eCharger'),
				type: 'number',
				role: 'level',
				read: true,
				write: true,
				states: {
					4718: I18n.t('Fast charging'),
					4719: I18n.t('PV surplus'),
					4720: I18n.t('Target charging'),
					4721: I18n.t('Stop charging'),
				},
			},
		},
		{
			id: 'Control.Inverter_WMaxIn',
			channelId: 'Parameter.Inverter.WMaxIn',
			initial: 11000,
			common: {
				name: I18n.getTranslatedObject('Set maximum active power (WMaxIn)'),
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
				name: I18n.getTranslatedObject('Charging release'),
				type: 'number',
				role: 'level',
				read: true,
				write: true,
				states: {
					5172: I18n.t('Yes'),
					5171: I18n.t('No'),
				},
			},
		},
		{
			id: 'Control.Inverter_WMax',
			channelId: 'Parameter.Inverter.WMax',
			initial: 11000,
			common: {
				name: I18n.getTranslatedObject('Set maximum active power (WMax)'),
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
	}

	async onReady() {
		// I18n initialisieren (lädt automatisch die Systemsprache aus ioBroker)
		await I18n.init(__dirname, this);

		this.log.info(I18n.t('=== PARAMETER ANALYSIS & LIVE TEST STARTING ==='));

		// @ts-ignore
		if (!this.config.ipAddress || !this.config.password) {
			this.log.error(I18n.t('ABORT: IP address or password is empty!'));
			return;
		}

		// Übersetzte Definitionen laden
		const livePoints = getLivePoints();
		this.liveMapping = Object.fromEntries(livePoints.map(item => [item.channel, item.dp]));
		this.controlStates = getControlStates();

		// 1. Debug-Datenpunkt für alle Parameter anlegen
		await this.setObjectNotExistsAsync('Debug.All_Parameters', {
			type: 'state',
			common: {
				name: I18n.getTranslatedObject('Complete JSON response of all parameters'),
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
			common: { name: I18n.getTranslatedObject('Live measurements') },
			native: {},
		});

		// Alle Live-Datenpunkte anlegen/aktualisieren
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

			// @ts-ignore
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
			// @ts-ignore
			const existing = await this.getState(item.id);
			// @ts-ignore
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
		// @ts-ignore
		const intervalMs = (this.config.pollInterval || 15) * 1000;
		this.pollTimer = this.setInterval(() => this.readLiveValues(), intervalMs);
	}

	async getToken(forceRefresh = false) {
		if (this.cachedToken && !forceRefresh) {
			return this.cachedToken;
		}
		const response = await axios.post(
			// @ts-ignore
			`https://${this.config.ipAddress}/api/v1/token`,
			// @ts-ignore
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
					// @ts-ignore
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
				this.log.warn(I18n.t('No data received from SMA wallbox.'));
				return;
			}
			const jsonString = JSON.stringify(res.data);

			await this.setState('Debug.All_Parameters', { val: jsonString, ack: true });
			this.log.info(jsonString);

			const data = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;

			if (!Array.isArray(data) || data.length === 0 || !Array.isArray(data[0].values)) {
				this.log.warn(I18n.t('Invalid SMA parameter format.'));
				return;
			}

			data[0].values.forEach(param => {
				const cleanId = param.channelId.replace(/\[\]$/, '');

				let rawValue = '';
				if (param.value !== undefined) {
					rawValue = param.value;
				} else if (Array.isArray(param.values) && param.values.length > 0) {
					rawValue = param.values[0];
				}

				const isNumber = rawValue !== '' && !isNaN(Number(rawValue));
				const finalValue = isNumber ? Number(rawValue) : String(rawValue);

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

				// @ts-ignore
				this.setObjectNotExistsAsync(cleanId, {
					type: 'state',
					common: commonObj,
					native: {},
				});
				this.setState(cleanId, { val: finalValue, ack: true });
			});

			if (Array.isArray(res.data) && res.data.length > 0 && Array.isArray(res.data[0].values)) {
				this.log.info(I18n.t('Success! %s parameters found and saved in Debug.All_Parameters.',[0].values.length,),);
            } else {
                this.log.warn(I18n.t('Response received, please check structure in state Debug.All_Parameters.'));
            }
        } catch (error) {const details = error.response? ${error.response.status} - ${JSON.stringify()}: error.message;
            this.log.error(I18n.t('Error retrieving parameters: %s', details));
    }
}
async readLiveValues() {
try {
const liveRes = await this.smaRequest('post', '/api/v1/measurements/live/', [
{ componentId: 'IGULD:SELF' },
]);
// @ts-ignore
if (!liveRes || !) {
this.log.warn(I18n.t('No data received from SMA wallbox.'));
return;
}
// @ts-ignore
if (Array.isArray()) {
// @ts-ignore
for (const item of ) {
const targetDp = this.liveMapping[item.channelId];
if (targetDp && item.values && item.values.length > 0) {
const val = Number(item.values[0].value);
// @ts-ignore
this.setState(Live.${targetDp}, { val: val, ack: true });
}
}
}
const paramRes = await this.smaRequest('post', '/api/v1/parameters/search/', { queryItems: queryItems });
// @ts-ignore
if (Array.isArray()) {
// @ts-ignore
for (let i = 0; i < paramRes.data.length; i++) {
const componentObj = [i];
if (componentObj && Array.isArray(componentObj.values)) {
for (let j = 0; j < componentObj.values.length; j++) {
const item = componentObj.values[j];
const rawVal = item.value;
const finalVal = rawVal !== '' && !isNaN(Number(rawVal)) ? Number(rawVal) : String(rawVal);
this.setState(item.channelId, finalVal, true);
}
}
}
}
await this.setState('info.connection', true, true);
} catch (error) {
await this.setState('info.connection', false, true);
// @ts-ignore
const details = error.response ? JSON.stringify() : error.message;
this.log.error(I18n.t('Error reading live values: %s', details));
}
}
async onStateChange(id, state) {
if (!state) {
return;
}
// @ts-ignore
const shortId = id.replace(${this.namespace}., '');
// FALL 1: Steuerbefehl (ack === false) -> Suche über 
if (!state.ack) {
// @ts-ignore
const controlItem = this.controlStates.find(item =>  === shortId);
if (controlItem) {
// @ts-ignore
await this.setValueOneCharger(controlItem.channelId, , state.val);
}
return;
}
// FALL 2: Wert von der Wallbox (ack === true) -> Suche über item.channelId
const syncItem = this.controlStates.find(item => item.channelId === shortId);
if (syncItem) {
const wallboxVal = Number(state.val);
// @ts-ignore
const controlState = await this.getState();
// @ts-ignore
if (!isNaN(wallboxVal) && controlState && controlState.ack === true && controlState.val !== wallboxVal) {
// @ts-ignore
await this.setState(, { val: wallboxVal, ack: true });
// @ts-ignore
(I18n.t('SMA Sync: %s updated to %s.', , wallboxVal));
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
(
I18n.t('SMA eCharger %s successfully set to %s (HTTP %s)', param, value, putResponse.status),
// @ts-ignore
);
const numVal = Number(value);
await this.setState(dp, { val: numVal, ack: true });
await this.setState(param, { val: numVal, ack: true });
}
} catch (error) {
// @ts-ignore
const details = error.response ? JSON.stringify() : error.message;
this.log.error(I18n.t('SMA eCharger error setting %s: %s', param, details));
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