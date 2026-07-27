/* ============================================================================
   ISL CANSAT GROUND CONTROL SOFTWARE (GCS) — APPLICATION LOGIC
   ----------------------------------------------------------------------------
   India Space Lab - CanSat & CubeSat Project Work

   This file drives index.html (styled by style.css). It is organised as:

     1. STATE            - single object holding the live mission state
     2. FLIGHT PROFILE    - simulated ascent/descent physics (for demo/testing
                             without real hardware connected)
     3. SIMULATION TICK   - the "packet generator" that runs once per second
     4. INGEST + RENDER   - ingestPacket() is the single integration point:
                             replace the simulator's calls to this function
                             with a real Web Serial / WebSocket listener and
                             every panel below updates automatically.
     5. ERROR CODE SYSTEM - live 4-digit fault code logic
     6. CHARTS            - Chart.js real-time line graphs (Altitude,
                             Pressure, Temperature, Descent Rate, Voltage)
     7. TRACKING MAP       - Leaflet.js live GPS marker + trajectory trail
     8. ORIENTATION        - SVG artificial horizon + a Three.js 3D CanSat
                             (cylindrical canister) model driven by
                             Roll / Pitch / Yaw telemetry
     9. MISSION COMMANDS   - Manual Separation / Emergency Chute / Redundant
                             Activation, with a timestamped command log
    10. TOP BAR ACTIONS    - Start/Stop, Sync Time, Reset Packet, CSV/PNG export
    11. LIVE VIDEO         - MediaDevices/getUserMedia camera streaming
   ============================================================================ */

/* ======================================================================
   ISL CANSAT GROUND CONTROL SOFTWARE
   Single-page GCS: telemetry, graphs, map, orientation, video, commands
   Runs on simulated telemetry by default. Structured so a real serial/
   WebSocket feed can replace simulateTick() -> ingestPacket() calls.
   ====================================================================== */

/* ---------------- STATE ---------------- */
const state = {
  running:false,
  startTime:null,
  missionSeconds:0,
  packetCount:0,
  phase:'STANDBY',
  separated:false,
  chuteDeployed:false,
  gpsAvailable:true,
  lat:28.6692, lon:77.1174,
  path:[],
  log:[],
  errorDigits:[0,0,0,0],
  roll:0,pitch:0,yaw:0,
};

const MAX_ALT = 720;
const ASCENT_TIME = 55;
const DESCENT_TIME = 95;

function fmtTime(sec){
  sec = Math.max(0,Math.floor(sec));
  const h = String(Math.floor(sec/3600)).padStart(2,'0');
  const m = String(Math.floor((sec%3600)/60)).padStart(2,'0');
  const s = String(sec%60).padStart(2,'0');
  return `${h}:${m}:${s}`;
}

function computeProfile(t){
  let alt, vSpeed, phase;
  if(t <= ASCENT_TIME){
    const f = t/ASCENT_TIME;
    alt = MAX_ALT * (1 - Math.pow(1-f,2));
    vSpeed = (MAX_ALT*2*(1-f))/ASCENT_TIME;
    phase = 'ASCENT';
  } else if(t <= ASCENT_TIME+DESCENT_TIME){
    const f = (t-ASCENT_TIME)/DESCENT_TIME;
    alt = MAX_ALT*(1-f);
    vSpeed = state.chuteDeployed ? -9 - (Math.random()*0.6-0.3) : -(6+18*f);
    phase = 'DESCENT';
  } else {
    alt = 0; vSpeed = 0; phase = 'LANDED';
  }
  return {alt:Math.max(alt,0), vSpeed, phase};
}

function barometric(altM){ return 101.325*Math.pow(1-2.25577e-5*altM,5.25588); }

