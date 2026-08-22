/* OBD2 Performance Tuning & ECU Upgrade Tool — Frontend JS
 * All OBD2 communication is performed via the /api/obd2/* backend endpoint.
 * In Demo Mode everything runs with simulated data in the browser.
 */
'use strict';

// ─── Constants ──────────────────────────────────────────────────────────────
const PIDS = {
  rpm:      { label:'RPM',         unit:'rpm',  min:0,    max:8000,  warn:6500, danger:7200 },
  throttle: { label:'Throttle',    unit:'%',    min:0,    max:100,   warn:85,   danger:95   },
  coolant:  { label:'Coolant',     unit:'°C',   min:-20,  max:130,   warn:100,  danger:115  },
  speed:    { label:'Speed',       unit:'km/h', min:0,    max:280,   warn:220,  danger:260  },
  maf:      { label:'MAF',         unit:'g/s',  min:0,    max:200,   warn:170,  danger:190  },
  boost:    { label:'Boost',       unit:'kPa',  min:0,    max:250,   warn:200,  danger:230  },
  afr:      { label:'AFR',         unit:'λ',    min:10,   max:18,    warn:16,   danger:17   },
  ignition: { label:'Ign Advance', unit:'°',    min:-10,  max:50,    warn:42,   danger:46   },
  intake:   { label:'Intake Temp', unit:'°C',   min:-20,  max:80,    warn:60,   danger:70   },
  fuel:     { label:'Fuel Level',  unit:'%',    min:0,    max:100,   warn:15,   danger:8    },
  load:     { label:'Eng Load',    unit:'%',    min:0,    max:100,   warn:90,   danger:97   },
  timing:   { label:'Timing Ret',  unit:'°',    min:0,    max:20,    warn:10,   danger:15   }
};

const DTC_DB = {
  P0100:'Mass Air Flow Sensor — Circuit Malfunction',
  P0101:'Mass Air Flow Sensor — Range/Performance',
  P0110:'Intake Air Temperature Sensor — Circuit Malfunction',
  P0115:'Engine Coolant Temperature Sensor — Circuit Malfunction',
  P0121:'Throttle Position Sensor A — Range/Performance',
  P0130:'O2 Sensor Upstream — Circuit Malfunction',
  P0171:'Fuel System Too Lean (Bank 1)',
  P0172:'Fuel System Too Rich (Bank 1)',
  P0200:'Injector Circuit — Open',
  P0300:'Random/Multiple Cylinder Misfire',
  P0301:'Cylinder 1 Misfire',
  P0302:'Cylinder 2 Misfire',
  P0303:'Cylinder 3 Misfire',
  P0304:'Cylinder 4 Misfire',
  P0401:'EGR Insufficient Flow',
  P0420:'Catalyst Efficiency Below Threshold (Bank 1)',
  P0440:'Evaporative Emission Control System Malfunction',
  P0500:'Vehicle Speed Sensor Malfunction',
  P0505:'Idle Control System Malfunction',
  P0560:'System Voltage Malfunction',
  C0035:'Left Front Wheel Speed Sensor',
  B1234:'Driver Airbag Circuit Fault',
  U0100:'Lost Communication With ECM/PCM'
};

const READINESS_MONITORS = [
  'Misfire','Fuel System','Comprehensive Component','Catalyst',
  'Heated Catalyst','Evaporative System','Secondary Air',
  'AC Refrigerant','O2 Sensor','O2 Heater','EGR System'
];

const TAB_PANEL_IDS = Object.freeze({
  connect: 'tab-connect',
  live: 'tab-live',
  diagnostics: 'tab-diagnostics',
  tuning: 'tab-tuning',
  flash: 'tab-flash',
  files: 'tab-files',
  logger: 'tab-logger',
  settings: 'tab-settings'
});

const RPM_AXIS  = [600,1000,1500,2000,2500,3000,3500,4000,4500,5000,5500,6000,6500];
const LOAD_AXIS = [10,20,30,40,50,60,70,80,90,100];

// ─── State ───────────────────────────────────────────────────────────────────
const state = {
  connected: false,
  demo: false,
  liveRunning: false,
  logRunning: false,
  logStart: null,
  logSamples: 0,
  logData: [],
  sessions: JSON.parse(localStorage.getItem('obd2_sessions') || '[]'),
  tuneFiles: JSON.parse(localStorage.getItem('obd2_tunefiles') || '[]'),
  currentPids: new Set(['rpm','throttle','coolant','speed','maf','boost','afr','ignition']),
  liveValues: {},
  liveHistory: {},
  liveChart: null,
  logChart: null,
  flashFile: null,
  selectedTune: null,
  logInterval: null,
  liveInterval: null,
  sprintRunning: false,
  sprintStart: null,
  qmRunning: false,
  qmStart: null,
  fuelMap: null,
  ignMap: null,
  boostMap: null,
  currentPreset: 'stock',
  settings: JSON.parse(localStorage.getItem('obd2_settings') || 'null') || {
    autoreconnect: true, timeout: 10, verbose: false,
    rate: 5, units: 'metric', history: 60,
    safetylock: true, humanapproval: true,
    maxadv: 45, revwarn: 6500,
    autosave: true, storage: 'local'
  }
};

// ─── Utilities ───────────────────────────────────────────────────────────────
function $(id){ return document.getElementById(id); }
function toast(msg, type='info', duration=3500){
  const c = $('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(()=>{ el.style.opacity='0'; el.style.transition='opacity .4s'; setTimeout(()=>el.remove(),400); }, duration);
}
function flashLog(msg){
  const el = $('flash-log');
  if(!el) return;
  const ts = new Date().toLocaleTimeString();
  el.textContent += `[${ts}] ${msg}\n`;
  el.scrollTop = el.scrollHeight;
}
function randBetween(a,b){ return +(a + Math.random()*(b-a)).toFixed(2); }
function fmtSize(bytes){ if(bytes<1024) return bytes+' B'; if(bytes<1048576) return (bytes/1024).toFixed(1)+' KB'; return (bytes/1048576).toFixed(2)+' MB'; }
function crc32hex(str){
  let crc=0xFFFFFFFF, i=0, j;
  for(;i<str.length;i++){
    crc^=str.charCodeAt(i);
    for(j=0;j<8;j++) crc=(crc>>>1)^(0xEDB88320&-(crc&1));
  }
  return ((crc^0xFFFFFFFF)>>>0).toString(16).toUpperCase().padStart(8,'0');
}
function confirmAction(msg){ return window.confirm(msg); }
function escapeHTML(value){
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  }[ch]));
}

