// State & Chart instances
let isRunning = false;
let packetCount = 0;
let timerId = null;

let chartAlt, chartPress, chartTemp, chartDescent, chartVolt;
let leafletMap, mapMarker, mapPolyline;
let threeScene, threeCamera, threeRenderer, threeCube;
let mediaStream = null;

// Initialization on DOM Load
document.addEventListener("DOMContentLoaded", () => {
  initCharts();
  initMap();
  init3D();
  initHorizonSVG();
  setupEventListeners();
});

// Chart.js Setup
function initCharts() {
  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    scales: {
      x: { display: false },
      y: {
        ticks: { color: "#7a8b9e", font: { size: 9 } },
        grid: { color: "rgba(255,255,255,0.05)" },
      },
    },
    plugins: { legend: { display: false } },
  };

  const createConfig = (label, color) => ({
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label,
          data: [],
          borderColor: color,
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.2,
        },
      ],
    },
    options: commonOptions,
  });

  chartAlt = new Chart(
    document.getElementById("chartAlt"),
    createConfig("Alt", "#00e5ff")
  );
  chartPress = new Chart(
    document.getElementById("chartPress"),
    createConfig("Press", "#ffd600")
  );
  chartTemp = new Chart(
    document.getElementById("chartTemp"),
    createConfig("Temp", "#ff1744")
  );
  chartDescent = new Chart(
    document.getElementById("chartDescent"),
    createConfig("Descent", "#00e676")
  );
  chartVolt = new Chart(
    document.getElementById("chartVolt"),
    createConfig("Volt", "#a855f7")
  );
}

// Leaflet Map Initialization
function initMap() {
  const defaultPos = [28.6139, 77.209];
  leafletMap = L.map("map").setView(defaultPos, 13);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "© OpenStreetMap",
  }).addTo(leafletMap);

  mapMarker = L.marker(defaultPos).addTo(leafletMap);
  mapPolyline = L.polyline([defaultPos], { color: "#00e5ff", weight: 2 }).addTo(
    leafletMap
  );
}

// Three.js 3D Orientation Model Initialization
function init3D() {
  const container = document.getElementById("cubeWrap");
  const width = container.clientWidth || 130;
  const height = container.clientHeight || 100;

  threeScene = new THREE.Scene();
  threeCamera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  threeCamera.position.z = 4;

  threeRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  threeRenderer.setSize(width, height);
  container.appendChild(threeRenderer.domElement);

  const geometry = new THREE.CylinderGeometry(0.6, 0.6, 1.5, 16);
  const material = new THREE.MeshBasicMaterial({
    color: 0x00e5ff,
    wireframe: true,
  });
  threeCube = new THREE.Mesh(geometry, material);
  threeScene.add(threeCube);

  function animate() {
    requestAnimationFrame(animate);
    threeRenderer.render(threeScene, threeCamera);
  }
  animate();

  // Observer to handle container resizing when dynamic layout changes occur
  new ResizeObserver(() => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w > 0 && h > 0) {
      threeCamera.aspect = w / h;
      threeCamera.updateProjectionMatrix();
      threeRenderer.setSize(w, h);
    }
  }).observe(container);
}

// SVG Horizon Indicator Setup
function initHorizonSVG() {
  const wrap = document.getElementById("horizonSvgWrap");
  wrap.innerHTML = `
    <svg width="100%" height="100%" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="40" stroke="#7a8b9e" stroke-width="1" fill="none" />
      <line id="horizonLine" x1="20" y1="50" x2="80" y2="50" stroke="#00e5ff" stroke-width="2" />
      <circle cx="50" cy="50" r="2" fill="#ff1744" />
    </svg>
  `;
}

// Control Loop & Events
function setupEventListeners() {
  document.getElementById("btnStart").addEventListener("click", startTelemetry);
  document.getElementById("btnStop").addEventListener("click", stopTelemetry);
  document.getElementById("btnReset").addEventListener("click", resetTelemetry);

  document.getElementById("btnCamStart").addEventListener("click", startCamera);
  document.getElementById("btnCamStop").addEventListener("click", stopCamera);
}

function startTelemetry() {
  if (isRunning) return;
  isRunning = true;
  document.getElementById("btnStart").disabled = true;
  document.getElementById("btnStop").disabled = false;
  document.getElementById("linkDot").className = "dot on";
  document.getElementById("linkLabel").innerText = "TELEMETRY ACTIVE";

  timerId = setInterval(tick, 1000);
}

