/**
 * obd2_server.js — OBD2 Performance Tuning & ECU Upgrade Tool Backend
 *
 * Provides a REST API for the obd2.html frontend to:
 *   - Detect and connect to OBD2 adapters (USB/BT/Wi-Fi/J2534)
 *   - Poll live OBD2 PIDs via ELM327 AT commands
 *   - Read / clear DTCs using ISO 15031 Mode $03/$04
 *   - Read and write ECU calibration maps (via UDS ISO 14229 / KWP2000)
 *   - Flash firmware/tune files to the ECU
 *
 * Mount this router in your main app.js:
 *   const obd2 = require('./obd2_server');
 *   app.use('/api/obd2', obd2);
 *
 * Dependencies (install separately):
 *   npm install serialport
 *
 * In a production deployment with real hardware:
 *   - Replace the DEMO_MODE simulation blocks with actual AT-command I/O.
 *   - Implement proper seed/key security access for UDS flashing.
 *   - Add TLS / auth middleware before exposing this router on a network.
 */

'use strict';

const express = require('express');
const path    = require('path');
const crypto  = require('crypto');

const router = express.Router();

// ─── Feature flags ────────────────────────────────────────────────────────────
// Set DEMO_MODE=false and install 'serialport' to use real hardware.
const DEMO_MODE = process.env.OBD2_DEMO !== 'false';