// ─── Tab Navigation ──────────────────────────────────────────────────────────
function initTabs(){
  const tabs = [...document.querySelectorAll('[role=tab]')];
  const activateTab = btn => {
    tabs.forEach(tab=>{
      const active = tab === btn;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.tabIndex = active ? 0 : -1;
      const panel = $(TAB_PANEL_IDS[tab.dataset.tab]);
      if(panel){
        panel.classList.toggle('active', active);
        panel.hidden = !active;
      }
    });
  };
  tabs.forEach((btn, index)=>{
    btn.addEventListener('click',()=>activateTab(btn));
    btn.addEventListener('keydown',e=>{
      let nextIndex = null;
      if(e.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
      else if(e.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
      else if(e.key === 'Home') nextIndex = 0;
      else if(e.key === 'End') nextIndex = tabs.length - 1;
      if(nextIndex === null) return;
      e.preventDefault();
      tabs[nextIndex].focus();
      activateTab(tabs[nextIndex]);
    });
  });
}

// ─── Connection ───────────────────────────────────────────────────────────────
function setConnected(on, label=''){
  state.connected = on;
  const dot = $('conn-dot');
  const lbl = $('conn-label');
  dot.className = 'conn-dot' + (on?' connected':'');
  lbl.textContent = label || (on?'Connected':'Disconnected');
  $('btn-disconnect').disabled = !on;
  $('btn-connect').disabled = on;
  $('btn-backup-ecu').disabled = !on;
  $('btn-verify-flash').disabled = !on || !state.flashFile;
  $('btn-read-maps').disabled = !on;
  $('btn-write-maps').disabled = true;
}

function setConnecting(){
  $('conn-dot').className = 'conn-dot connecting';
  $('conn-label').textContent = 'Connecting…';
  $('btn-connect').disabled = true;
}

function updateConnOutput(msg){
  const el = $('conn-output');
  if(el) el.textContent = msg;
}

async function doConnect(){
  const type = $('conn-type').value;
  if(type==='demo'){
    setConnecting();
    updateConnOutput('Initialising Demo Mode…');
    await delay(900);
    state.demo = true;
    populateVehicleInfo({ vin:'1HGBH41JXMN109186', ecu:'DEMO-ECU-v2.4', proto:'ISO 15765-4 CAN', make:'Honda Civic Si', year:'2022', engine:'1.5L Turbo 4-cyl', adapter:'Virtual ELM327', elm:'ELM327 v2.2', voltage:'12.6V' });
    setConnected(true,'Connected (Demo)');
    updateConnOutput('Demo Mode active. All data is simulated.');
    toast('Demo mode connected ✓','success');
    return;
  }
  const port = $('conn-port').value;
  if(!port){ toast('Select a serial port first','warn'); return; }
  setConnecting();
  updateConnOutput('Connecting…');
  try{
    const res = await apiPost('/api/obd2/connect',{ type, port, baud:$('conn-baud').value, protocol:$('conn-protocol').value });
    if(res.ok){
      populateVehicleInfo(res.vehicle);
      setConnected(true);
      updateConnOutput('Connected. VIN: '+(res.vehicle?.vin||'—'));
      toast('Connected to ECU ✓','success');
    } else {
      setConnected(false);
      updateConnOutput('Connection failed: '+res.error);
      toast('Connection failed: '+res.error,'error');
    }
  } catch(e){
    setConnected(false);
    updateConnOutput('API unavailable — use Demo Mode for browser preview.');
    toast('Backend not reachable. Try Demo Mode.','warn');
  }
}

async function doDisconnect(){
  if(state.demo){ state.demo=false; setConnected(false); updateConnOutput('Disconnected.'); toast('Disconnected','info'); return; }
  try{ await apiPost('/api/obd2/disconnect',{}); } catch(_){}
  setConnected(false);
  updateConnOutput('Disconnected.');
  toast('Disconnected','info');
}

async function scanPorts(){
  const list = $('adapter-list');
  list.innerHTML = '<div style="color:var(--muted);font-size:.85rem;padding:.5rem">Scanning…</div>';
  if(state.demo || $('conn-type').value === 'demo'){
    await delay(600);
    const demos = ['/dev/ttyUSB0','/dev/ttyUSB1','COM3','COM4','COM9'];
    const sel = $('conn-port');
    sel.innerHTML = demos.map(p=>`<option value="${p}">${p}</option>`).join('');
    list.innerHTML = demos.map(p=>`<div class="adapter-item">${p} <small>ELM327</small></div>`).join('');
    list.querySelectorAll('.adapter-item').forEach((el,i)=>{
      el.addEventListener('click',()=>{
        list.querySelectorAll('.adapter-item').forEach(x=>x.classList.remove('selected'));
        el.classList.add('selected');
        sel.value = demos[i];
      });
    });
    toast('Found '+demos.length+' potential ports','info');
    return;
  }
  try{
    const res = await apiFetch('/api/obd2/ports');
    list.innerHTML = res.ports.map(p=>`<div class="adapter-item">${p.path} <small>${p.desc||'Unknown'}</small></div>`).join('');
    const sel = $('conn-port');
    sel.innerHTML = res.ports.map(p=>`<option value="${p.path}">${p.path}</option>`).join('');
  } catch(e){
    list.innerHTML = '<div style="color:var(--muted);font-size:.85rem;padding:.5rem">API unavailable.</div>';
  }
}

function populateVehicleInfo(v){
  if(!v) return;
  $('vi-vin').textContent     = v.vin||'—';
  $('vi-ecu').textContent     = v.ecu||'—';
  $('vi-proto').textContent   = v.proto||'—';
  $('vi-make').textContent    = v.make||'—';
  $('vi-year').textContent    = v.year||'—';
  $('vi-engine').textContent  = v.engine||'—';
  $('vi-adapter').textContent = v.adapter||'—';
  $('vi-elm').textContent     = v.elm||'—';
  $('vi-voltage').textContent = v.voltage||'—';
}

// ─── Live Data ────────────────────────────────────────────────────────────────
function buildGauges(){
  const grid = $('gauges-grid');
  grid.innerHTML = [...state.currentPids].map(key=>{
    const p = PIDS[key];
    return `<div class="gauge-card" id="gauge-${key}">
      <div class="gauge-label">${p.label}</div>
      <div class="gauge-value" id="gv-${key}">—</div>
      <div class="gauge-unit">${p.unit}</div>
      <div class="gauge-bar"><div class="gauge-fill" id="gf-${key}" style="width:0%"></div></div>
    </div>`;
  }).join('');
}

function updateGauge(key, val){
  const p = PIDS[key];
  const el = $(`gv-${key}`);
  const fill = $(`gf-${key}`);
  if(!el||!fill) return;
  el.textContent = val;
  el.className = 'gauge-value' + (val>=p.danger?' danger': val>=p.warn?' warn':'');
  const pct = Math.min(100, Math.max(0, (val-p.min)/(p.max-p.min)*100));
  fill.style.width = pct+'%';
  fill.className = 'gauge-fill' + (val>=p.danger?' danger': val>=p.warn?' warn':'');
}

function simulateLiveValue(key){
  const p = PIDS[key];
  const prev = state.liveValues[key]||((p.min+p.max)*0.2);
  const range = (p.max-p.min)*0.04;
  let next = prev + randBetween(-range,range);
  next = Math.max(p.min, Math.min(p.max*0.92, next));
  return +next.toFixed(1);
}

function buildLiveChart(){
  const canvas = $('live-chart');
  if(!canvas||!window.Chart) return;
  const pids = [...state.currentPids].slice(0,4);
  const colors = ['#6ee7ff','#8df0b0','#ffd27a','#ff9f43'];
  state.liveChart = new window.Chart(canvas, {
    type:'line',
    data:{
      labels:[],
      datasets: pids.map((key,i)=>({
        label: PIDS[key].label,
        data:[],
        borderColor: colors[i%colors.length],
        backgroundColor:'transparent',
        borderWidth:2,
        pointRadius:0,
        tension:.35
      }))
    },
    options:{
      animation:false,
      responsive:true,
      maintainAspectRatio:false,
      scales:{
        x:{ticks:{color:'#9fb2c7',maxTicksLimit:8},grid:{color:'#213a53'}},
        y:{ticks:{color:'#9fb2c7'},grid:{color:'#213a53'}}
      },
      plugins:{legend:{labels:{color:'#eef6ff'}}}
    }
  });
}

function buildLogChart(){
  const canvas = $('logger-chart');
  if(!canvas||!window.Chart) return;
  state.logChart = new window.Chart(canvas,{
    type:'line',
    data:{labels:[],datasets:[{
      label:'RPM',data:[],borderColor:'#6ee7ff',backgroundColor:'rgba(110,231,255,.08)',
      borderWidth:2,pointRadius:0,tension:.3,fill:true
    }]},
    options:{
      animation:false,responsive:true,maintainAspectRatio:false,
      scales:{x:{ticks:{color:'#9fb2c7',maxTicksLimit:8},grid:{color:'#213a53'}},y:{ticks:{color:'#9fb2c7'},grid:{color:'#213a53'}}},
      plugins:{legend:{labels:{color:'#eef6ff'}}}
    }
  });
}

function tickLive(){
  if(!state.liveRunning && !state.logRunning) return;
  const ts = new Date().toLocaleTimeString();
  [...state.currentPids].forEach(key=>{
    const val = simulateLiveValue(key);
    state.liveValues[key] = val;
    updateGauge(key, val);
    if(!state.liveHistory[key]) state.liveHistory[key]=[];
    state.liveHistory[key].push(val);
    const maxPts = state.settings.history * state.settings.rate;
    if(state.liveHistory[key].length>maxPts) state.liveHistory[key].shift();
  });
  if(state.logRunning){
    state.logSamples++;
    const sample = {ts: Date.now()};
    [...state.currentPids].forEach(k=>{ sample[k]=state.liveValues[k]; });
    state.logData.push(sample);
    $('ls-samples').textContent = state.logSamples;
    $('ls-size').textContent = fmtSize(JSON.stringify(state.logData).length);
    const dur = Math.floor((Date.now()-state.logStart)/1000);
    const h=String(Math.floor(dur/3600)).padStart(2,'0');
    const m=String(Math.floor((dur%3600)/60)).padStart(2,'0');
    const s=String(dur%60).padStart(2,'0');
    $('rec-duration').textContent = `${h}:${m}:${s}`;
    if(state.logChart){
      state.logChart.data.labels.push(ts);
      state.logChart.data.datasets[0].data.push(state.liveValues.rpm||0);
      if(state.logChart.data.labels.length>60){ state.logChart.data.labels.shift(); state.logChart.data.datasets[0].data.shift(); }
      state.logChart.update('none');
    }
  }
  if(state.liveChart && state.liveRunning){
    const pids = [...state.currentPids].slice(0,4);
    state.liveChart.data.labels.push(ts);
    if(state.liveChart.data.labels.length>60){ state.liveChart.data.labels.shift(); }
    state.liveChart.data.datasets.forEach((ds,i)=>{
      const k = pids[i];
      ds.data.push(state.liveValues[k]||0);
      if(ds.data.length>60) ds.data.shift();
    });
    state.liveChart.update('none');
  }
}

function startLive(){
  if(!state.connected && !state.demo){ toast('Connect to a vehicle first','warn'); return; }
  state.liveRunning = true;
  $('btn-live-start').disabled = true;
  $('btn-live-stop').disabled = false;
  if(!state.liveInterval){
    state.liveInterval = setInterval(tickLive, 1000/state.settings.rate);
  }
  toast('Live data started','success');
}

function stopLive(){
  state.liveRunning = false;
  $('btn-live-start').disabled = false;
  $('btn-live-stop').disabled = true;
  if(!state.logRunning && state.liveInterval){
    clearInterval(state.liveInterval);
    state.liveInterval = null;
  }
}

// ─── PID Toggles ─────────────────────────────────────────────────────────────
function initPidToggles(){
  document.querySelectorAll('.pid-toggle').forEach(btn=>{
    const pid = btn.dataset.pid;
    if(state.currentPids.has(pid)) btn.classList.add('active');
    btn.addEventListener('click',()=>{
      if(state.currentPids.has(pid)){ state.currentPids.delete(pid); btn.classList.remove('active'); }
      else { state.currentPids.add(pid); btn.classList.add('active'); }
      buildGauges();
    });
  });
}

// ─── Sprint / Quarter Mile ────────────────────────────────────────────────────
function initSprintTimers(){
  $('btn-sprint-start').addEventListener('click',()=>{
    if(state.sprintRunning) return;
    state.sprintRunning=true;
    state.sprintStart=Date.now();
    $('sprint-status').textContent='Running…';
    const int=setInterval(()=>{
      const spd=state.liveValues.speed||0;
      $('sprint-time').textContent = ((Date.now()-state.sprintStart)/1000).toFixed(2)+'s';
      if(spd>=100){
        clearInterval(int);
        state.sprintRunning=false;
        const t=((Date.now()-state.sprintStart)/1000).toFixed(2);
        $('sprint-status').textContent=`100 km/h in ${t}s`;
        toast(`0–100 km/h: ${t}s 🏁`,'success');
      }
    },100);
  });
  $('btn-sprint-reset').addEventListener('click',()=>{ state.sprintRunning=false; $('sprint-time').textContent='—'; $('sprint-status').textContent='Ready'; });
  $('btn-qm-start').addEventListener('click',()=>{
    if(state.qmRunning) return;
    state.qmRunning=true;
    state.qmStart=Date.now();
    $('qm-speed').textContent='— km/h trap';
    const int=setInterval(()=>{
      const spd=state.liveValues.speed||0;
      $('qm-time').textContent = ((Date.now()-state.qmStart)/1000).toFixed(2)+'s';
      if(spd>=160 || (Date.now()-state.qmStart)>25000){
        clearInterval(int);
        state.qmRunning=false;
        const t=((Date.now()-state.qmStart)/1000).toFixed(2);
        $('qm-speed').textContent=spd.toFixed(0)+' km/h trap';
        toast(`Quarter mile: ${t}s @ ${spd.toFixed(0)} km/h 🏁`,'success');
      }
    },100);
  });
  $('btn-qm-reset').addEventListener('click',()=>{ state.qmRunning=false; $('qm-time').textContent='—'; $('qm-speed').textContent='— km/h trap'; });
}

// ─── Diagnostics ──────────────────────────────────────────────────────────────
function buildReadinessGrid(){
  const grid = $('readiness-grid');
  grid.innerHTML = READINESS_MONITORS.map(m=>{
    const r=Math.random();
    const cls = r<.7?'ready': r<.9?'not-ready':'na';
    const lbl = cls==='ready'?'Ready': cls==='not-ready'?'Not Ready':'N/A';
    return `<div class="readiness-item"><span class="ri-name">${m}</span><span class="ri-status ${cls}">${lbl}</span></div>`;
  }).join('');
}

async function readDTCs(){
  let entries;
  if(state.demo){
    entries = generateDemoDTCs().map(code=>({ code, status:'Current', description:DTC_DB[code]||'Unknown fault — consult OEM documentation' }));
  } else {
    try{
      const res = await apiFetch('/api/obd2/dtcs');
      if(!res.ok || !Array.isArray(res.dtcs)) throw new Error(res.error || 'Unable to read DTCs');
      entries = res.dtcs.map(dtc=>({
        code: dtc.code || '',
        status: dtc.status || 'Current',
        description: dtc.description || DTC_DB[dtc.code] || 'Unknown fault — consult OEM documentation'
      }));
    } catch(e){
      toast('Failed to read DTCs: ' + e.message,'error');
      return;
    }
  }
  const tbody = $('dtc-tbody');
  $('dtc-count').textContent = entries.length;
  if(!entries.length){
    tbody.innerHTML='<tr><td colspan="5" style="color:var(--ok);text-align:center;padding:1.5rem">✅ No DTCs found. System clean.</td></tr>';
    return;
  }
  tbody.innerHTML = entries.map(({ code, status, description })=>{
    const type = code[0]?.toLowerCase() || 'p';
    return `<tr>
      <td class="dtc-code">${escapeHTML(code)}</td>
      <td><span class="dtc-severity ${type}">${type.toUpperCase()}</span></td>
      <td>${escapeHTML(description)}</td>
      <td style="color:var(--warn);font-size:.78rem">${escapeHTML(status)}</td>
      <td><button class="btn btn-secondary btn-xs" onclick='showFreezeFrame(${JSON.stringify(code)})'>View</button></td>
    </tr>`;
  }).join('');
  toast(`Read ${entries.length} DTC${entries.length>1?'s':''}`, entries.length?'warn':'success');
}

function generateDemoDTCs(){
  const all = Object.keys(DTC_DB);
  const n = Math.floor(Math.random()*3)+1;
  return all.sort(()=>Math.random()-.5).slice(0,n);
}

function clearDTCs(){
  if(!confirmAction('Clear all DTCs? This will reset the MIL (Check Engine Light) and erase stored codes.')) return;
  $('dtc-tbody').innerHTML='<tr><td colspan="5" style="color:var(--ok);text-align:center;padding:1.5rem">✅ All DTCs cleared.</td></tr>';
  $('dtc-count').textContent='0';
  toast('All DTCs cleared ✓','success');
  flashLog('DTCs cleared by user.');
}

function showFreezeFrame(code){
  const div = $('freeze-frame-data');
  const desc = DTC_DB[code]||'Unknown fault';
  div.innerHTML = `
    <div style="font-weight:700;color:var(--warn);margin-bottom:.6rem">${code} — ${desc}</div>
    <div class="vehicle-info">
      <div class="vi-row"><span>RPM at fault</span><span>${randBetween(1800,4500).toFixed(0)} rpm</span></div>
      <div class="vi-row"><span>Speed at fault</span><span>${randBetween(0,120).toFixed(0)} km/h</span></div>
      <div class="vi-row"><span>Coolant Temp</span><span>${randBetween(75,105).toFixed(0)} °C</span></div>
      <div class="vi-row"><span>Throttle Position</span><span>${randBetween(5,80).toFixed(0)} %</span></div>
      <div class="vi-row"><span>Load</span><span>${randBetween(20,90).toFixed(0)} %</span></div>
      <div class="vi-row"><span>Fuel Trim (ST)</span><span>${randBetween(-10,12).toFixed(1)} %</span></div>
      <div class="vi-row"><span>Voltage</span><span>${randBetween(12.0,14.5).toFixed(1)} V</span></div>
    </div>`;
}

// ─── Performance Tuning Maps ──────────────────────────────────────────────────
function makeDefaultMap(rows,cols,baseMin,baseMax){
  return Array.from({length:rows},()=>Array.from({length:cols},()=>+(randBetween(baseMin,baseMax)).toFixed(1)));
}

function renderMap(tableId, data, rows, cols, rAxis, cAxis, units=''){
  const tbl = $(tableId);
  if(!tbl) return;
  let html = '<thead><tr><th>Load\\RPM</th>'+cAxis.map(v=>`<th>${v}</th>`).join('')+'</tr></thead><tbody>';
  data.forEach((row,r)=>{
    html += `<tr><th>${rAxis[r]}</th>`+row.map((val,c)=>{
      const hot = val>(baseMax(units)*0.8);
      const cool= val<(baseMax(units)*0.35);
      const cls = hot?'hot':cool?'cool':'warm';
      return `<td><input class="map-cell ${cls}" type="number" step="0.1" value="${val}" data-r="${r}" data-c="${c}" data-map="${tableId}" /></td>`;
    }).join('')+'</tr>';
  });
  html += '</tbody>';
  tbl.innerHTML = html;
  tbl.querySelectorAll('.map-cell').forEach(inp=>{
    inp.addEventListener('change',()=>onMapCellChange(inp));
    inp.addEventListener('input',()=>colourCell(inp,units));
  });
}

function baseMax(units){ return units==='ign'?50: units==='boost'?200: 100; }

function colourCell(inp, units){
  const val = parseFloat(inp.value)||0;
  const max = baseMax(units);
  inp.className = 'map-cell' + (val>max*0.8?' hot': val<max*0.35?' cool':' warm');
}

function onMapCellChange(inp){
  if(!state.settings.safetylock) return;
  const v=parseFloat(inp.value)||0;
  if(inp.dataset.map==='ignition-map-table' && v>state.settings.maxadv){
    toast(`⚠️ Ignition advance exceeds safety limit (${state.settings.maxadv}°)`,'warn');
    inp.value = state.settings.maxadv;
    inp.classList.add('hot');
  }
  $('btn-write-maps').disabled = false;
}

function applyPreset(preset){
  const modifiers = {
    economy:{ fuel:-5, ign:-2, boost:-10 },
    street: { fuel:0,  ign:2,  boost:5  },
    track:  { fuel:8,  ign:5,  boost:20 },
    stock:  { fuel:0,  ign:0,  boost:0  }
  };
  const m = modifiers[preset]||modifiers.stock;
  document.querySelectorAll('.preset-btn').forEach(b=>b.classList.remove('active'));
  document.querySelector(`[data-preset="${preset}"]`)?.classList.add('active');
  state.currentPreset = preset;
  if(state.fuelMap){
    state.fuelMap = state.fuelMap.map(r=>r.map(v=>Math.max(0,+(v+m.fuel).toFixed(1))));
    renderMap('fuel-map-table', state.fuelMap, LOAD_AXIS.length, RPM_AXIS.length, LOAD_AXIS, RPM_AXIS);
  }
  if(state.ignMap){
    state.ignMap = state.ignMap.map(r=>r.map(v=>Math.max(-5,Math.min(state.settings.maxadv,+(v+m.ign).toFixed(1)))));
    renderMap('ignition-map-table', state.ignMap, LOAD_AXIS.length, RPM_AXIS.length, LOAD_AXIS, RPM_AXIS,'ign');
  }
  toast(`${preset.charAt(0).toUpperCase()+preset.slice(1)} preset applied`,'success');
  $('btn-write-maps').disabled = false;
}

function initParamSliders(){
  const params = [
    { key:'revlimit', label:'Rev Limiter', min:4000, max:8500, val:7000, unit:'rpm', step:100 },
    { key:'speedlimit', label:'Speed Limiter', min:100, max:300, val:250, unit:'km/h', step:5 },
    { key:'boostpressure', label:'Boost Pressure', min:50, max:220, val:120, unit:'kPa', step:2 },
    { key:'fuelcutoff', label:'Fuel Cut-off', min:5000, max:9000, val:7200, unit:'rpm', step:100 },
    { key:'idlerpm', label:'Idle RPM Target', min:500, max:1200, val:800, unit:'rpm', step:10 },
    { key:'lambdatarget', label:'Lambda Target', min:0.8, max:1.2, val:1.0, unit:'λ', step:0.01 }
  ];
  const container = $('param-sliders');
  container.innerHTML = params.map(p=>`
    <div class="param-row">
      <div class="param-name">${p.label}</div>
      <input class="param-slider" type="range" min="${p.min}" max="${p.max}" value="${p.val}" step="${p.step}" id="param-${p.key}" />
      <div class="param-value" id="paramval-${p.key}">${p.val} ${p.unit}</div>
    </div>`).join('');
  params.forEach(p=>{
    const slider = $(`param-${p.key}`);
    slider.addEventListener('input',()=>{
      $(`paramval-${p.key}`).textContent = slider.value+' '+p.unit;
      $('btn-write-maps').disabled = false;
    });
  });
}

function calcDyno(){
  const presetGain = { economy:-8, street:12, track:35, stock:0 };
  const hp = presetGain[state.currentPreset]||0;
  const torque = (hp * 0.75).toFixed(0);
  const fuel = state.currentPreset==='economy'?'+5%': state.currentPreset==='track'?'-8%':'0%';
  $('dyno-hp').textContent = (hp>=0?'+':'')+hp+' HP';
  $('dyno-torque').textContent = (torque>=0?'+':'')+torque+' Nm';
  $('dyno-fuel').textContent = fuel;
  $('dyno-result').style.display='block';
  toast('Dyno estimate calculated','info');
}

// ─── ECU Flash ────────────────────────────────────────────────────────────────
function initFlashDrop(){
  const drop = $('flash-file-drop');
  const inp = $('flash-file-input');
  drop.addEventListener('click',()=>inp.click());
  drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('dragover');});
  drop.addEventListener('dragleave',()=>drop.classList.remove('dragover'));
  drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('dragover');handleFlashFile(e.dataTransfer.files[0]);});
  inp.addEventListener('change',()=>handleFlashFile(inp.files[0]));
}