let simTimer=null;
function startSim(){
  if(state.running) return;
  state.running = true;
  if(!state.startTime) state.startTime = Date.now() - state.missionSeconds*1000;
  document.getElementById('linkDot').className='dot on';
  document.getElementById('linkLabel').textContent='TELEMETRY LIVE';
  document.getElementById('btnStart').disabled=true;
  document.getElementById('btnStop').disabled=false;
  logCmd('Telemetry stream started','ok');
  simTimer = setInterval(tick, 1000);
  tick();
}
function stopSim(){
  state.running=false;
  clearInterval(simTimer);
  document.getElementById('linkDot').className='dot off';
  document.getElementById('linkLabel').textContent='TELEMETRY IDLE';
  document.getElementById('btnStart').disabled=false;
  document.getElementById('btnStop').disabled=true;
  logCmd('Telemetry stream stopped','warn');
}

function tick(){
  state.missionSeconds = (Date.now()-state.startTime)/1000;
  const t = state.missionSeconds;
  const prof = computeProfile(t);
  state.phase = prof.phase==='LANDED' && !state.separated ? 'DESCENT' : prof.phase;

  if(t > ASCENT_TIME+2 && !state.separated){
    state.separated = true;
    state.errorDigits[2] = 0;
  }
  if(t > ASCENT_TIME+18 && !state.chuteDeployed){
    state.chuteDeployed = true;
  }

  const altitude = prof.alt;
  const pressure = barometric(altitude) + (Math.random()*0.06-0.03);
  const temperature = 28 - altitude*0.0065 + (Math.random()*0.4-0.2);
  const voltage = Math.max(6.4, 8.4 - t*0.006 - Math.random()*0.02);
  const descentRate = prof.vSpeed;

  const pAlt = Math.max(0, altitude - 1.2);
  const pTemp = temperature - 0.6 + (Math.random()*0.3-0.15);
  const pVolt = Math.max(6.0, voltage - 0.35);

  if(prof.phase!=='STANDBY' && prof.phase!=='LANDED'){
    state.lat += (Math.random()*0.00006-0.00003);
    state.lon += (Math.random()*0.00008-0.00003);
  }
  state.gpsAvailable = Math.random() > 0.03;

  state.roll = 18*Math.sin(t*0.7) + (Math.random()*3-1.5);
  state.pitch = 10*Math.sin(t*0.5+1) + (Math.random()*2-1);
  state.yaw = (state.yaw + (prof.phase==='DESCENT'?6:2) + Math.random()*2) % 360;

  state.packetCount++;

  const packet = {
    time: fmtTime(t), missionSeconds:t.toFixed(1), packetCount:state.packetCount,
    altitude:altitude.toFixed(1), pressure:pressure.toFixed(2), temperature:temperature.toFixed(1),
    voltage:voltage.toFixed(2), lat:state.lat.toFixed(6), lon:state.lon.toFixed(6),
    sats: state.gpsAvailable ? (7+Math.floor(Math.random()*4)) : 0,
    state: prof.phase,
    payloadAltitude:pAlt.toFixed(1), payloadTemp:pTemp.toFixed(1), payloadVoltage:pVolt.toFixed(2),
    descentRate:descentRate.toFixed(2),
    roll:state.roll.toFixed(1), pitch:state.pitch.toFixed(1), yaw:state.yaw.toFixed(1),
  };

  ingestPacket(packet);
}

function ingestPacket(p){
  state.log.push(p);
  updateErrorCode(p);
  renderTelemetry(p);
  updateCharts(p);
  updateMap(p);
  updateOrientation(p);

  document.getElementById('pktCount').textContent = p.packetCount;
  document.getElementById('gpsClock').textContent = new Date().toLocaleTimeString('en-GB');
}

