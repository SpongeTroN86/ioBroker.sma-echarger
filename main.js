'use strict';

const utils = require('@iobroker/adapter-core');
const axios = require('axios');
const https = require('node:https');

// #region Data point definitions (Live & Control)
function getLivePoints() {
	return [
		{
			channel: 'Measurement.Metering.GridMs.TotWIn.ChaSta',
			dp: 'chargingPower',
			name: 'Current charging power',
			role: 'value.power',
			unit: 'W',
		},
		{
			channel: 'Measurement.Metering.GridMs.TotWhIn.ChaSta',
			dp: 'totalEnergy',
			name: 'Total charged energy',
			role: 'value.energy',
			unit: 'Wh',
		},
		{
			channel: 'Measurement.ChaSess.WhIn',
			dp: 'sessionEnergy',
			name: 'Current session energy',
			role: 'value.energy',
			unit: 'Wh',
		},
		{
			channel: 'Measurement.Operation.EVeh.ChaStt',
			dp: 'vehicleStatus',
			name: 'Vehicle/charging status',
			role: 'value',
			unit: '',
			states: {
				200111: 'Cable disconnected',
				200112: 'Cable connected',
				200113: 'Charging',
			},
		},
		{
			channel: 'Measurement.Operation.Health',
			dp: 'deviceStatus',
			name: 'Wallbox status (307 means: All OK)',
			role: 'value',
			unit: '',
		},
		{
			channel: 'Measurement.GridMs.A.phsA',
			dp: 'currentL1',
			name: 'Charging current phase L1',
			role: 'value.current',
			unit: 'A',
		},
		{
			channel: 'Measurement.GridMs.A.phsB',
			dp: 'currentL2',
			name: 'Charging current phase L2',
			role: 'value.current',
			unit: 'A',
		},
		{
			channel: 'Measurement.GridMs.A.phsC',
			dp: 'currentL3',
			name: 'Charging current phase L3',
			role: 'value.current',
			unit: 'A',
		},
		{
			channel: 'Measurement.GridMs.PhV.phsA',
			dp: 'voltageL1',
			name: 'Voltage phase L1',
			role: 'value.voltage',
			unit: 'V',
		},
		{
			channel: 'Measurement.GridMs.PhV.phsB',
			dp: 'voltageL2',
			name: 'Voltage phase L2',
			role: 'value.voltage',
			unit: 'V',
		},
		{
			channel: 'Measurement.GridMs.PhV.phsC',
			dp: 'voltageL3',
			name: 'Voltage phase L3',
			role: 'value.voltage',
			unit: 'V',
		},
	];
}