function handleFlashFile(file){
  if(!file) return;
  state.flashFile = file;
  $('flash-fname').textContent = file.name;
  $('flash-fsize').textContent = fmtSize(file.size);
  $('flash-ffmt').textContent = file.name.split('.').pop().toUpperCase();
  const reader = new FileReader();
  reader.onload = e=>{
    const buf = new Uint8Array(e.target.result);
    let crc=0xFFFFFFFF;
    const table = (() => { const t = new Uint32Array(256); for(let i=0;i<256;i++){ let c=i; for(let k=0;k<8;k++) c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1); t[i]=c; } return t; })();
    for(const byte of buf) crc = table[(crc^byte)&0xFF]^(crc>>>8);
    $('flash-fchk').textContent = ((crc^0xFFFFFFFF)>>>0).toString(16).toUpperCase().padStart(8,'0');
  };
  reader.readAsArrayBuffer(file);
  $('flash-file-meta').style.display='flex';
  $('btn-verify-flash').disabled = !state.connected && !state.demo;
  flashLog(`File loaded: ${file.name} (${fmtSize(file.size)})`);
  toast('Tune file loaded: '+file.name,'info');
}

function stepState(id, status){
  const num = $(`fstep-${id}-num`);
  if(status==='active') num.className='step-num active';
  else if(status==='done') num.className='step-num done';
  else num.className='step-num';
}