function renderTelemetry(p){
  document.getElementById('tMissionTime').textContent = p.time;
  document.getElementById('tState').textContent = p.state;
  document.getElementById('tAlt').innerHTML = `${p.altitude}<span class="unit">m</span>`;
  document.getElementById('tPress').innerHTML = `${p.pressure}<span class="unit">kPa</span>`;
  document.getElementById('tTemp').innerHTML = `${p.temperature}<span class="unit">°C</span>`;
  document.getElementById('tVolt').innerHTML = `${p.voltage}<span class="unit">V</span>`;
  document.getElementById('tSats').textContent = p.sats;
  document.getElementById('tLatLon').textContent = `${p.lat}, ${p.lon}`;

  document.getElementById('pAlt').innerHTML = `${p.payloadAltitude}<span class="unit">m</span>`;
  document.getElementById('pTemp').innerHTML = `${p.payloadTemp}<span class="unit">°C</span>`;
  document.getElementById('pVolt').innerHTML = `${p.payloadVoltage}<span class="unit">V</span>`;
  document.getElementById('pDescent').innerHTML = `${p.descentRate}<span class="unit">m/s</span>`;

  const voltEl = document.getElementById('tVolt');
  voltEl.className = 'v ' + (parseFloat(p.voltage) < 6.8 ? 'bad' : parseFloat(p.voltage) < 7.4 ? 'warn' : '');
}

function updateErrorCode(p){
  const dr = Math.abs(parseFloat(p.descentRate));
  const d1 = (p.state==='DESCENT') ? (dr < 8 || dr > 10 ? 1 : 0) : 0;
  const d2 = state.gpsAvailable ? 0 : 1;
  const d3 = state.separated ? 0 : 1;
  const d4 = state.chuteDeployed ? 1 : 0;
  state.errorDigits = [d1,d2,d3,d4];

  setDigit('d1', d1); setDigit('d2', d2); setDigit('d3', d3); setDigit('d4', d4);

  setErrLine('e1', d1, `${d1? 'outside range ('+p.descentRate+' m/s)' : 'within 8–10 m/s'}`);
  setErrLine('e2', d2, d2? 'unavailable' : 'available');
  setErrLine('e3', d3, d3? 'pending' : 'separated OK');
  setErrLine('e4', d4, d4? 'activated' : 'inactive');
}
function setDigit(id, val){
  const el = document.getElementById(id);
  el.querySelector('.num').textContent = val;
  el.className = 'errcode-digit ' + (val? 'fault':'ok');
}
function setErrLine(prefix, bad, text){
  document.getElementById(prefix+'chip').className = 'chip' + (bad?' bad':'');
  document.getElementById(prefix+'txt').textContent = text;
}

const CH_WINDOW = 30;
function makeChart(ctx, color){
  return new Chart(ctx, {
    type:'line',
    data:{ labels:[], datasets:[{ data:[], borderColor:color, backgroundColor:color+'22',
      borderWidth:1.4, pointRadius:0, tension:0.3, fill:true }]},
    options:{
      animation:false, responsive:true, maintainAspectRatio:false,
      scales:{
        x:{display:false},
        y:{ ticks:{color:'#5f7488', font:{size:8}, maxTicksLimit:3}, grid:{color:'#16202c'} }
      },
      plugins:{ legend:{display:false}, tooltip:{enabled:false} }
    }
  });
}
const chartAlt = makeChart(document.getElementById('chartAlt'), '#2ad6ff');
const chartPress = makeChart(document.getElementById('chartPress'), '#b28dff');
const chartTemp = makeChart(document.getElementById('chartTemp'), '#ffb020');
const chartDescent = makeChart(document.getElementById('chartDescent'), '#ff4d5e');
const chartVolt = makeChart(document.getElementById('chartVolt'), '#33ffb0');

function pushPoint(chart, label, val){
  chart.data.labels.push(label);
  chart.data.datasets[0].data.push(val);
  if(chart.data.labels.length > CH_WINDOW){ chart.data.labels.shift(); chart.data.datasets[0].data.shift(); }
  chart.update('none');
}
function updateCharts(p){
  pushPoint(chartAlt, p.time, parseFloat(p.altitude));
  pushPoint(chartPress, p.time, parseFloat(p.pressure));
  pushPoint(chartTemp, p.time, parseFloat(p.temperature));
  pushPoint(chartDescent, p.time, parseFloat(p.descentRate));
  pushPoint(chartVolt, p.time, parseFloat(p.voltage));
  document.getElementById('lblAlt').textContent = p.altitude+' m';
  document.getElementById('lblPress').textContent = p.pressure+' kPa';
  document.getElementById('lblTemp').textContent = p.temperature+' °C';
  document.getElementById('lblDescent').textContent = p.descentRate+' m/s';
  document.getElementById('lblVolt').textContent = p.voltage+' V';
}

