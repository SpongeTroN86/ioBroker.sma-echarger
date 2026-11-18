const axios = require('axios');
const https = require('https');

// ================= KONFIGURATION =================
const WALLBOX_IP = '192.168.10.219'; // IP-Adresse deines SMA eChargers
const USERNAME = 'user';          // 'admin' erforderlich für Parameter.Inverter.WMax
const PASSWORD = '***';  // Passwort der Weboberfläche
const DP_PREFIX = '0_userdata.0.Wallbox.SMA.';
// =================================================

const httpsAgent = new https.Agent({ rejectUnauthorized: false });
let cachedToken = null; // Zwischenspeicher für das Access-Token

// Hilfsfunktion: Token aus Cache liefern oder neu anfordern
async function getToken(forceRefresh = false) {
    if (cachedToken && !forceRefresh) {
        return cachedToken;
    }
    const response = await axios.post(
        `https://${WALLBOX_IP}/api/v1/token`,
        `grant_type=password&username=${encodeURIComponent(USERNAME)}&password=${encodeURIComponent(PASSWORD)}`,
        {
            httpsAgent: httpsAgent,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        }
    );
    cachedToken = response.data.access_token;
    return cachedToken;
}

// Hilfsfunktion: API-Aufrufe mit automatischem Retry bei abgelaufenem Token (401)
async function smaRequest(method, endpoint, data) {
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const token = await getToken(attempt > 0);
            return await axios.request({
                method: method,
                url: `https://${WALLBOX_IP}${endpoint}`,
                data: data,
                httpsAgent: httpsAgent,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
        } catch (error) {
            // Bei 401 (Token abgelaufen) Cache leeren und zweiten Versuch starten
            if (error.response && error.response.status === 401 && attempt === 0) {
                cachedToken = null;
                continue;
            }
            throw error;
        }
    }
}

const LIVE_MAPPING = {
    'Measurement.Metering.GridMs.TotWIn.ChaSta': 'Ladeleistung_W',
    'Measurement.Metering.GridMs.TotWhIn.ChaSta': 'Gesamtenergie_Wh',
    'Measurement.ChaSess.WhIn': 'Sitzungsenergie_Wh',
    'Measurement.Operation.EVeh.ChaStt': 'Fahrzeug_Status',
    'Measurement.Operation.Health': 'Geraete_Status',
    'Measurement.GridMs.A.phsA': 'Strom_L1_A',
    'Measurement.GridMs.A.phsB': 'Strom_L2_A',
    'Measurement.GridMs.A.phsC': 'Strom_L3_A',
    'Measurement.GridMs.PhV.phsA': 'Spannung_L1_V',
    'Measurement.GridMs.PhV.phsB': 'Spannung_L2_V',
    'Measurement.GridMs.PhV.phsC': 'Spannung_L3_V'
    // Hier einfach weitere Kanäle ergänzen...
};
const LIVE_POINTS = [
    { channel: 'Measurement.Metering.GridMs.TotWIn.ChaSta', dp: 'Ladeleistung_W', name: 'Aktuelle Ladeleistung', unit: 'W' },
    { channel: 'Measurement.Metering.GridMs.TotWhIn.ChaSta', dp: 'Gesamtenergie_Wh', name: 'Geladene Gesamtenergie', unit: 'Wh' },
    { channel: 'Measurement.ChaSess.WhIn', dp: 'Sitzungsenergie_Wh', name: 'Energie aktuelle Ladung', unit: 'Wh' },
    { channel: 'Measurement.Operation.EVeh.ChaStt', dp: 'Fahrzeug_Status', name: 'Status Fahrzeug/Ladung', unit: '' },
    { channel: 'Measurement.Operation.Health', dp: 'Geraete_Status', name: 'Status Wallbox', unit: '' },
    { channel: 'Measurement.GridMs.A.phsA', dp: 'Strom_L1_A', name: 'Ladestrom Phase L1', unit: 'A' },
    { channel: 'Measurement.GridMs.A.phsB', dp: 'Strom_L2_A', name: 'Ladestrom Phase L2', unit: 'A' },
    { channel: 'Measurement.GridMs.A.phsC', dp: 'Strom_L3_A', name: 'Ladestrom Phase L3', unit: 'A' },
    { channel: 'Measurement.GridMs.PhV.phsA', dp: 'Spannung_L1_V', name: 'Spannung Phase L1', unit: 'V' },
    { channel: 'Measurement.GridMs.PhV.phsB', dp: 'Spannung_L2_V', name: 'Spannung Phase L2', unit: 'V' },
    { channel: 'Measurement.GridMs.PhV.phsC', dp: 'Spannung_L3_V', name: 'Spannung Phase L3', unit: 'V' }
];