function stopTelemetry() {
  if (!isRunning) return;
  isRunning = false;
  document.getElementById("btnStart").disabled = false;
  document.getElementById("btnStop").disabled = true;
  document.getElementById("linkDot").className = "dot off";
  document.getElementById("linkLabel").innerText = "TELEMETRY PAUSED";

  clearInterval(timerId);
}

function resetTelemetry() {
  packetCount = 0;
  document.getElementById("pktCount").innerText = "0";
  [chartAlt, chartPress, chartTemp, chartDescent, chartVolt].forEach((c) => {
    c.data.labels = [];
    c.data.datasets[0].data = [];
    c.update();
  });
}

function tick() {
  packetCount++;
  document.getElementById("pktCount").innerText = packetCount;

  const now = new Date();
  document.getElementById("gpsClock").innerText = now
    .toTimeString()
    .split(" ")[0];
  document.getElementById("tMissionTime").innerText = new Date(
    packetCount * 1000
  )
    .toISOString()
    .substr(11, 8);

  // Generate mock values
  const alt = Math.max(0, 1000 - packetCount * 5);
  const press = (101.3 * Math.exp(-alt / 8400)).toFixed(1);
  const temp = (25 - alt * 0.0065).toFixed(1);
  const descent = (8.5 + Math.sin(packetCount) * 0.5).toFixed(1);
  const volt = (7.4 - packetCount * 0.001).toFixed(2);

  // Update Telemetry Panel
  document.getElementById("tAlt").innerHTML = `${alt.toFixed(
    1
  )}<span class="unit">m</span>`;
  document.getElementById(
    "tPress"
  ).innerHTML = `${press}<span class="unit">kPa</span>`;
  document.getElementById(
    "tTemp"
  ).innerHTML = `${temp}<span class="unit">°C</span>`;
  document.getElementById(
    "tVolt"
  ).innerHTML = `${volt}<span class="unit">V</span>`;
  document.getElementById(
    "pDescent"
  ).innerHTML = `${descent}<span class="unit">m/s</span>`;

  document.getElementById("lblAlt").innerText = `${alt.toFixed(1)} m`;
  document.getElementById("lblPress").innerText = `${press} kPa`;
  document.getElementById("lblTemp").innerText = `${temp} °C`;
  document.getElementById("lblDescent").innerText = `${descent} m/s`;
  document.getElementById("lblVolt").innerText = `${volt} V`;

  // Push values to Chart.js
  const timeLabel = now.toLocaleTimeString();
  pushData(chartAlt, timeLabel, alt);
  pushData(chartPress, timeLabel, press);
  pushData(chartTemp, timeLabel, temp);
  pushData(chartDescent, timeLabel, descent);
  pushData(chartVolt, timeLabel, volt);

  // Update 3D orientation model dynamically
  const roll = Math.sin(packetCount * 0.2) * 15;
  const pitch = Math.cos(packetCount * 0.2) * 15;
  const yaw = (packetCount * 2) % 360;

  if (threeCube) {
    threeCube.rotation.x = pitch * (Math.PI / 180);
    threeCube.rotation.z = -roll * (Math.PI / 180);
    threeCube.rotation.y = yaw * (Math.PI / 180);
  }

  document.getElementById("valRoll").innerText = `${roll.toFixed(1)}°`;
  document.getElementById("valPitch").innerText = `${pitch.toFixed(1)}°`;
  document.getElementById("valYaw").innerText = `${yaw.toFixed(1)}°`;

  const horizonLine = document.getElementById("horizonLine");
  if (horizonLine) {
    horizonLine.setAttribute(
      "transform",
      `rotate(${roll}, 50, 50) translate(0, ${pitch * 0.5})`
    );
  }
}

function pushData(chart, label, value) {
  chart.data.labels.push(label);
  chart.data.datasets[0].data.push(value);
  if (chart.data.labels.length > 20) {
    chart.data.labels.shift();
    chart.data.datasets[0].data.shift();
  }
  chart.update();
}

// Camera controls setup
async function startCamera() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
    const videoElem = document.getElementById("camVideo");
    videoElem.srcObject = mediaStream;
    document.getElementById("videoPlaceholder").style.display = "none";
    document.getElementById("recBadge").style.display = "flex";
    document.getElementById("btnCamStart").disabled = true;
    document.getElementById("btnCamStop").disabled = false;
  } catch (err) {
    alert("Unable to access camera: " + err.message);
  }
}

function stopCamera() {
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }
  document.getElementById("camVideo").srcObject = null;
  document.getElementById("videoPlaceholder").style.display = "flex";
  document.getElementById("recBadge").style.display = "none";
  document.getElementById("btnCamStart").disabled = false;
  document.getElementById("btnCamStop").disabled = true;
}