const map = L.map('map', {zoomControl:true, attributionControl:false}).setView([state.lat, state.lon], 16);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:19 }).addTo(map);
const trail = L.polyline([], { color:'#2ad6ff', weight:3, opacity:0.8 }).addTo(map);
const marker = L.circleMarker([state.lat, state.lon], { radius:7, color:'#ffb020', fillColor:'#ffb020', fillOpacity:0.9, weight:2 }).addTo(map);

function updateMap(p){
  const latlng = [parseFloat(p.lat), parseFloat(p.lon)];
  trail.addLatLng(latlng);
  marker.setLatLng(latlng);
  map.panTo(latlng, {animate:true});
}
setTimeout(()=>map.invalidateSize(), 200);
window.addEventListener('resize', ()=>map.invalidateSize());

const horizonWrap = document.getElementById('horizonSvgWrap');
horizonWrap.innerHTML = `
<svg viewBox="0 0 200 180" preserveAspectRatio="xMidYMid meet">
  <defs>
    <clipPath id="hz-clip"><circle cx="100" cy="90" r="70"/></clipPath>
  </defs>
  <circle cx="100" cy="90" r="72" fill="#0c1219" stroke="#1e2b3c" stroke-width="2"/>
  <g clip-path="url(#hz-clip)">
    <g id="hz-rotor">
      <rect x="-60" y="-200" width="320" height="200" fill="#1a4a66"/>
      <rect x="-60" y="0" width="320" height="200" fill="#3a2a12"/>
      <line x1="-60" y1="0" x2="260" y2="0" stroke="#2ad6ff" stroke-width="2"/>
      <line x1="-60" y1="30" x2="260" y2="30" stroke="#2ad6ff44" stroke-width="1"/>
      <line x1="-60" y1="-30" x2="260" y2="-30" stroke="#2ad6ff44" stroke-width="1"/>
      <line x1="-60" y1="60" x2="260" y2="60" stroke="#2ad6ff33" stroke-width="1"/>
      <line x1="-60" y1="-60" x2="260" y2="-60" stroke="#2ad6ff33" stroke-width="1"/>
    </g>
  </g>
  <circle cx="100" cy="90" r="72" fill="none" stroke="#1e2b3c" stroke-width="3"/>
  <line x1="60" y1="90" x2="82" y2="90" stroke="#ffb020" stroke-width="3"/>
  <line x1="118" y1="90" x2="140" y2="90" stroke="#ffb020" stroke-width="3"/>
  <polygon points="100,84 94,96 106,96" fill="#ffb020"/>
</svg>`;
const hzRotor = document.getElementById('hz-rotor');

const cubeWrap = document.getElementById('cubeWrap');
let three = { w: cubeWrap.clientWidth || 200, h: cubeWrap.clientHeight || 100 };
const scene = new THREE.Scene();
const camera3 = new THREE.PerspectiveCamera(45, three.w/three.h, 0.1, 100);
camera3.position.set(3.4,2.2,3.4); camera3.lookAt(0,0,0);
const renderer3 = new THREE.WebGLRenderer({ antialias:true, alpha:true });
renderer3.setSize(three.w, three.h);
cubeWrap.appendChild(renderer3.domElement);

/* CanSat model: a soda-can-shaped cylindrical canister (per CanSat spec proportions) */
const satGroup = new THREE.Group();
const canRadius = 0.5, canHeight = 1.5;

const bodyGeo = new THREE.CylinderGeometry(canRadius, canRadius, canHeight, 22, 1, false);
const bodyMat = new THREE.MeshStandardMaterial({ color:0x18222e, metalness:0.55, roughness:0.4, emissive:0x08131a });
const body = new THREE.Mesh(bodyGeo, bodyMat);
satGroup.add(body);