// Alle Datenpunkte aus der Liste automatisch erzeugen
LIVE_POINTS.forEach(item => {
    if (!existsState(DP_PREFIX + "Live." + item.dp)) {
        createState(DP_PREFIX + "Live." + item.dp, 0, {
            name: item.name,
            type: 'number',
            unit: item.unit,
            read: true,
            write: false
        });
    }
});

const TARGET_PARAMS = [
    'Parameter.Chrg.ActChaMod',
    'Parameter.Inverter.WMax',
    'Parameter.Inverter.WMaxIn',
    'Parameter.Inverter.AcALim',
    'Parameter.Chrg.ChrgLok',
    'Parameter.Inverter.OutPhs',
    'Parameter.Chrg.Plan.DurTmm',
    'Parameter.Chrg.Plan.En',
    'Parameter.Chrg.Plan.StopTm'
];
const queryItems = TARGET_PARAMS.map(id => ({
    componentId: 'IGULD:SELF',
    channelId: id
}));

async function updateWallboxData() {
    try {
        // Live-Messwerte abrufen
        const liveRes = await smaRequest('post', '/api/v1/measurements/live/', [{ componentId: 'IGULD:SELF' }]);

        if (Array.isArray(liveRes.data)) {
            for (const item of liveRes.data) {
                const targetDp = LIVE_MAPPING[item.channelId];
                if (targetDp && item.values && item.values.length > 0) {
                    setState(DP_PREFIX + "Live." + targetDp, item.values[0].value, true);
                }
            }
        }
//////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Alle gewünschten Parameter in einem einzigen Request abrufen
        const paramRes = await smaRequest('post', '/api/v1/parameters/search/', {
            queryItems: queryItems
        });

        // Antwort prüfen und mit einer Schleife in die Datenpunkte schreiben
        if (Array.isArray(paramRes.data)) {
            for (let i = 0; i < paramRes.data.length; i++) {
                const componentObj = paramRes.data[i];

                if (componentObj && Array.isArray(componentObj.values)) {
                    for (let j = 0; j < componentObj.values.length; j++) {
                        const item = componentObj.values[j];
                        const rawVal = item.value;

                        // Prüfen, ob der Wert eine Zahl ist (z. B. "4719" oder "14.000")
                        const finalVal = (rawVal !== '' && !isNaN(Number(rawVal))) ? Number(rawVal) : String(rawVal);

                        // Schreibt z. B. in DP_PREFIX-{0_userdata.0.Wallbox.SMA.}- + item.channelId-{Parameter.Chrg.ActChaMod}-, -{finalVal}-, ack-{true}-
                        setState(DP_PREFIX + item.channelId, finalVal, true);
                        //console.log(`SMA eCharger Parameter ${item.channelId} ausgelesen: ${finalVal}`);
                    }
                }
            }
        }
    } catch (error) {
        const details = error.response ? JSON.stringify(error.response.data) : error.message;
        log(`SMA eCharger Lese-Fehler: ${details}`, 'error');
    }
}
schedule('*/15 * * * * *', updateWallboxData);

const SYNC_PAIRS = [
    {
        paramDp:   DP_PREFIX + 'Parameter.Chrg.ActChaMod',
        controlDp: DP_PREFIX + 'Control.Lademodus'
    },
    {
        paramDp:   DP_PREFIX + 'Parameter.Inverter.WMax',
        controlDp: DP_PREFIX + 'Control.Inverter_WMax'
    },
    {
        paramDp:   DP_PREFIX + 'Parameter.Inverter.WMaxIn',
        controlDp: DP_PREFIX + 'Control.Inverter_WMaxIn'
    },
    {
        paramDp:   DP_PREFIX + 'Parameter.Chrg.ChrgApv',
        controlDp: DP_PREFIX + 'Control.Ladefreigabe'
    }
];

// Schleife richtet für jedes Paar automatisch die Überwachung ein
SYNC_PAIRS.forEach(pair => {
    on({ id: pair.paramDp, change: 'any' }, (obj) => {
        const wallboxVal   = obj.state.val;
        const controlState = getState(pair.controlDp);

        // Nur synchronisieren, wenn Control-Datenpunkt bestätigt (ack: true) ist und abweicht
        if (controlState && controlState.ack === true && controlState.val !== wallboxVal) {
            setState(pair.controlDp, Number(wallboxVal), true);
            log(`SMA Sync: ${pair.controlDp} auf ${wallboxVal} aktualisiert.`, 'info');
        }
    });
});
