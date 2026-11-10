const { invoke } = window.__TAURI__.core;

const MAX_POINTS = 60;
const cpuHistory = [];
const memHistory = [];

function fmtBytes(bytes) {
  if (!bytes) return "0 GB";
  return (bytes / 1024 ** 3).toFixed(1) + " GB";
}

function fmtUptime(totalSeconds) {
  const d = Math.floor(totalSeconds / 86400);
  const h = Math.floor((totalSeconds % 86400) / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return (d > 0 ? d + " д " : "") + h + " ч " + m + " мин";
}

function drawChart(canvas, data, color) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth * dpr;
  const h = canvas.clientHeight * dpr;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, w, h);

  // grid lines at 25/50/75%
  ctx.strokeStyle = "rgba(143,163,191,0.15)";
  ctx.lineWidth = 1;
  for (const f of [0.25, 0.5, 0.75]) {
    ctx.beginPath();
    ctx.moveTo(0, h * f);
    ctx.lineTo(w, h * f);
    ctx.stroke();
  }
  if (data.length < 2) return;

  const stepX = w / (MAX_POINTS - 1);
  const x0 = w - (data.length - 1) * stepX;

  ctx.beginPath();
  data.forEach((v, i) => {
    const x = x0 + i * stepX;
    const y = h - (Math.min(100, Math.max(0, v)) / 100) * (h - 4 * dpr) - 2 * dpr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6 * dpr;
  ctx.stroke();

  ctx.lineTo(x0 + (data.length - 1) * stepX, h);
  ctx.lineTo(x0, h);
  ctx.closePath();
  ctx.fillStyle = color.replace(")", ",0.15)").replace("rgb", "rgba");
  ctx.fill();
}

function buildCoreBars(count) {
  const wrap = document.getElementById("core-bars");
  wrap.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const row = document.createElement("div");
    row.className = "core-row";
    row.innerHTML =
      '<span>Ядро ' + (i + 1) + '</span><div class="bar"><div class="bar-fill"></div></div><span class="core-val">—</span>';
    wrap.appendChild(row);
  }
}

let coreCount = -1;

async function tick() {
  let s;
  try {
    s = await invoke("get_stats");
  } catch (e) {
    console.error("get_stats failed:", e);
    return;
  }

  // CPU
  document.getElementById("cpu-usage").textContent = s.cpu_usage.toFixed(1) + "%";
  document.getElementById("cpu-brand").textContent = s.cpu_brand || "";
  cpuHistory.push(s.cpu_usage);
  if (cpuHistory.length > MAX_POINTS) cpuHistory.shift();
  drawChart(document.getElementById("cpu-chart"), cpuHistory, "rgb(74,222,128)");

  if (s.per_core.length !== coreCount) {
    coreCount = s.per_core.length;
    buildCoreBars(coreCount);
  }
  document.querySelectorAll("#core-bars .core-row").forEach((row, i) => {
    row.querySelector(".bar-fill").style.width = s.per_core[i].toFixed(0) + "%";
    row.querySelector(".core-val").textContent = s.per_core[i].toFixed(0) + "%";
  });

  // Memory
  const memPct = s.mem_total ? (s.mem_used / s.mem_total) * 100 : 0;
  document.getElementById("mem-text").textContent =
    fmtBytes(s.mem_used) + " / " + fmtBytes(s.mem_total);
  document.getElementById("mem-bar").style.width = memPct.toFixed(0) + "%";
  memHistory.push(memPct);
  if (memHistory.length > MAX_POINTS) memHistory.shift();
  drawChart(document.getElementById("mem-chart"), memHistory, "rgb(56,189,248)");
  document.getElementById("swap-text").textContent = s.swap_total
    ? "Файл подкачки: " + fmtBytes(s.swap_used) + " / " + fmtBytes(s.swap_total)
    : "Файл подкачки не используется";

  // Disks
  document.getElementById("disk-list").innerHTML = s.disks
    .map((d) => {
      const used = d.total - d.available;
      const pct = d.total ? Math.round((used / d.total) * 100) : 0;
      return (
        '<div class="disk-row"><span>' + (d.name || d.mount) + " (" + d.mount + ')</span>' +
        "<span>" + fmtBytes(used) + " / " + fmtBytes(d.total) + " · " + pct + "%</span></div>" +
        '<div class="bar"><div class="bar-fill" style="width:' + pct + '%"></div></div>'
      );
    })
    .join("");

  // Temperatures
  document.getElementById("temp-list").innerHTML = s.temps.length
    ? s.temps
        .map(
          (t) =>
            '<div class="kv-row"><span>' + t.label + "</span><span>" +
            t.value.toFixed(0) + " °C</span></div>"
        )
        .join("")
    : '<p class="muted">Датчики не ответили</p>';

  // System + GPU
  document.getElementById("uptime").textContent = "аптайм: " + fmtUptime(s.uptime);
  document.getElementById("sys-info").innerHTML =
    '<div class="kv-row"><span>ОС</span><span>' + (s.os_name || "—") + "</span></div>" +
    '<div class="kv-row"><span>Версия</span><span>' + (s.os_version || "—") + "</span></div>" +
    '<div class="kv-row"><span>Компьютер</span><span>' + (s.host_name || "—") + "</span></div>";
  document.getElementById("gpu-list").innerHTML = s.gpu_names.length
    ? s.gpu_names.map((g) => '<div class="kv-row"><span>' + g + "</span></div>").join("")
    : '<p class="muted">Не удалось определить</p>';
}

setInterval(tick, 1000);
tick();