const wireGeo = new THREE.CylinderGeometry(canRadius+0.01, canRadius+0.01, canHeight+0.02, 22, 1, false);
const wire = new THREE.LineSegments(new THREE.EdgesGeometry(wireGeo), new THREE.LineBasicMaterial({ color:0x2ad6ff }));
satGroup.add(wire);

/* amber bulkhead / separation-plane stripe around the can */
const bandGeo = new THREE.CylinderGeometry(canRadius+0.015, canRadius+0.015, 0.13, 22, 1, true);
const bandMat = new THREE.MeshStandardMaterial({ color:0xffb020, emissive:0x552d00, side:THREE.DoubleSide });
const band = new THREE.Mesh(bandGeo, bandMat);
band.position.y = canHeight*0.12;
satGroup.add(band);

/* flat top cap */
const capGeo = new THREE.CircleGeometry(canRadius, 22);
const capMat = new THREE.MeshStandardMaterial({ color:0x0e161f, metalness:0.5, roughness:0.55, side:THREE.DoubleSide });
const topCap = new THREE.Mesh(capGeo, capMat);
topCap.rotation.x = -Math.PI/2;
topCap.position.y = canHeight/2;
satGroup.add(topCap);

/* whip antenna — also serves as the "up" direction indicator */
const antGeo = new THREE.CylinderGeometry(0.018,0.018,0.55,6);
const antMat = new THREE.MeshStandardMaterial({ color:0xffb020, emissive:0x552d00 });
const antenna = new THREE.Mesh(antGeo, antMat);
antenna.position.y = canHeight/2 + 0.27;
satGroup.add(antenna);

scene.add(satGroup);

scene.add(new THREE.AmbientLight(0x8899aa, 0.9));
const dl = new THREE.DirectionalLight(0xffffff,1.1); dl.position.set(3,4,2); scene.add(dl);

function resizeThree(){
  const w = cubeWrap.clientWidth, h = cubeWrap.clientHeight;
  if(w<10||h<10) return;
  camera3.aspect = w/h; camera3.updateProjectionMatrix();
  renderer3.setSize(w,h);
}
window.addEventListener('resize', resizeThree);
setTimeout(resizeThree, 200);

function animate3(){
  requestAnimationFrame(animate3);
  renderer3.render(scene, camera3);
}
animate3();

function updateOrientation(p){
  const roll = parseFloat(p.roll), pitch = parseFloat(p.pitch), yaw = parseFloat(p.yaw);
  document.getElementById('valRoll').textContent = roll.toFixed(1)+'°';
  document.getElementById('valPitch').textContent = pitch.toFixed(1)+'°';
  document.getElementById('valYaw').textContent = yaw.toFixed(1)+'°';

  hzRotor.setAttribute('transform', `translate(100 90) rotate(${-roll}) translate(-100 ${-90 + pitch*1.4})`);

  satGroup.rotation.z = THREE.MathUtils.degToRad(roll);
  satGroup.rotation.x = THREE.MathUtils.degToRad(pitch);
  satGroup.rotation.y = THREE.MathUtils.degToRad(yaw);
}

function logCmd(msg, level='ok'){
  const el = document.getElementById('cmdLog');
  const entry = document.createElement('div');
  entry.className = 'entry '+level;
  entry.innerHTML = `<span class="t">${new Date().toLocaleTimeString('en-GB')}</span>${msg}`;
  el.prepend(entry);
  while(el.children.length > 60) el.removeChild(el.lastChild);
}

document.getElementById('btnSeparation').addEventListener('click', ()=>{
  logCmd('CMD → Manual Separation sent…', 'warn');
  setTimeout(()=>{
    state.separated = true;
    logCmd('ACK ← Separation confirmed', 'ok');
  }, 1200);
});
document.getElementById('btnChute').addEventListener('click', ()=>{
  logCmd('CMD → Emergency Parachute Deployment sent…', 'crit');
  setTimeout(()=>{
    state.chuteDeployed = true;
    logCmd('ACK ← Emergency parachute ACTIVE', 'crit');
  }, 800);
});
document.getElementById('btnRedundant').addEventListener('click', ()=>{
  logCmd('CMD → Redundant Activation (backup channel) sent…', 'warn');
  setTimeout(()=>{
    state.separated = true;
    logCmd('ACK ← Redundant activation confirmed', 'ok');
  }, 1200);
});