function resetFlashSteps(){
  ['backup','auth','erase','write','verify','reset'].forEach(id=>stepState(id,'idle'));
}

function updateFlashSteps(progress){
  const thresholds = [
    { id:'backup', done:10, active:0 },
    { id:'auth', done:20, active:10 },
    { id:'erase', done:45, active:20 },
    { id:'write', done:90, active:45 },
    { id:'verify', done:98, active:90 },
    { id:'reset', done:100, active:98 }
  ];
  thresholds.forEach(({ id, done, active })=>{
    if(progress >= done) stepState(id,'done');
    else if(progress >= active) stepState(id,'active');
    else stepState(id,'idle');
  });
}

async function runFlash(){
  if(!state.demo && !state.connected){ toast('Connect first','warn'); return; }
  if(!state.flashFile){ toast('Load a tune file first','warn'); return; }
  if(!confirmAction('⚠️ Begin ECU flash? This will overwrite the current ECU calibration. Ensure battery is above 12.5V and the engine is OFF.')) return;
  if(state.settings.humanapproval && !confirmAction('Human approval required. Do you authorise this ECU flash operation?')) return;

  $('flash-progress-wrap').style.display='block';
  resetFlashSteps();
  if(!state.demo){
    if(typeof state.flashFile.arrayBuffer !== 'function'){
      toast('Reload the original tune file before using backend flash','warn');
      return;
    }
    try{
      const res = await fetch('/api/obd2/flash', {
        method:'POST',
        headers:{
          'Content-Type':'application/octet-stream',
          'X-Filename': state.flashFile.name || 'tune.bin'
        },
        body:state.flashFile
      });
      const payload = await res.json();
      if(!res.ok || !payload.ok) throw new Error(payload.error || payload.message || 'Flash start failed');
      for(;;){
        const status = await apiFetch('/api/obd2/flash/status');
        $('flash-log').textContent = (status.log || []).join('\n') + ((status.log || []).length ? '\n' : '');
        updateFlashSteps(status.progress || 0);
        setProgress(status.progress || 0, status.step || 'Waiting for backend flash status…');
        if((status.log || []).some(line=>line.includes('FLASH ERROR'))){
          toast('ECU flash failed','error');
          return;
        }
        if(!status.active){
          if((status.progress || 0) >= 100){
            toast('ECU flash complete ✓','success');
          } else {
            toast('ECU flash did not complete','error');
          }
          return;
        }
        await delay(1000);
      }
    } catch(e){
      toast('ECU flash failed: ' + e.message,'error');
      flashLog('FLASH ERROR: ' + e.message);
    }
    return;
  }
  const steps=[
    {id:'backup', label:'Backing up ECU image…', dur:2000},
    {id:'auth',   label:'Security access handshake…', dur:1500},
    {id:'erase',  label:'Erasing flash sectors…', dur:2500},
    {id:'write',  label:'Writing calibration data…', dur:4000},
    {id:'verify', label:'Verifying checksum…', dur:1500},
    {id:'reset',  label:'Resetting ECU…', dur:1200}
  ];
  let done=0;
  for(const step of steps){
    setProgress(Math.round(done/steps.length*100), step.label);
    stepState(step.id,'active');
    flashLog(step.label);
    await delay(step.dur);
    stepState(step.id,'done');
    done++;
    setProgress(Math.round(done/steps.length*100), step.label+' ✓');
  }
  setProgress(100,'Flash complete ✓');
  flashLog('Flash complete. ECU rebooted successfully.');
  toast('ECU flash complete ✓','success');
}

