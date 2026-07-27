/**
 * ISL-GCS // CanSat Ground Control Software
 * Full Application Logic (app.js)
 */

// ==========================================
// 1. GLOBAL STATE & VARIABLES
// ==========================================
let isTelemetryActive = false;
let telemetryInterval = null;
let packetCount = 0;
let missionSeconds = 0;
let activeStream = null;

// Chart Instances
const charts = {};

// Map & Marker
let map = null;
let marker = null;

// Three.js Orientation
let scene, camera, renderer, cube;

// ==========================================
// 2. DOM CONTENT LOADED (ENTRY POINT)
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  initCharts();
  initMap();
  initOrientation3D();
  initHorizonSVG();
  initCameraSystem();
  setupEventListeners();

  logCommand("Ground Control System Initialized. System Ready.", "info");
});

// ==========================================
// 3. LOGGING SYSTEM
// ==========================================
function logCommand(message, type = "info") {
  const cmdLog = document.getElementById("cmdLog");
  if (!cmdLog) return;

  const timestamp = new Date().toLocaleTimeString();
  const logEntry = document.createElement("div");
  logEntry.className = `log-entry ${type}`;
  logEntry.innerHTML = `<span class="log-time">[${timestamp}]</span> ${message}`;

  cmdLog.appendChild(logEntry);
  cmdLog.scrollTop = cmdLog.scrollHeight;
}

// ==========================================
// 4. EVENT LISTENERS SETUP
// ==========================================
function setupEventListeners() {
  // Topbar Control Buttons
  document
    .getElementById("btnStart")
    ?.addEventListener("click", startTelemetry);
  document.getElementById("btnStop")?.addEventListener("click", stopTelemetry);
  document.getElementById("btnSync")?.addEventListener("click", syncGpsTime);
  document
    .getElementById("btnReset")
    ?.addEventListener("click", resetPacketCounter);
  document
    .getElementById("btnExportCsv")
    ?.addEventListener("click", exportCsvData);
  document
    .getElementById("btnExportGraph")
    ?.addEventListener("click", exportGraphs);

  // Critical Mission Control Buttons
  document.getElementById("btnSeparation")?.addEventListener("click", () => {
    logCommand("CMD SENT: Manual Separation Activated!", "warn");
    updateErrorCodeDigit("d3", 1, "Separation", "triggered");
  });

  document.getElementById("btnChute")?.addEventListener("click", () => {
    logCommand("CMD SENT: Emergency Chute Deployed!", "danger");
    updateErrorCodeDigit("d4", 1, "Chute", "deployed");
  });

  document.getElementById("btnRedundant")?.addEventListener("click", () => {
    logCommand("CMD SENT: Redundant System Activation Triggered!", "warn");
  });

  // Video Stream Buttons
  document
    .getElementById("btnCamStart")
    ?.addEventListener("click", startCameraStream);
  document
    .getElementById("btnCamStop")
    ?.addEventListener("click", stopCameraStream);
}

// ==========================================
// 5. TELEMETRY ENGINE & SIMULATION
// ==========================================
function startTelemetry() {
  if (isTelemetryActive) return;

  isTelemetryActive = true;
  document.getElementById("btnStart").disabled = true;
  document.getElementById("btnStop").disabled = false;

  const linkDot = document.getElementById("linkDot");
  const linkLabel = document.getElementById("linkLabel");
  if (linkDot) linkDot.className = "dot on";
  if (linkLabel) linkLabel.textContent = "TELEMETRY LIVE";

  logCommand("MISSION STARTED — Live Telemetry stream active.", "success");

  // Loop every 1 second
  telemetryInterval = setInterval(updateTelemetryTick, 1000);
}

function stopTelemetry() {
  if (!isTelemetryActive) return;

  isTelemetryActive = false;
  clearInterval(telemetryInterval);

  document.getElementById("btnStart").disabled = false;
  document.getElementById("btnStop").disabled = true;

  const linkDot = document.getElementById("linkDot");
  const linkLabel = document.getElementById("linkLabel");
  if (linkDot) linkDot.className = "dot off";
  if (linkLabel) linkLabel.textContent = "TELEMETRY IDLE";

  logCommand("MISSION STOPPED — Telemetry stream paused.", "danger");
}