function getControlStates(editableMap = {}, carConsumption) {
	const allStates = [
		{
			id: 'Control.planTargetTimeInput',
			channelId: '',
			initial: '',
			common: {
				name: 'Enter target time (DD.MM.YYYY HH:MM or YYYY-MM-DD HH:MM)',
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
				name: 'Maximum charging current in Amperes',
				type: 'number',
				role: 'level',
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
			type: 'state',
			initial: false,
			common: {
				name: 'Charging lock',
				type: 'boolean',
				role: 'switch',
				read: true,
				write: true,
				def: false,
			},
			native: {},
		},
		{
			id: 'Control.planTargetEnergy',
			channelId: 'Parameter.Chrg.Plan.En',
			initial: 0,
			common: {
				name: 'Charging plan energy amount (kWh)',
				type: 'number',
				role: 'level',
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
				name: 'Charging plan duration in minutes',
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
				name: 'Charging plan target time (Unix timestamp in seconds)',
				type: 'number',
				role: 'level',
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
				name: 'Set charging mode for eCharger',
				type: 'number',
				role: 'level',
				read: true,
				write: true,
				states: {
					4718: 'Fast charging',
					4719: 'PV surplus',
					4720: 'Target charging',
					4721: 'Charging stop',
				},
			},
		},
		{
			id: 'Control.inverterMaxPowerIn',
			channelId: 'Parameter.Inverter.WMaxIn',
			initial: 11000,
			common: {
				name: 'Set maximum active power (WMaxIn) (consumption/charging power)',
				type: 'number',
				role: 'level',
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
			type: 'state',
			initial: true,
			common: {
				name: 'Charging release',
				type: 'boolean',
				role: 'switch',
				read: true,
				write: true,
				def: true,
			},
			native: {},
		},
		{
			id: 'Control.inverterMaxPower',
			channelId: 'Parameter.Inverter.WMax',
			initial: 11000,
			common: {
				name: 'Set maximum active power (WMax) (supply/discharging power)',
				type: 'number',
				role: 'level',
				unit: 'W',
				min: 4500,
				max: 11000,
				read: true,
				write: true,
			},
		},
		{
			id: 'Control.planTargetRange',
			channelId: '',
			initial: 0,
			common: {
				name: 'Charging plan target range (km)',
				type: 'number',
				role: 'level',
				unit: 'km',
				min: 0,
				read: true,
				write: true,
			},
		},
	];
	return allStates.filter(item => {
		if (item.id === 'Control.planTargetTimeInput') {
			return editableMap['Parameter.Chrg.Plan.StopTm'] === true;
		}

		if (item.id === 'Control.planTargetRange') {
			return editableMap['Parameter.Chrg.Plan.En'] === true && Number(carConsumption) > 0;
		}

		return item.channelId ? editableMap[item.channelId] === true : true;
	});
}
// #endregion

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
		this.on('message', this.onMessage.bind(this));
		this.on('unload', this.onUnload.bind(this));

		this.httpsAgent = new https.Agent({ rejectUnauthorized: false });
		this.cachedToken = null;
		this.pollTimer = null;
		this.liveMapping = {};
		this.controlStates = [];
		this.lastWriteTimes = {};
		this.wallboxValues = {};
		this.lastVehicleStatus = null;
		this.editableMap = {};
	}
	sanitizeId(id) {
		return id.replace(/\[\]$/, '').replace(this.FORBIDDEN_CHARS, '_');
	}

	async onReady() {
		this.log.info('=== PARAMETER ANALYSIS & LIVE TEST STARTED ===');

		if (!this.config.ipAddress || !this.config.password) {
			this.log.error('ABORTED: IP address or password is empty!');
			return;
		}

		const livePoints = getLivePoints();
		this.liveMapping = Object.fromEntries(livePoints.map(item => [item.channel, item.dp]));

		// 1. Create parent channel "Debug" and debug state
		await this.setObjectNotExistsAsync('Debug', {
			type: 'channel',
			common: { name: 'Debug' },
			native: {},
		});

		await this.setObjectNotExistsAsync('Debug.All_Parameters', {
			type: 'state',
			common: {
				name: 'Complete JSON response of all parameters',
				type: 'string',
				role: 'json',
				read: true,
				write: false,
			},
			native: {},
		});

		// 2. Create parent channels "Live" and "Control"
		await this.setObjectNotExistsAsync('Live', {
			type: 'channel',
			common: { name: 'Live measurements' },
			native: {},
		});

		await this.setObjectNotExistsAsync('Control', {
			type: 'channel',
			common: { name: 'Control' },
			native: {},
		});
		// Create/update all live states from getLivePoints
		for (const item of livePoints) {
			const fullId = `Live.${item.dp}`;

			const commonObj = {
				name: item.name,
				role: item.role,
				unit: item.unit,
				read: true,
				write: false,
			};

			if (item.states) {
				commonObj.states = item.states;
			}

			await this.extendObject(fullId, {
				type: 'state',
				common: {
					...commonObj,
					type: 'number',
				},
				native: { channelId: item.channel },
			});

			const existing = await this.getStateAsync(fullId);
			if (!existing || existing.val === null) {
				await this.setState(fullId, { val: 0, ack: true });
			}
		}

		this.subscribeStates('Control.*');
		if (this.config.expertMode) {
			this.subscribeStates('Parameter.*');
		}

		// 3. Fetch ALL parameters once (creates Parameter.* only if expertMode === true)
		this.editableMap = await this.listAllParameters();

		// Revoke write permissions for orphaned Parameter.* objects instead of deleting them immediately
		const allObjs = await this.getAdapterObjectsAsync();
		// Always remove sensitive Parameter.Acs.* objects if they exist from older versions
		await this.delObjectAsync('Parameter.Acs', { recursive: true });

		for (const [fullObjId, obj] of Object.entries(allObjs)) {
			const shortObjId = fullObjId.replace(`${this.namespace}.`, '');
			if (!shortObjId.startsWith('Parameter.') || !obj || obj.type !== 'state') {
				continue;
			}

			// Case A: Expert mode is OFF -> revoke write permissions if present
			if (!this.config.expertMode) {
				if (obj.common?.write === true) {
					await this.extendObject(shortObjId, { common: { write: false } });
					this.log.debug(`Disabled write permissions for parameter object (expert mode off): ${shortObjId}`);
				}
				continue;
			}

			// Case B: Expert mode is ON, but permissions were reduced from installer to operator
			if (
				Object.keys(this.editableMap).length > 0 &&
				obj.common?.write === true &&
				this.editableMap[shortObjId] !== true
			) {
				await this.extendObject(shortObjId, { common: { write: false } });
				this.log.debug(`Disabled write permissions for no longer editable parameter object: ${shortObjId}`);
			}
		}

		// 4. Filter control states based on user permissions
		this.controlStates = getControlStates(this.editableMap, this.config.carConsumption);

		const allowedControlIds = new Set(this.controlStates.map(item => item.id));

		// Revoke write permissions for unauthorized Control.* objects instead of deleting them immediately
		if (Object.keys(this.editableMap).length > 0) {
			for (const [fullObjId, obj] of Object.entries(allObjs)) {
				const shortObjId = fullObjId.replace(`${this.namespace}.`, '');
				if (
					shortObjId.startsWith('Control.') &&
					!allowedControlIds.has(shortObjId) &&
					obj?.type === 'state' &&
					obj.common?.write === true
				) {
					await this.extendObject(shortObjId, { common: { write: false } });
					this.log.debug(`Disabled write permissions for unauthorized control object: ${shortObjId}`);
				}
			}
		}

		// Create/update allowed control states
		for (const item of this.controlStates) {
			await this.extendObject(item.id, {
				type: 'state',
				common: item.common,
				native: { channelId: item.channelId },
			});

			const existing = await this.getStateAsync(item.id);
			if (!existing || existing.val === null) {
				await this.setState(item.id, { val: item.initial, ack: true });
			}
		}

		// 5. Read live values immediately once and start polling interval
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
		const editableMap = {};
		try {
			const res = await this.smaRequest('post', '/api/v1/parameters/search/', {
				queryItems: [{ componentId: 'IGULD:SELF' }],
			});
			if (!res || !res.data) {
				this.log.warn('No data received from SMA wallbox.');
				return editableMap;
			}

			if (!Array.isArray(res.data) || res.data.length === 0 || !Array.isArray(res.data[0].values)) {
				this.log.warn('Invalid SMA parameter format.');
				return editableMap;
			}

			// Filter out sensitive access parameters (e.g. Parameter.Acs.PwdIstl / PwdUsr) completely
			const filteredValues = res.data[0].values.filter(
				param => param.channelId && !param.channelId.startsWith('Parameter.Acs.'),
			);

			const sanitizedDebugData = [
				{
					...res.data[0],
					values: filteredValues,
				},
			];
			const jsonString = JSON.stringify(sanitizedDebugData);

			await this.setState('Debug.All_Parameters', { val: jsonString, ack: true });
			this.log.debug(jsonString);

			for (const param of filteredValues) {
				const cleanId = this.sanitizeId(param.channelId);
				editableMap[cleanId] = Boolean(param.editable);

				let rawValue = '';
				if (param.value !== undefined) {
					rawValue = param.value;
				} else if (Array.isArray(param.values) && param.values.length > 0) {
					rawValue = param.values;
				}

				const isNumber = rawValue !== '' && !isNaN(Number(rawValue));
				const finalValue = isNumber ? Number(rawValue) : String(rawValue);
				this.wallboxValues[cleanId] = finalValue;

				// Create objects in tree only if expert mode is active
				if (this.config.expertMode) {
					const parts = cleanId.split('.');
					let currentPath = '';
					for (let p = 0; p < parts.length - 1; p++) {
						currentPath = currentPath ? `${currentPath}.${parts[p]}` : parts[p];
						await this.setObjectNotExistsAsync(currentPath, {
							type: 'channel',
							common: { name: parts[p] },
							native: {},
						});
					}

					const isEditable = Boolean(param.editable);
					let role = 'value';
					if (isEditable) {
						role = isNumber ? 'level' : 'text';
					} else if (!isNumber) {
						role = 'text';
					}

					const commonObj = {
						name: param.channelId,
						role: role,
						read: true,
						write: isEditable,
					};

					if (isNumber && param.min !== undefined) {
						commonObj.min = Number(param.min);
					}
					if (isNumber && param.max !== undefined) {
						commonObj.max = Number(param.max);
					}

					await this.extendObject(cleanId, {
						type: 'state',
						common: {
							...commonObj,
							type: isNumber ? 'number' : 'string',
						},
						native: { channelId: param.channelId },
					});
					await this.setState(cleanId, { val: finalValue, ack: true });
				}
			}

			this.log.info(`Success! Found ${filteredValues.length} parameters and saved to Debug.All_Parameters.`);
		} catch (error) {
			const details = error.response
				? `${error.response.status} - ${JSON.stringify(error.response.data)}`
				: error.message;
			this.log.error(`Error fetching parameters: ${details}`);
		}
		return editableMap;
	}

	async readLiveValues() {
		try {
			// Fetch live measurements
			const liveRes = await this.smaRequest('post', '/api/v1/measurements/live/', [
				{ componentId: 'IGULD:SELF' },
			]);
			if (!liveRes || !liveRes.data) {
				this.log.warn('No data received from SMA wallbox.');
				return;
			}

			const consumption = Number(this.config.carConsumption) || 0;
			if (consumption > 0) {
				await this.extendObject('Live.sessionRange', {
					type: 'state',
					common: {
						name: 'Charged range of current session',
						type: 'number',
						role: 'value.distance',
						unit: 'km',
						read: true,
						write: false,
					},
					native: {},
				});
			}

			if (Array.isArray(liveRes.data)) {
				for (const item of liveRes.data) {
					const targetDp = this.liveMapping[item.channelId];
					if (targetDp && item.values && item.values.length > 0) {
						const val = Number(item.values[0].value);
						this.setState(`Live.${targetDp}`, { val: val, ack: true });

						if (targetDp === 'vehicleStatus') {
							if (val === 200111 && this.lastVehicleStatus !== 200111) {
								const hasRangeDp = this.controlStates.some(c => c.id === 'Control.planTargetRange');
								if (hasRangeDp) {
									await this.setState('Control.planTargetRange', { val: 0, ack: true });
									if (this.lastVehicleStatus !== null) {
										this.log.info(
											'Charging cable disconnected – target range (Control.planTargetRange) reset to 0.',
										);
									}
								}
							}
							this.lastVehicleStatus = val;
						}
						// Calculate range of current session in km
						if (targetDp === 'sessionEnergy') {
							const currentConsumption = Number(this.config.carConsumption) || 0;
							if (currentConsumption > 0) {
								const rangeKm = Number(((val / 1000 / currentConsumption) * 100).toFixed(1));
								await this.setState('Live.sessionRange', { val: rangeKm, ack: true });
							}
						}
					}
				}
			}

			// Fetch all target parameters in a single request
			const paramRes = await this.smaRequest('post', '/api/v1/parameters/search/', { queryItems: queryItems });

			if (paramRes && Array.isArray(paramRes.data)) {
				for (let i = 0; i < paramRes.data.length; i++) {
					const componentObj = paramRes.data[i];

					if (componentObj && Array.isArray(componentObj.values)) {
						for (let j = 0; j < componentObj.values.length; j++) {
							const item = componentObj.values[j];
							const rawVal = item.value;

							const finalVal = rawVal !== '' && !isNaN(Number(rawVal)) ? Number(rawVal) : String(rawVal);

							const cleanId = this.sanitizeId(item.channelId);

							// Wert intern merken
							this.wallboxValues[cleanId] = finalVal;

							// Im Expertenmodus den Parameter.*-Datenpunkt aktualisieren
							if (this.config.expertMode) {
								await this.setState(cleanId, finalVal, true);
							}


							const syncItem = this.controlStates.find(c => c.channelId === item.channelId);
							if (syncItem && typeof finalVal === 'number') {
								const targetControlVal = this.toControlValue(item.channelId, finalVal);
								const controlState = await this.getStateAsync(syncItem.id);
								if (
									controlState &&
									controlState.ack === true &&
									controlState.val !== targetControlVal
								) {
									await this.setState(syncItem.id, { val: targetControlVal, ack: true });
									this.log.debug(`SMA Sync: Updated ${syncItem.id} to ${targetControlVal}.`);
								}
							}
						}
					}
				}
			}
			await this.setState('info.connection', true, true);
		} catch (error) {
			await this.setState('info.connection', false, true);
			const details = error.response ? JSON.stringify(error.response.data) : error.message;
			this.log.error(`Error reading live values: ${details}`);
		}
	}

	async onMessage(obj) {
		if (obj && obj.command === 'cleanupOrphans') {
			try {
				const resultText = await this.cleanupOrphanedStates();
				if (obj.callback) {
					this.sendTo(obj.from, obj.command, { result: resultText }, obj.callback);
				}
			} catch (err) {
				this.log.error(`Error during cleanup: ${err.message}`);
				if (obj.callback) {
					this.sendTo(obj.from, obj.command, { error: err.message }, obj.callback);
				}
			}
		}
	}

	async cleanupOrphanedStates() {
		let deletedCount = 0;
		let skippedCustomCount = 0;

		const allObjs = await this.getAdapterObjectsAsync();
		const allowedControlIds = new Set(this.controlStates.map(item => item.id));
		const editableMap = this.editableMap || {};

		// Sort longest IDs first so states are processed before their parent channels
		const sortedEntries = Object.entries(allObjs).sort((a, b) => b[0].length - a[0].length);

		for (const [fullObjId, obj] of sortedEntries) {
			const shortObjId = fullObjId.replace(`${this.namespace}.`, '');
			if (!obj || (obj.type !== 'state' && obj.type !== 'channel')) {
				continue;
			}

			// Delete orphaned channel folders under Parameter.* if expert mode is off
			if (obj.type === 'channel') {
				if (shortObjId.startsWith('Parameter.') && !this.config.expertMode) {
					await this.delObjectAsync(shortObjId);
				}
				continue;
			}
			let isOrphan = false;

			// 1. Check if Parameter.* is orphaned
			if (shortObjId.startsWith('Parameter.')) {
				if (!this.config.expertMode) {
					isOrphan = true;
				} else if (Object.keys(editableMap).length > 0 && editableMap[shortObjId] === undefined) {
					isOrphan = true;
				}
			}

			// 2. Check if Control.* is orphaned
			if (shortObjId.startsWith('Control.') && !allowedControlIds.has(shortObjId)) {
				isOrphan = true;
			}

			if (!isOrphan) {
				continue;
			}

			// 3. Protect states with active custom settings (History, InfluxDB, SQL, etc.)
			if (obj.common?.custom && Object.keys(obj.common.custom).length > 0) {
				skippedCustomCount++;
				this.log.warn(
					`Skipped deletion of ${shortObjId}: active custom settings (e.g. History/InfluxDB) found.`,
				);
				continue;
			}

			await this.delObjectAsync(shortObjId);
			deletedCount++;
			this.log.info(`Deleted orphaned state: ${shortObjId}`);
		}

		const summary = `Cleanup finished: ${deletedCount} state(s) deleted, ${skippedCustomCount} skipped due to active recording (History/InfluxDB).`;
		this.log.info(summary);
		return summary;
	}

	parseDateToUnixSeconds(input) {
		if (!input || typeof input !== 'string') {
			return null;
		}
		const trimmed = input.trim();

		// 1. Check German format: DD.MM.YYYY HH:MM (seconds optional)
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

		// 2. Check ISO / standard format: YYYY-MM-DD HH:MM or ISO string
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

		// CASE 1: Control command (ack === false)
		if (!state.ack) {
			if (shortId === 'Control.planTargetTimeInput') {
				const unixSec = this.parseDateToUnixSeconds(String(state.val));
				if (unixSec === null) {
					this.log.warn(
						`Invalid date format "${state.val}". Please use DD.MM.YYYY HH:MM or YYYY-MM-DD HH:MM.`,
					);
					await this.setState('Control.planTargetTimeInput', { val: '', ack: true });
					return;
				}
				await this.setState('Control.planTargetTimeInput', { val: String(state.val).trim(), ack: true });
				this.log.debug(`Converted date "${state.val}" to epoch timestamp ${unixSec}.`);

				await this.setValueOneCharger('Parameter.Chrg.Plan.StopTm', 'Control.planStopTime', unixSec);
				return;
			}

			if (shortId === 'Control.planTargetRange') {
				const targetKm = Number(state.val);
				const consumption = Number(this.config.carConsumption) || 0;

				if (isNaN(targetKm) || targetKm < 0 || consumption <= 0) {
					this.log.warn(`Ignored invalid target range "${state.val}" km.`);
					const currentEn = Number(this.wallboxValues['Parameter.Chrg.Plan.En']) || 0;
					const fallbackKm = consumption > 0 ? Number(((currentEn * 100) / consumption).toFixed(1)) : 0;
					await this.setState('Control.planTargetRange', { val: fallbackKm, ack: true });
					return;
				}

				const targetKwh = Number(((targetKm * consumption) / 100).toFixed(2));
				this.log.info(`Converted target range ${targetKm} km to ${targetKwh} kWh.`);

				await this.setValueOneCharger('Parameter.Chrg.Plan.En', 'Control.planTargetEnergy', targetKwh);

				const appliedEn = Number(this.wallboxValues['Parameter.Chrg.Plan.En']) || 0;
				const appliedKm = Number(((appliedEn * 100) / consumption).toFixed(1));
				await this.setState('Control.planTargetRange', { val: appliedKm, ack: true });
				return;
			}

			// Direct write to Parameter.* states in expert mode (resolves sanitized IDs via native.channelId)
			if (this.config.expertMode && shortId.startsWith('Parameter.')) {
				const paramObj = await this.getObjectAsync(shortId);
				const realChannelId = paramObj?.native?.channelId || shortId;
				await this.setValueOneCharger(realChannelId, shortId, state.val);
				return;
			}

			const controlItem = this.controlStates.find(item => item.id === shortId);
			if (controlItem) {
				await this.setValueOneCharger(controlItem.channelId, controlItem.id, state.val);
			}
			return;
		}

		// CASE 2: Value from wallbox (ack === true)
		const syncItem = this.controlStates.find(item => item.channelId && item.channelId === shortId);
		if (syncItem) {
			const wallboxVal = Number(state.val);
			if (!isNaN(wallboxVal)) {
				const targetControlVal = this.toControlValue(syncItem.channelId, wallboxVal);
				const controlState = await this.getStateAsync(syncItem.id);

				if (controlState && controlState.ack === true && controlState.val !== targetControlVal) {
					await this.setState(syncItem.id, { val: targetControlVal, ack: true });
					this.log.debug(`SMA Sync: Updated ${syncItem.id} to ${targetControlVal}.`);
				}
			}
		}
	}

	toControlValue(channelId, rawVal) {
		if (channelId === 'Parameter.Chrg.ChrgApv') {
			return Number(rawVal) === 5172;
		}
		if (channelId === 'Parameter.Chrg.ChrgLok') {
			return Number(rawVal) === 1129;
		}
		return Number(rawVal);
	}

	toWallboxValue(channelId, controlVal) {
		if (channelId === 'Parameter.Chrg.ChrgApv') {
			if (typeof controlVal === 'boolean') {
				return controlVal ? 5172 : 5171;
			}
		}
		if (channelId === 'Parameter.Chrg.ChrgLok') {
			if (typeof controlVal === 'boolean') {
				return controlVal ? 1129 : 1130;
			}
		}
		return Number(controlVal);
	}

	async resetControlToWallboxValue(param, dp) {
		const cleanParam = this.sanitizeId(param);
		const wallboxVal = this.wallboxValues[cleanParam] ?? this.wallboxValues[param];
		if (wallboxVal !== undefined && wallboxVal !== null) {
			const controlVal = dp.startsWith('Control.') ? this.toControlValue(param, wallboxVal) : wallboxVal;
			await this.setState(dp, { val: controlVal, ack: true });
		}
	}

	async setValueOneCharger(param, dp, value) {
		const numVal = this.toWallboxValue(param, value);
		const cleanParam = this.sanitizeId(param);

		// 1. Type check: allow valid numbers only
		if (isNaN(numVal)) {
			this.log.warn(`Ignored invalid value "${value}" for ${param}.`);
			await this.resetControlToWallboxValue(param, dp);
			return;
		}

		// 2. Check min/max limits from getControlStates()
		const controlConfig = this.controlStates.find(item => item.channelId === param);
		if (controlConfig && controlConfig.common) {
			if (controlConfig.common.min !== undefined && numVal < controlConfig.common.min) {
				this.log.warn(`Value ${numVal} for ${param} is below minimum (${controlConfig.common.min}).`);
				await this.resetControlToWallboxValue(param, dp);
				return;
			}
			if (controlConfig.common.max !== undefined && numVal > controlConfig.common.max) {
				this.log.warn(`Value ${numVal} for ${param} exceeds maximum (${controlConfig.common.max}).`);
				await this.resetControlToWallboxValue(param, dp);
				return;
			}
		}

		// 2b. Plausibility check for charging plan energy amount
		if (param === 'Parameter.Chrg.Plan.En' && numVal > 0) {
			const sessionState = await this.getStateAsync('Live.sessionEnergy');
			if (sessionState && typeof sessionState.val === 'number') {
				const sessionKwh = Number((sessionState.val / 1000).toFixed(3));
				if (numVal < sessionKwh) {
					this.log.warn(
						`Charging plan energy (${numVal} kWh) must not be less than already charged session energy (${sessionKwh} kWh).`,
					);
					await this.resetControlToWallboxValue(param, dp);
					return;
				}
			}
		}

		// 3. Duplicate filter: do not send if parameter already has this value
		const currentWallboxVal = this.wallboxValues[cleanParam] ?? this.wallboxValues[param];
		if (currentWallboxVal !== undefined && Number(currentWallboxVal) === numVal) {
			this.log.debug(`SMA eCharger ${param} is already set to ${numVal} – no write command needed.`);
			const ackVal = dp.startsWith('Control.') ? this.toControlValue(param, numVal) : numVal;
			await this.setState(dp, { val: ackVal, ack: true });
			return;
		}

		const COOLDOWN_MS = 5000;
		const now = Date.now();
		const lastWrite = this.lastWriteTimes[param] || 0;

		if (now - lastWrite < COOLDOWN_MS) {
			const waitSec = ((COOLDOWN_MS - (now - lastWrite)) / 1000).toFixed(1);
			this.log.warn(`Rate limit: Write command for ${param} blocked (please wait ${waitSec}s).`);
			await this.resetControlToWallboxValue(param, dp);
			return;
		}

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
				this.log.info(`SMA eCharger ${param} successfully set to ${numVal} (HTTP ${putResponse.status})`);
				this.wallboxValues[cleanParam] = numVal;

				// Acknowledge target state (Control.* gets converted boolean/number, Parameter.* gets raw number)
				const ackVal = dp.startsWith('Control.') ? this.toControlValue(param, numVal) : numVal;
				await this.setState(dp, { val: ackVal, ack: true });

				// Keep sanitized Parameter.* state in sync if expertMode is active
				if (this.config.expertMode && dp !== cleanParam) {
					await this.setState(cleanParam, { val: numVal, ack: true });
				}
			}
		} catch (error) {
			delete this.lastWriteTimes[param];
			const details = error.response ? JSON.stringify(error.response.data) : error.message;
			this.log.error(`SMA eCharger error setting ${param}: ${details}`);
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