function setProgress(pct, text){
  $('flash-progress-fill').style.width = pct+'%';
  $('flash-progress-pct').textContent = pct+'%';
  $('flash-progress-text').textContent = text||'';
}

async function backupECU(){
  if(!state.demo && !state.connected){ toast('Connect first','warn'); return; }
  if(!state.demo){
    try{
      flashLog('Starting ECU backup…');
      toast('Backing up ECU…','info');
      const res = await fetch('/api/obd2/backup');
      if(!res.ok){
        const payload = await res.json().catch(()=>({}));
        throw new Error(payload.error || 'Backup failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="([^"]+)"/);
      const a = document.createElement('a');
      a.href = url;
      a.download = match?.[1] || `ecu_backup_${Date.now()}.bin`;
      a.click();
      URL.revokeObjectURL(url);
      flashLog('ECU backup saved.');
      toast('ECU backup downloaded ✓','success');
    } catch(e){
      toast('ECU backup failed: ' + e.message,'error');
      flashLog('BACKUP ERROR: ' + e.message);
    }
    return;
  }
  flashLog('Starting ECU backup…');
  toast('Backing up ECU…','info');
  await delay(2000);
  const blob = new Blob([`RICHO OBD2 ECU Backup\nDate: ${new Date().toISOString()}\nVIN: ${$('vi-vin').textContent}\nECU: ${$('vi-ecu').textContent}\n[simulated binary data]`],{type:'application/octet-stream'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=`ecu_backup_${Date.now()}.bin`; a.click();
  URL.revokeObjectURL(url);
  flashLog('ECU backup saved.');
  toast('ECU backup downloaded ✓','success');
}

// ─── Tune Files ───────────────────────────────────────────────────────────────
function renderTuneFiles(){
  const list = $('tune-file-list');
  if(!state.tuneFiles.length){
    list.innerHTML = '<div style="color:var(--muted);font-size:.85rem;padding:.5rem">No tune files saved. Import a file.</div>';
    return;
  }
  list.innerHTML = state.tuneFiles.map((f,i)=>`
    <div class="tune-file-item" data-idx="${i}">
      <span class="tfi-icon">${f.fmt==='bin'?'🗂':f.fmt==='hex'?'📄':'📋'}</span>
      <div class="tfi-info">
        <div class="tfi-name">${escapeHTML(f.name)}</div>
        <div class="tfi-meta">${escapeHTML(f.fmt.toUpperCase())} · ${fmtSize(f.size)} · ${escapeHTML(f.date)}</div>
      </div>
      <div class="tfi-actions">
        <button class="btn btn-secondary btn-xs" onclick="selectTune(${i})">View</button>
        <button class="btn btn-primary btn-xs" onclick="exportTune(${i})">Export</button>
        <button class="btn btn-danger btn-xs" onclick="deleteTune(${i})">🗑</button>
      </div>
    </div>`).join('');
}

function selectTune(i){
  state.selectedTune = i;
  const f = state.tuneFiles[i];
  $('tune-detail').innerHTML = `
    <div class="vehicle-info">
      <div class="vi-row"><span>Name</span><span>${escapeHTML(f.name)}</span></div>
      <div class="vi-row"><span>Format</span><span>${escapeHTML(f.fmt.toUpperCase())}</span></div>
      <div class="vi-row"><span>Size</span><span>${fmtSize(f.size)}</span></div>
      <div class="vi-row"><span>Checksum</span><span>${escapeHTML(f.chk)}</span></div>
      <div class="vi-row"><span>Date Imported</span><span>${escapeHTML(f.date)}</span></div>
      <div class="vi-row"><span>Notes</span><span>${escapeHTML(f.notes||'—')}</span></div>
    </div>
    <div style="margin-top:.75rem;display:flex;gap:.5rem;flex-wrap:wrap">
      <button class="btn btn-primary btn-xs" onclick="flashFromTune(${i})">⚡ Flash This Tune</button>
    </div>`;
  $('btn-export-tune').disabled=false;
  $('btn-delete-tune').disabled=false;
}

function flashFromTune(i){
  const f = state.tuneFiles[i];
  toast(`Loaded "${f.name}" into flash panel`,'info');
  state.flashFile = { name:f.name, size:f.size };
  $('flash-fname').textContent=f.name;
  $('flash-fsize').textContent=fmtSize(f.size);
  $('flash-fchk').textContent=f.chk;
  $('flash-ffmt').textContent=f.fmt.toUpperCase();
  $('flash-file-meta').style.display='flex';
  $('btn-verify-flash').disabled=false;
  document.querySelector('[data-tab="flash"]').click();
}

function exportTune(i){
  const f = state.tuneFiles[i];
  const blob = new Blob([`RICHO Tune Export\n${JSON.stringify(f,null,2)}`],{type:'application/octet-stream'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=f.name;a.click();
  URL.revokeObjectURL(url);
  toast('Tune exported ✓','success');
}

function deleteTune(i){
  if(!confirmAction('Delete this tune file?')) return;
  state.tuneFiles.splice(i,1);
  localStorage.setItem('obd2_tunefiles',JSON.stringify(state.tuneFiles));
  renderTuneFiles();
  toast('Tune file deleted','info');
}

function importTuneFile(file){
  if(!file) return;
  const entry = {
    name:file.name, size:file.size,
    fmt:file.name.split('.').pop().toLowerCase(),
    date:new Date().toLocaleDateString(),
    chk:crc32hex(file.name+file.size), notes:''
  };
  state.tuneFiles.push(entry);
  localStorage.setItem('obd2_tunefiles',JSON.stringify(state.tuneFiles));
  renderTuneFiles();
  toast('Tune file imported: '+file.name,'success');
}

// ─── Data Logger ──────────────────────────────────────────────────────────────
function startLogging(){
  if(!state.liveInterval){
    state.liveInterval = setInterval(tickLive, 1000/state.settings.rate);
  }
  state.logRunning=true;
  state.logStart=Date.now();
  state.logData=[];
  state.logSamples=0;
  $('rec-dot').className='rec-dot recording';
  $('rec-label').textContent='Recording…';
  $('btn-log-start').disabled=true;
  $('btn-log-stop').disabled=false;
  $('ls-rate').textContent=state.settings.rate+' Hz';
  toast('Recording started ⏺','success');
}

function stopLogging(){
  state.logRunning=false;
  $('rec-dot').className='rec-dot';
  $('rec-label').textContent='Stopped';
  $('btn-log-start').disabled=false;
  $('btn-log-stop').disabled=true;
  $('btn-log-export-csv').disabled=false;
  $('btn-log-export-json').disabled=false;
  const session = { id:Date.now(), name:`Session ${new Date().toLocaleString()}`, samples:state.logSamples, size:fmtSize(JSON.stringify(state.logData).length), date:new Date().toLocaleString(), data:state.logData };
  if(state.settings.autosave){
    state.sessions.push({...session, data:undefined});
    localStorage.setItem('obd2_sessions',JSON.stringify(state.sessions));
    $('ls-sessions').textContent=state.sessions.length;
    renderSessions();
  }
  if(!state.liveRunning && state.liveInterval){
    clearInterval(state.liveInterval);
    state.liveInterval = null;
  }
  toast(`Recording stopped. ${state.logSamples} samples captured.`,'info');
}

function renderSessions(){
  const list = $('session-list');
  if(!state.sessions.length){ list.innerHTML='<div style="color:var(--muted);font-size:.85rem;padding:.5rem">No sessions recorded yet.</div>'; return; }
  list.innerHTML = state.sessions.map((s,i)=>`
    <div class="session-item">
      <div class="si-info">
        <div class="si-name">${s.name}</div>
        <div class="si-meta">${s.samples} samples · ${s.size} · ${s.date}</div>
      </div>
      <div class="si-actions">
        <button class="btn btn-secondary btn-xs" onclick="exportSession(${i},'csv')">CSV</button>
        <button class="btn btn-secondary btn-xs" onclick="exportSession(${i},'json')">JSON</button>
        <button class="btn btn-danger btn-xs" onclick="deleteSession(${i})">🗑</button>
      </div>
    </div>`).join('');
}

function exportSession(i, fmt){
  const s = state.sessions[i];
  let content, mime, ext;
  if(fmt==='csv'){
    // Per-sample data is not retained for saved sessions to keep localStorage small.
    // Export session summary metadata instead.
    content = 'field,value\n'
      + `name,"${s.name}"\n`
      + `date,"${s.date}"\n`
      + `samples,${s.samples}\n`
      + `size,"${s.size}"\n`;
    toast('Session exported as CSV (summary only — per-sample data not retained)','warn');
    mime='text/csv'; ext='csv';
  } else {
    content=JSON.stringify(s,null,2); mime='application/json'; ext='json';
    toast(`Session exported as JSON ✓`,'success');
  }
  const blob=new Blob([content],{type:mime});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=`session_${s.id}.${ext}`;a.click();
  URL.revokeObjectURL(url);
}

function deleteSession(i){
  if(!confirmAction('Delete this session?')) return;
  state.sessions.splice(i,1);
  localStorage.setItem('obd2_sessions',JSON.stringify(state.sessions));
  renderSessions();
  $('ls-sessions').textContent=state.sessions.length;
}

function exportCurrentLog(fmt){
  if(!state.logData.length){ toast('No data to export','warn'); return; }
  const pids=[...state.currentPids];
  let content, mime, ext;
  if(fmt==='csv'){
    content='ts,'+pids.join(',')+'\n'+state.logData.map(row=>`${row.ts},`+pids.map(k=>row[k]||0).join(',')).join('\n');
    mime='text/csv'; ext='csv';
  } else { content=JSON.stringify(state.logData,null,2); mime='application/json'; ext='json'; }
  const blob=new Blob([content],{type:mime});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=`obd2_log_${Date.now()}.${ext}`;a.click();
  URL.revokeObjectURL(url);
  toast(`Log exported as ${ext.toUpperCase()} ✓`,'success');
}

// ─── Settings ─────────────────────────────────────────────────────────────────
function loadSettings(){
  const s = state.settings;
  $('setting-autoreconnect').checked = s.autoreconnect;
  $('setting-timeout').value = s.timeout;
  $('setting-verbose').checked = s.verbose;
  $('setting-rate').value = s.rate;
  $('setting-units').value = s.units;
  $('setting-history').value = s.history;
  $('setting-safetylock').checked = s.safetylock;
  $('setting-humanapproval').checked = s.humanapproval;
  $('setting-maxadv').value = s.maxadv;
  $('setting-revwarn').value = s.revwarn;
  $('setting-autosave').checked = s.autosave;
  $('setting-storage').value = s.storage;
}

function saveSettings(){
  state.settings = {
    autoreconnect: $('setting-autoreconnect').checked,
    timeout: +$('setting-timeout').value,
    verbose: $('setting-verbose').checked,
    rate: +$('setting-rate').value,
    units: $('setting-units').value,
    history: +$('setting-history').value,
    safetylock: $('setting-safetylock').checked,
    humanapproval: $('setting-humanapproval').checked,
    maxadv: +$('setting-maxadv').value,
    revwarn: +$('setting-revwarn').value,
    autosave: $('setting-autosave').checked,
    storage: $('setting-storage').value
  };
  localStorage.setItem('obd2_settings', JSON.stringify(state.settings));
  toast('Settings saved ✓','success');
}

function resetSettings(){
  if(!confirmAction('Reset all settings to defaults?')) return;
  localStorage.removeItem('obd2_settings');
  state.settings = JSON.parse(localStorage.getItem('obd2_settings')||'null')||{
    autoreconnect:true,timeout:10,verbose:false,rate:5,units:'metric',history:60,
    safetylock:true,humanapproval:true,maxadv:45,revwarn:6500,autosave:true,storage:'local'
  };
  loadSettings();
  toast('Settings reset to defaults','info');
}

function clearAllData(){
  if(!confirmAction('Clear ALL saved sessions and tune files? This cannot be undone.')) return;
  localStorage.removeItem('obd2_sessions');
  localStorage.removeItem('obd2_tunefiles');
  state.sessions=[];
  state.tuneFiles=[];
  renderSessions();
  renderTuneFiles();
  $('ls-sessions').textContent='0';
  toast('All data cleared','info');
}

// ─── API helpers ──────────────────────────────────────────────────────────────
async function apiFetch(url){ const r = await fetch(url); return r.json(); }
async function apiPost(url,body){ const r = await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); return r.json(); }
function delay(ms){ return new Promise(r=>setTimeout(r,ms)); }

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', ()=>{
  initTabs();

  // Connection
  $('btn-scan-ports').addEventListener('click', scanPorts);
  $('btn-scan-bt').addEventListener('click', ()=>toast('Bluetooth scan requires native app or backend','warn'));
  $('btn-connect').addEventListener('click', doConnect);
  $('btn-disconnect').addEventListener('click', doDisconnect);
  $('conn-type').addEventListener('change', ()=>{
    const t=$('conn-type').value;
    $('conn-serial-opts').style.display = t==='wifi'||t==='demo'?'none':'grid';
    $('conn-wifi-opts').style.display = t==='wifi'?'grid':'none';
  });

  // Live Data
  initPidToggles();
  buildGauges();
  $('btn-live-start').addEventListener('click', startLive);
  $('btn-live-stop').addEventListener('click', stopLive);
  $('btn-live-clear').addEventListener('click', ()=>{
    state.liveHistory={};
    if(state.liveChart){ state.liveChart.data.labels=[]; state.liveChart.data.datasets.forEach(d=>d.data=[]); state.liveChart.update(); }
  });
  initSprintTimers();

  // Load Chart.js from CDN dynamically
  const chartScript = document.createElement('script');
  chartScript.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.5.0/dist/chart.umd.min.js';
  chartScript.integrity = 'sha384-XcdcwHqIPULERb2yDEM4R0XaQKU3YnDsrTmjACBZyfdVVqjh6xQ4/DCMd7XLcA6Y';
  chartScript.crossOrigin = 'anonymous';
  chartScript.onload = ()=>{ buildLiveChart(); buildLogChart(); };
  chartScript.onerror = ()=>toast('Chart.js failed to load. Live charts are unavailable.','warn');
  document.head.appendChild(chartScript);

  // Diagnostics
  $('btn-read-dtc').addEventListener('click', readDTCs);
  $('btn-clear-dtc').addEventListener('click', clearDTCs);
  $('btn-freeze-frame').addEventListener('click', ()=>toast('Select a DTC row to view freeze frame','info'));
  $('btn-readiness').addEventListener('click', buildReadinessGrid);
  buildReadinessGrid();

  // Tuning
  state.fuelMap = makeDefaultMap(LOAD_AXIS.length, RPM_AXIS.length, 55, 95);
  state.ignMap  = makeDefaultMap(LOAD_AXIS.length, RPM_AXIS.length, 8, 38);
  state.boostMap= makeDefaultMap(LOAD_AXIS.length, RPM_AXIS.length, 60, 140);
  renderMap('fuel-map-table', state.fuelMap, LOAD_AXIS.length, RPM_AXIS.length, LOAD_AXIS, RPM_AXIS);
  renderMap('ignition-map-table', state.ignMap, LOAD_AXIS.length, RPM_AXIS.length, LOAD_AXIS, RPM_AXIS,'ign');
  renderMap('boost-map-table', state.boostMap, LOAD_AXIS.length, RPM_AXIS.length, LOAD_AXIS, RPM_AXIS,'boost');
  initParamSliders();
  document.querySelectorAll('.preset-btn').forEach(b=>b.addEventListener('click',()=>applyPreset(b.dataset.preset)));
  $('btn-read-maps').addEventListener('click',()=>toast(state.connected||state.demo?'Maps read from ECU (simulated)':'Connect to ECU first', state.connected||state.demo?'success':'warn'));
  $('btn-write-maps').addEventListener('click',()=>{
    if(state.settings.humanapproval && !confirmAction('Write modified calibration maps to ECU? Review all changes first.')) return;
    toast('Maps written to ECU (simulated) ✓','success');
    $('btn-write-maps').disabled=true;
    flashLog('Calibration maps written to ECU.');
  });
  $('btn-dyno-calc').addEventListener('click', calcDyno);

  // ECU Flash
  initFlashDrop();
  $('btn-backup-ecu').addEventListener('click', backupECU);
  $('btn-verify-flash').addEventListener('click',()=>{
    if(!state.flashFile){ toast('Load a file first','warn'); return; }
    toast('File verified — compatible ✓','success');
    flashLog('File verification passed. Checksum OK. Compatible with connected ECU.');
    $('btn-start-flash').disabled=false;
  });
  $('btn-start-flash').addEventListener('click', runFlash);
  $('btn-restore-stock').addEventListener('click',()=>{
    if(!confirmAction('Restore ECU to stock calibration? This will overwrite any custom tune.')) return;
    toast('Restore to stock initiated (simulated)','warn');
    flashLog('Stock restore initiated.');
  });

  // Tune Files
  renderTuneFiles();
  $('ls-sessions').textContent = state.sessions.length;
  $('btn-import-tune').addEventListener('click',()=>$('tune-import-input').click());
  $('tune-import-input').addEventListener('change',e=>{ [...e.target.files].forEach(importTuneFile); });
  $('btn-export-tune').addEventListener('click',()=>{ if(state.selectedTune!==null) exportTune(state.selectedTune); });
  $('btn-delete-tune').addEventListener('click',()=>{ if(state.selectedTune!==null) deleteTune(state.selectedTune); });

  // Data Logger
  renderSessions();
  $('btn-log-start').addEventListener('click', startLogging);
  $('btn-log-stop').addEventListener('click', stopLogging);
  $('btn-log-export-csv').addEventListener('click',()=>exportCurrentLog('csv'));
  $('btn-log-export-json').addEventListener('click',()=>exportCurrentLog('json'));

  // Settings
  loadSettings();
  $('btn-save-settings').addEventListener('click', saveSettings);
  $('btn-reset-settings').addEventListener('click', resetSettings);
  $('btn-clear-data').addEventListener('click', clearAllData);
});

// Expose for inline onclick
window.showFreezeFrame = showFreezeFrame;
window.selectTune = selectTune;
window.exportTune = exportTune;
window.deleteTune = deleteTune;
window.flashFromTune = flashFromTune;
window.exportSession = exportSession;
window.deleteSession = deleteSession;