// ─── Adapter state (single-session) ─────────────────────────────────────────
const adapter = {
  connected: false,
  type: null,       // 'usb' | 'bluetooth' | 'wifi' | 'j2534'
  port: null,       // serialport instance or tcp socket
  protocol: null,   // detected OBD2 protocol
  vehicle: null     // VIN / ECU metadata
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function randBetween(a, b) {
  return +(a + Math.random() * (b - a)).toFixed(2);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function crc32(buf) {
  const table = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c;
    }
    return t;
  })();
  let crc = 0xFFFFFFFF;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  return ((crc ^ 0xFFFFFFFF) >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

// ─── ELM327 AT command layer (stub — replace with real serialport I/O) ────────
async function sendATCommand(cmd) {
  if (DEMO_MODE) {
    // Simulate ELM327 responses
    const responses = {
      'ATZ':   'ELM327 v2.2',
      'ATE0':  'OK',
      'ATL0':  'OK',
      'ATH1':  'OK',
      'ATSP0': 'OK',
      'ATRV':  '12.6V',
      '0902':  '014 49 02 01 31 48 47 42\n014 49 02 02 48 34 31 4A\n014 49 02 03 58 4D 4E 31\n014 49 02 04 30 39 31 38\n014 49 02 05 36 00 00 00'
    };
    await delay(80);
    return responses[cmd] || 'NO DATA';
  }
  // Real implementation: write to adapter.port, await response line
  throw new Error('Hardware communication not implemented. Set OBD2_DEMO=false only with serialport installed.');
}

// ─── OBD2 PID query ───────────────────────────────────────────────────────────
async function queryPID(mode, pid) {
  if (DEMO_MODE) {
    // Return simulated values for standard PIDs
    const sim = {
      '010C': randBetween(700, 6500),   // RPM
      '010D': randBetween(0, 180),      // Speed km/h
      '0105': randBetween(70, 105),     // Coolant temp
      '0111': randBetween(5, 95),       // Throttle %
      '0110': randBetween(2, 180),      // MAF g/s
      '010B': randBetween(95, 200),     // Manifold absolute pressure (boost proxy)
      '0104': randBetween(15, 95),      // Engine load %
      '010E': randBetween(8, 35),       // Timing advance
      '010F': randBetween(15, 55),      // Intake air temp
      '012F': randBetween(20, 100),     // Fuel level
      '0133': randBetween(95, 103)      // Barometric pressure
    };
    const key = mode.toString(16).padStart(2,'0').toUpperCase() +
                pid.toString(16).padStart(2,'0').toUpperCase();
    return sim[key] !== undefined ? sim[key] : null;
  }
  const cmdStr = mode.toString(16).padStart(2,'0') + pid.toString(16).padStart(2,'0');
  const raw = await sendATCommand(cmdStr);
  return parsePIDResponse(mode, pid, raw);
}

function parsePIDResponse(mode, pid, raw) {
  // Basic parsing for common PIDs — expand for full SAE J1979 set
  const bytes = raw.replace(/\s/g,'').match(/.{2}/g)?.slice(2).map(h=>parseInt(h,16)) || [];
  if (!bytes.length) return null;
  if (mode === 0x01) {
    if (pid === 0x0C) return ((bytes[0]*256 + bytes[1]) / 4);     // RPM
    if (pid === 0x0D) return bytes[0];                             // Speed km/h
    if (pid === 0x05) return bytes[0] - 40;                       // Coolant °C
    if (pid === 0x11) return +(bytes[0] / 2.55).toFixed(1);       // Throttle %
    if (pid === 0x04) return +(bytes[0] / 2.55).toFixed(1);       // Load %
    if (pid === 0x0E) return +(bytes[0] / 2 - 64).toFixed(1);     // Timing advance
    if (pid === 0x0F) return bytes[0] - 40;                       // IAT °C
    if (pid === 0x2F) return +(bytes[0] / 2.55).toFixed(1);       // Fuel %
    if (pid === 0x10) return +((bytes[0]*256 + bytes[1]) / 100).toFixed(2); // MAF
  }
  return null;
}

// ─── DTC parsing ─────────────────────────────────────────────────────────────
async function readDTCsFromAdapter() {
  if (DEMO_MODE) {
    const codes = ['P0300','P0172','P0420'].slice(0, Math.floor(Math.random()*3)+1);
    return codes.map(c => ({ code: c, status: 'current', description: DTC_DESCRIPTIONS[c] || 'Unknown fault' }));
  }
  const raw = await sendATCommand('03');
  return parseDTCs(raw);
}

function parseDTCs(raw) {
  const dtcs = [];
  const bytes = raw.replace(/[\r\n]/g,'').replace(/\s/g,'').match(/.{2}/g) || [];
  for (let i = 1; i < bytes.length; i += 2) {
    const b0 = parseInt(bytes[i], 16);
    const b1 = parseInt(bytes[i+1]||'00', 16);
    if (b0 === 0 && b1 === 0) continue;
    const prefix = ['P','C','B','U'][(b0 >> 6) & 0x03];
    const digit1 = (b0 >> 4) & 0x03;
    const code = prefix + digit1 + ((b0 & 0x0F)).toString(16).toUpperCase() + bytes[i+1].toUpperCase();
    dtcs.push({ code, status: 'current', description: DTC_DESCRIPTIONS[code] || 'Unknown fault' });
  }
  return dtcs;
}

const DTC_DESCRIPTIONS = {
  P0100:'Mass Air Flow Sensor — Circuit Malfunction',
  P0101:'MAF Sensor — Range/Performance',
  P0115:'Engine Coolant Temperature — Circuit Malfunction',
  P0121:'Throttle Position Sensor A — Range/Performance',
  P0171:'Fuel System Too Lean (Bank 1)',
  P0172:'Fuel System Too Rich (Bank 1)',
  P0300:'Random/Multiple Cylinder Misfire',
  P0420:'Catalyst Efficiency Below Threshold (Bank 1)',
  P0440:'EVAP System Malfunction',
  P0500:'Vehicle Speed Sensor Malfunction'
};

// ─── VIN decoding ─────────────────────────────────────────────────────────────
async function readVIN() {
  if (DEMO_MODE) return '1HGBH41JXMN109186';
  const raw = await sendATCommand('0902');
  // Extract ASCII bytes from multi-line response
  const lines = raw.split('\n').map(l=>l.replace(/\s/g,''));
  const vinBytes = lines.flatMap(l=>l.match(/.{2}/g)||[]).filter(b=>parseInt(b,16)>0x20).map(b=>String.fromCharCode(parseInt(b,16)));
  return vinBytes.slice(3).join('').substring(0,17) || 'UNKNOWN';
}

function decodeVINMake(vin) {
  const wmi = { '1HG':'Honda', '1G1':'Chevrolet', '1FA':'Ford', 'WBA':'BMW', 'WDD':'Mercedes-Benz', 'JTD':'Toyota', 'SAL':'Land Rover' };
  const brand = wmi[vin.substring(0,3)] || 'Unknown';
  return brand;
}

// ─── UDS Flash protocol (stub) ────────────────────────────────────────────────
const flashState = {
  active: false,
  progress: 0,
  step: '',
  log: []
};

function appendFlashLog(msg) {
  const ts = new Date().toLocaleTimeString();
  flashState.log.push(`[${ts}] ${msg}`);
  if (flashState.log.length > 500) flashState.log.shift();
}

async function performECUFlash(fileBuffer, fileName) {
  flashState.active = true;
  flashState.progress = 0;
  flashState.log = [];

  const steps = [
    { pct: 0,   label: 'Initiating diagnostic session (UDS 0x10)' },
    { pct: 10,  label: 'Requesting security access (UDS 0x27 Seed)' },
    { pct: 20,  label: 'Sending security key (UDS 0x27 Key)' },
    { pct: 30,  label: 'Requesting memory erase (UDS 0x31)' },
    { pct: 45,  label: 'Transferring data (UDS 0x36) — block 1/4' },
    { pct: 60,  label: 'Transferring data (UDS 0x36) — block 2/4' },
    { pct: 72,  label: 'Transferring data (UDS 0x36) — block 3/4' },
    { pct: 84,  label: 'Transferring data (UDS 0x36) — block 4/4' },
    { pct: 90,  label: 'Transfer exit (UDS 0x37)' },
    { pct: 95,  label: 'Verifying checksum (UDS 0x31 0xFF01)' },
    { pct: 98,  label: 'ECU reset (UDS 0x11)' },
    { pct: 100, label: 'Flash complete — ECU online' }
  ];

  for (const step of steps) {
    flashState.step = step.label;
    flashState.progress = step.pct;
    appendFlashLog(step.label);
    if (DEMO_MODE) {
      await delay(800);
    } else {
      // Replace with real UDS command sends
      throw new Error('Real UDS flashing not implemented without hardware driver');
    }
  }
  flashState.active = false;
  appendFlashLog(`Flash success. File: ${fileName} · CRC-32: ${crc32(fileBuffer)}`);
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/obd2/ports — list available serial ports
router.get('/ports', async (req, res) => {
  if (DEMO_MODE) {
    return res.json({ ports: [
      { path: '/dev/ttyUSB0', desc: 'ELM327 USB (demo)' },
      { path: '/dev/ttyUSB1', desc: 'Generic Serial (demo)' },
      { path: 'COM3',         desc: 'ELM327 USB (demo)' }
    ]});
  }
  try {
    const { SerialPort } = require('serialport');
    const ports = await SerialPort.list();
    res.json({ ports: ports.map(p => ({ path: p.path, desc: p.manufacturer || p.friendlyName || '' })) });
  } catch (e) {
    res.status(500).json({ error: 'serialport module not available: ' + e.message });
  }
});

// POST /api/obd2/connect — connect to OBD2 adapter
router.post('/connect', async (req, res) => {
  const { type, port, baud, protocol } = req.body;
  try {
    if (DEMO_MODE) {
      await delay(600);
      const vin = await readVIN();
      const elmVer = await sendATCommand('ATZ');
      const voltage = await sendATCommand('ATRV');
      adapter.connected = true;
      adapter.type = type || 'demo';
      adapter.vehicle = {
        vin,
        ecu: 'ECM-' + crypto.randomBytes(3).toString('hex').toUpperCase(),
        proto: protocol === 'auto' ? 'ISO 15765-4 CAN (11-bit, 500k)' : protocol,
        make: decodeVINMake(vin) + ' Civic Si',
        year: '2022',
        engine: '1.5L Turbo 4-cyl (K20C4)',
        adapter: 'ELM327 v2.2 (USB)',
        elm: elmVer,
        voltage
      };
      return res.json({ ok: true, vehicle: adapter.vehicle });
    }

    const { SerialPort } = require('serialport');
    const sp = new SerialPort({ path: port, baudRate: parseInt(baud) || 38400 });
    adapter.port = sp;
    adapter.type = type;

    await sendATCommand('ATZ');
    await sendATCommand('ATE0');
    await sendATCommand('ATL0');
    await sendATCommand('ATH1');
    await sendATCommand('ATSP0');

    const vin = await readVIN();
    const voltage = await sendATCommand('ATRV');
    adapter.connected = true;
    adapter.vehicle = { vin, voltage, proto: 'Auto', make: decodeVINMake(vin), elm: 'ELM327' };
    res.json({ ok: true, vehicle: adapter.vehicle });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/obd2/disconnect — disconnect adapter
router.post('/disconnect', async (req, res) => {
  if (adapter.port && adapter.port.close) {
    try { await new Promise(r => adapter.port.close(r)); } catch (_) {}
  }
  adapter.connected = false;
  adapter.port = null;
  adapter.vehicle = null;
  res.json({ ok: true });
});

// GET /api/obd2/live — poll a set of PIDs
router.get('/live', async (req, res) => {
  if (!adapter.connected && !DEMO_MODE) return res.status(409).json({ error: 'Not connected' });
  const pids = [
    { label:'rpm',      mode:0x01, pid:0x0C },
    { label:'speed',    mode:0x01, pid:0x0D },
    { label:'coolant',  mode:0x01, pid:0x05 },
    { label:'throttle', mode:0x01, pid:0x11 },
    { label:'maf',      mode:0x01, pid:0x10 },
    { label:'load',     mode:0x01, pid:0x04 },
    { label:'ignition', mode:0x01, pid:0x0E },
    { label:'intake',   mode:0x01, pid:0x0F },
    { label:'fuel',     mode:0x01, pid:0x2F }
  ];
  const result = {};
  for (const p of pids) {
    result[p.label] = await queryPID(p.mode, p.pid);
  }
  res.json({ ok: true, data: result, ts: Date.now() });
});

// GET /api/obd2/dtcs — read stored DTCs
router.get('/dtcs', async (req, res) => {
  if (!adapter.connected && !DEMO_MODE) return res.status(409).json({ error: 'Not connected' });
  try {
    const dtcs = await readDTCsFromAdapter();
    res.json({ ok: true, dtcs });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/obd2/dtcs/clear — clear DTCs (Mode $04)
router.post('/dtcs/clear', async (req, res) => {
  if (!adapter.connected && !DEMO_MODE) return res.status(409).json({ error: 'Not connected' });
  if (!DEMO_MODE) await sendATCommand('04');
  res.json({ ok: true, message: 'DTCs cleared' });
});

// GET /api/obd2/readiness — OBD readiness monitors (Mode $01 PID $01)
router.get('/readiness', async (req, res) => {
  const monitors = [
    'Misfire','Fuel System','Comprehensive Component','Catalyst',
    'Heated Catalyst','Evaporative System','Secondary Air',
    'O2 Sensor','O2 Heater','EGR System'
  ];
  const result = monitors.map(m => ({
    name: m,
    status: DEMO_MODE ? (Math.random() > 0.2 ? 'ready' : 'not-ready') : 'unknown'
  }));
  res.json({ ok: true, monitors: result });
});

// GET /api/obd2/maps/:type — read ECU calibration map
router.get('/maps/:type', async (req, res) => {
  if (!adapter.connected && !DEMO_MODE) return res.status(409).json({ error: 'Not connected' });
  const { type } = req.params;
  const validTypes = ['fuel', 'ignition', 'boost'];
  if (!validTypes.includes(type)) return res.status(400).json({ error: 'Unknown map type' });

  const rows = 10, cols = 13;
  const ranges = { fuel: [55,95], ignition: [8,38], boost: [60,140] };
  const [lo, hi] = ranges[type];
  const data = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => +randBetween(lo, hi).toFixed(1))
  );
  res.json({ ok: true, type, data, rpmAxis: [600,1000,1500,2000,2500,3000,3500,4000,4500,5000,5500,6000,6500], loadAxis: [10,20,30,40,50,60,70,80,90,100] });
});

// POST /api/obd2/maps/:type — write calibration map to ECU
router.post('/maps/:type', async (req, res) => {
  const { type } = req.params;
  const { data } = req.body;
  if (!data || !Array.isArray(data)) return res.status(400).json({ error: 'Missing map data' });
  if (!adapter.connected && !DEMO_MODE) return res.status(409).json({ error: 'Not connected' });
  // In production: encode data as UDS WriteDataByIdentifier (0x2E) blocks and transmit
  appendFlashLog(`Map "${type}" written to ECU (${data.length} rows × ${data[0]?.length || 0} cols)`);
  res.json({ ok: true, message: `${type} map written` });
});

// POST /api/obd2/flash — upload and flash a tune file
router.post('/flash', express.raw({ type: '*/*', limit: '16mb' }), async (req, res) => {
  if (!adapter.connected && !DEMO_MODE) return res.status(409).json({ error: 'Not connected' });
  if (flashState.active) return res.status(409).json({ error: 'Flash already in progress' });

  const fileName = req.headers['x-filename'] || 'tune.bin';
  const fileBuffer = req.body;

  // Validate file extension
  const ext = path.extname(fileName).toLowerCase();
  const allowed = ['.bin','.hex','.s19','.rom','.cal'];
  if (!allowed.includes(ext)) return res.status(400).json({ error: `Unsupported file type: ${ext}` });

  // Start flash asynchronously; single-session flash state tracks progress
  performECUFlash(fileBuffer, fileName).catch(e => appendFlashLog('FLASH ERROR: '+e.message));
  res.json({ ok: true, message: 'Flash started. Poll /flash/status for progress.' });
});

// GET /api/obd2/flash/status — poll flash progress
router.get('/flash/status', (req, res) => {
  res.json({
    active: flashState.active,
    progress: flashState.progress,
    step: flashState.step,
    log: flashState.log.slice(-50)
  });
});

// GET /api/obd2/backup — download current ECU image
router.get('/backup', async (req, res) => {
  if (!adapter.connected && !DEMO_MODE) return res.status(409).json({ error: 'Not connected' });
  const vin = adapter.vehicle?.vin || 'UNKNOWN';
  const timestamp = new Date().toISOString().replace(/[:.]/g,'-');
  const filename = `ecu_backup_${vin}_${timestamp}.bin`;
  // Simulated binary image — in production: read via UDS ReadMemoryByAddress (0x23)
  const header = Buffer.from(`RICHO OBD2 BACKUP\nVIN:${vin}\nDate:${new Date().toISOString()}\n`);
  const body   = DEMO_MODE ? crypto.randomBytes(4096) : Buffer.alloc(0);
  const image  = Buffer.concat([header, body]);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.send(image);
});

// GET /api/obd2/vehicle — vehicle info summary
router.get('/vehicle', (req, res) => {
  if (!adapter.connected && !DEMO_MODE) return res.status(409).json({ error: 'Not connected' });
  res.json({ ok: true, vehicle: adapter.vehicle || {} });
});

// ─── Export ───────────────────────────────────────────────────────────────────
module.exports = router;