function updateTelemetryTick() {
  packetCount++;
  missionSeconds++;

  // System Time Format
  const hours = String(Math.floor(missionSeconds / 3600)).padStart(2, "0");
  const mins = String(Math.floor((missionSeconds % 3600) / 60)).padStart(
    2,
    "0"
  );
  const secs = String(missionSeconds % 60).padStart(2, "0");
  const timeStr = `${hours}:${mins}:${secs}`;

  // Generated Simulated Values
  const alt = Math.max(
    0,
    1000 - missionSeconds * 8 + (Math.random() * 2 - 1)
  ).toFixed(1);
  const press = (101.3 - alt * 0.012).toFixed(1);
  const temp = (25 - alt * 0.0065 + Math.random() * 0.5).toFixed(1);
  const descent = (8.0 + Math.random() * 1.5).toFixed(1);
  const volt = (11.8 - missionSeconds * 0.002).toFixed(2);
  const lat = (28.6139 + (Math.random() - 0.5) * 0.001).toFixed(4);
  const lon = (77.209 + (Math.random() - 0.5) * 0.001).toFixed(4);

  // Update Topbar UI
  document.getElementById("pktCount").textContent = packetCount;
  document.getElementById("gpsClock").textContent =
    new Date().toLocaleTimeString();

  // Update Telemetry Panel
  document.getElementById("tMissionTime").textContent = timeStr;
  document.getElementById("tState").textContent =
    alt > 500 ? "DESCENT" : alt > 0 ? "LANDING" : "TOUCHDOWN";
  document.getElementById(
    "tAlt"
  ).innerHTML = `${alt}<span class="unit">m</span>`;
  document.getElementById(
    "tPress"
  ).innerHTML = `${press}<span class="unit">kPa</span>`;
  document.getElementById(
    "tTemp"
  ).innerHTML = `${temp}<span class="unit">°C</span>`;
  document.getElementById(
    "tVolt"
  ).innerHTML = `${volt}<span class="unit">V</span>`;
  document.getElementById("tSats").textContent = "12";
  document.getElementById("tLatLon").textContent = `${lat}, ${lon}`;

  // Update Payload Panel
  document.getElementById(
    "pAlt"
  ).innerHTML = `${alt}<span class="unit">m</span>`;
  document.getElementById(
    "pTemp"
  ).innerHTML = `${temp}<span class="unit">°C</span>`;
  document.getElementById(
    "pVolt"
  ).innerHTML = `${volt}<span class="unit">V</span>`;
  document.getElementById(
    "pDescent"
  ).innerHTML = `${descent}<span class="unit">m/s</span>`;

  // Update Chart Values Labels
  document.getElementById("lblAlt").textContent = `${alt} m`;
  document.getElementById("lblPress").textContent = `${press} kPa`;
  document.getElementById("lblTemp").textContent = `${temp} °C`;
  document.getElementById("lblDescent").textContent = `${descent} m/s`;
  document.getElementById("lblVolt").textContent = `${volt} V`;

  // Push Data to Charts
  pushChartData(charts.alt, timeStr, alt);
  pushChartData(charts.press, timeStr, press);
  pushChartData(charts.temp, timeStr, temp);
  pushChartData(charts.descent, timeStr, descent);
  pushChartData(charts.volt, timeStr, volt);

  // Update Map Position
  if (marker) {
    const newPos = [parseFloat(lat), parseFloat(lon)];
    marker.setLatLng(newPos);
    map.panTo(newPos);
  }

  // Update Orientation Simulation
  const pitch = Math.sin(missionSeconds * 0.2) * 15;
  const roll = Math.cos(missionSeconds * 0.2) * 15;
  const yaw = (missionSeconds * 5) % 360;
  updateOrientation(roll, pitch, yaw);
}