document.getElementById('btnStart').addEventListener('click', startSim);
document.getElementById('btnStop').addEventListener('click', stopSim);

document.getElementById('btnSync').addEventListener('click', ()=>{
  document.getElementById('gpsClock').textContent = new Date().toLocaleTimeString('en-GB');
  logCmd('PC time synced to GPS clock', 'ok');
});

document.getElementById('btnReset').addEventListener('click', ()=>{
  state.packetCount = 0;
  state.log = [];
  document.getElementById('pktCount').textContent = '0';
  logCmd('Packet counter and log reset', 'warn');
});

document.getElementById('btnExportCsv').addEventListener('click', ()=>{
  if(state.log.length===0){ logCmd('Export CSV: no telemetry logged yet', 'warn'); return; }
  const headers = Object.keys(state.log[0]);
  const rows = [headers.join(',')].concat(state.log.map(r=>headers.map(h=>r[h]).join(',')));
  downloadBlob(rows.join('\n'), 'text/csv', `ISL_telemetry_${Date.now()}.csv`);
  logCmd(`Exported CSV (${state.log.length} packets)`, 'ok');
});

document.getElementById('btnExportGraph').addEventListener('click', ()=>{
  [['altitude',chartAlt],['pressure',chartPress],['temperature',chartTemp],['descent_rate',chartDescent],['voltage',chartVolt]]
    .forEach(([name,chart])=>{
      const a = document.createElement('a');
      a.href = chart.toBase64Image();
      a.download = `ISL_${name}_${Date.now()}.png`;
      a.click();
    });
  logCmd('Exported all graph snapshots as PNG', 'ok');
});

function downloadBlob(content, mime, filename){
  const blob = new Blob([content], { type:mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

let camStream = null;
async function populateCameras(){
  try{
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter(d=>d.kind==='videoinput');
    const sel = document.getElementById('camSelect');
    sel.innerHTML = '<option value="">Select camera…</option>' +
      cams.map((c,i)=>`<option value="${c.deviceId}">${c.label || 'Camera '+(i+1)}</option>`).join('');
  }catch(e){}
}
populateCameras();

document.getElementById('btnCamStart').addEventListener('click', async ()=>{
  try{
    const deviceId = document.getElementById('camSelect').value;
    const constraints = { video: deviceId ? { deviceId:{exact:deviceId} } : true, audio:false };
    camStream = await navigator.mediaDevices.getUserMedia(constraints);
    const video = document.getElementById('camVideo');
    video.srcObject = camStream;
    document.getElementById('videoPlaceholder').style.display = 'none';
    document.getElementById('recBadge').style.display = 'flex';
    document.getElementById('btnCamStart').disabled = true;
    document.getElementById('btnCamStop').disabled = false;
    populateCameras();
    logCmd('Video stream started', 'ok');
  }catch(e){
    logCmd('Camera access failed: '+e.message, 'crit');
  }
});
document.getElementById('btnCamStop').addEventListener('click', ()=>{
  if(camStream){ camStream.getTracks().forEach(t=>t.stop()); camStream=null; }
  document.getElementById('camVideo').srcObject = null;
  document.getElementById('videoPlaceholder').style.display = 'flex';
  document.getElementById('recBadge').style.display = 'none';
  document.getElementById('btnCamStart').disabled = false;
  document.getElementById('btnCamStop').disabled = true;
  logCmd('Video stream stopped', 'warn');
});

setInterval(()=>{
  if(!state.running){ document.getElementById('gpsClock').textContent = new Date().toLocaleTimeString('en-GB'); }
}, 1000);

logCmd('Ground Control Software initialized. Awaiting telemetry start.', 'ok');