function resetPacketCounter() {
  packetCount = 0;
  missionSeconds = 0;
  document.getElementById("pktCount").textContent = "0";
  document.getElementById("tMissionTime").textContent = "00:00:00";
  logCommand("Packet counter and mission timer reset.", "info");
}

function syncGpsTime() {
  document.getElementById("gpsClock").textContent =
    new Date().toLocaleTimeString();
  logCommand("System clock synchronized with GPS time.", "info");
}

function exportCsvData() {
  logCommand("CSV Export generated and downloaded.", "success");
  alert("Exporting telemetry data to CSV...");
}

function exportGraphs() {
  logCommand("Graph snapshot exported.", "success");
  alert("Exporting graph snapshots...");
}

// ==========================================
// 6. ERROR CODE SYSTEM
// ==========================================
function updateErrorCodeDigit(id, code, label, statusText) {
  const elem = document.getElementById(id);
  if (!elem) return;

  const numSpan = elem.querySelector(".num");
  if (numSpan) numSpan.textContent = code;

  if (code !== 0) {
    elem.classList.remove("ok");
    elem.classList.add("err");
  } else {
    elem.classList.remove("err");
    elem.classList.add("ok");
  }

  // Update inline line text
  const numIndex = id.replace("d", "");
  const txtElem = document.getElementById(`e${numIndex}txt`);
  if (txtElem) txtElem.textContent = statusText;
}

// ==========================================
// 7. CHART.JS INITIALIZATION
// ==========================================
function initCharts() {
  const chartConfigs = [
    { id: "chartAlt", key: "alt", color: "#00e5ff" },
    { id: "chartPress", key: "press", color: "#00ff88" },
    { id: "chartTemp", key: "temp", color: "#ffb700" },
    { id: "chartDescent", key: "descent", color: "#ff4d4d" },
    { id: "chartVolt", key: "volt", color: "#a855f7" },
  ];

  chartConfigs.forEach((cfg) => {
    const canvas = document.getElementById(cfg.id);
    if (!canvas) return;

    charts[cfg.key] = new Chart(canvas.getContext("2d"), {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            data: [],
            borderColor: cfg.color,
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false,
            tension: 0.2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { display: false },
          y: {
            grid: { color: "rgba(255, 255, 255, 0.05)" },
            ticks: { color: "#7a8b9e", font: { size: 9 } },
          },
        },
      },
    });
  });
}

function pushChartData(chart, label, data) {
  if (!chart) return;
  chart.data.labels.push(label);
  chart.data.datasets[0].data.push(data);
  if (chart.data.labels.length > 20) {
    chart.data.labels.shift();
    chart.data.datasets[0].data.shift();
  }
  chart.update("none");
}

// ==========================================
// 8. CAMERA SYSTEM
// ==========================================
async function initCameraSystem() {
  const camSelect = document.getElementById("camSelect");
  if (!camSelect) return;

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter((d) => d.kind === "videoinput");

    camSelect.innerHTML = '<option value="">Select Camera…</option>';
    videoDevices.forEach((device, idx) => {
      const opt = document.createElement("option");
      opt.value = device.deviceId;
      opt.textContent = device.label || `Camera ${idx + 1}`;
      camSelect.appendChild(opt);
    });
  } catch (err) {
    console.warn("Camera enumeration error:", err);
  }
}

async function startCameraStream() {
  const camSelect = document.getElementById("camSelect");
  const videoEl = document.getElementById("camVideo");
  const placeholder = document.getElementById("videoPlaceholder");
  const recBadge = document.getElementById("recBadge");

  const deviceId = camSelect ? camSelect.value : null;
  const constraints = {
    video: deviceId ? { deviceId: { exact: deviceId } } : true,
  };

  try {
    activeStream = await navigator.mediaDevices.getUserMedia(constraints);
    if (videoEl) {
      videoEl.srcObject = activeStream;
      videoEl.play();
    }

    if (placeholder) placeholder.style.display = "none";
    if (recBadge) recBadge.style.display = "flex";

    document.getElementById("btnCamStart").disabled = true;
    document.getElementById("btnCamStop").disabled = false;

    logCommand("Video stream started.", "success");
  } catch (err) {
    logCommand("Failed to access camera: " + err.message, "danger");
  }
}

function stopCameraStream() {
  if (activeStream) {
    activeStream.getTracks().forEach((track) => track.stop());
    activeStream = null;
  }

  const videoEl = document.getElementById("camVideo");
  const placeholder = document.getElementById("videoPlaceholder");
  const recBadge = document.getElementById("recBadge");

  if (videoEl) videoEl.srcObject = null;
  if (placeholder) placeholder.style.display = "flex";
  if (recBadge) recBadge.style.display = "none";

  document.getElementById("btnCamStart").disabled = false;
  document.getElementById("btnCamStop").disabled = true;

  logCommand("Video stream stopped.", "warn");
}

// ==========================================
// 9. LEAFLET MAP
// ==========================================
function initMap() {
  const mapContainer = document.getElementById("map");
  if (!mapContainer || typeof L === "undefined") return;

  const initialCoords = [28.6139, 77.209];
  map = L.map("map", { zoomControl: false }).setView(initialCoords, 14);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap",
  }).addTo(map);

  marker = L.marker(initialCoords).addTo(map);
  marker.bindPopup("CanSat Payload").openPopup();
}

// ==========================================
// 10. ORIENTATION (THREE.JS & HORIZON)
// ==========================================
function initOrientation3D() {
  const wrap = document.getElementById("cubeWrap");
  if (!wrap || typeof THREE === "undefined") return;

  const width = wrap.clientWidth || 100;
  const height = wrap.clientHeight || 100;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
  camera.position.z = 3;

  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(width, height);
  wrap.appendChild(renderer.domElement);

  const geometry = new THREE.BoxGeometry(1.2, 0.6, 0.6);
  const materials = [
    new THREE.MeshBasicMaterial({ color: 0x00e5ff, wireframe: true }),
    new THREE.MeshBasicMaterial({ color: 0x00e5ff, wireframe: true }),
    new THREE.MeshBasicMaterial({ color: 0x00ff88, wireframe: true }),
    new THREE.MeshBasicMaterial({ color: 0x00ff88, wireframe: true }),
    new THREE.MeshBasicMaterial({ color: 0xffb700, wireframe: true }),
    new THREE.MeshBasicMaterial({ color: 0xffb700, wireframe: true }),
  ];

  cube = new THREE.Mesh(geometry, materials);
  scene.add(cube);

  function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }
  animate();
}

function initHorizonSVG() {
  const wrap = document.getElementById("horizonSvgWrap");
  if (!wrap) return;

  wrap.innerHTML = `
    <svg width="100%" height="100%" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="40" stroke="rgba(0, 229, 255, 0.3)" stroke-width="2" fill="none" />
      <line id="horizonLine" x1="15" y1="50" x2="85" y2="50" stroke="#00e5ff" stroke-width="2" />
      <circle cx="50" cy="50" r="3" fill="#ff4d4d" />
    </svg>
  `;
}

function updateOrientation(roll, pitch, yaw) {
  // Update UI Numerical Values
  const vRoll = document.getElementById("valRoll");
  const vPitch = document.getElementById("valPitch");
  const vYaw = document.getElementById("valYaw");

  if (vRoll) vRoll.textContent = `${roll.toFixed(1)}°`;
  if (vPitch) vPitch.textContent = `${pitch.toFixed(1)}°`;
  if (vYaw) vYaw.textContent = `${yaw.toFixed(1)}°`;

  // Update Three.js 3D Cube
  if (cube) {
    cube.rotation.x = THREE.MathUtils.degToRad(pitch);
    cube.rotation.z = THREE.MathUtils.degToRad(roll);
    cube.rotation.y = THREE.MathUtils.degToRad(yaw);
  }

  // Update Horizon Line SVG
  const horizonLine = document.getElementById("horizonLine");
  if (horizonLine) {
    const translateY = pitch * 0.5;
    horizonLine.setAttribute(
      "transform",
      `rotate(${roll}, 50, 50) translate(0, ${translateY})`
    );
  }
}
