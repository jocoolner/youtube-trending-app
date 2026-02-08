// backend/app/static/tag.js
const statusEl = document.getElementById("status");
const monthSelect = document.getElementById("monthSelect");
const metricSelect = document.getElementById("metricSelect");
const refreshBtn = document.getElementById("refreshBtn");
const tagTitleEl = document.getElementById("tagTitle");
const seriesSummaryEl = document.getElementById("seriesSummary");

function setStatus(msg) { statusEl.textContent = msg; }

function fmtNum(x) {
  if (x === null || x === undefined) return "";
  const n = Number(x);
  if (Number.isNaN(n)) return String(x);
  return n.toLocaleString();
}

function fmtPctShare(x) {
  if (x === null || x === undefined) return "";
  const n = Number(x);
  if (Number.isNaN(n)) return String(x);
  return (n * 100).toFixed(2) + "%";
}

function getTagFromPath() {
  // /tag/<TAG>
  const parts = window.location.pathname.split("/tag/");
  const raw = parts.length > 1 ? parts[1] : "";
  return decodeURIComponent(raw.replace(/\/$/, ""));
}

function getQueryParam(name) {
  const u = new URL(window.location.href);
  return u.searchParams.get(name);
}

function setQueryParam(name, value) {
  const u = new URL(window.location.href);
  if (value === null || value === undefined || value === "") u.searchParams.delete(name);
  else u.searchParams.set(name, value);
  window.history.replaceState({}, "", u.toString());
}

async function fetchJson(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText} - ${await resp.text()}`);
  return resp.json();
}

function videoRowHtml(v) {
  const href = `/video/${encodeURIComponent(v.video_id)}`;
  const chHref = `/channel/${encodeURIComponent(v.channel_id)}`;
  return `
    <tr>
      <td>
        <a class="rowlink" href="${href}">
          <img class="thumb" src="${v.video_default_thumbnail || ""}" alt="">
          <div>
            <div class="title">${v.video_title || "(no title)"}</div>
            <div class="meta"><a href="${chHref}">${v.channel_title || v.channel_id || ""}</a></div>
          </div>
        </a>
      </td>
      <td>${fmtNum(v.max_views)}</td>
      <td>${fmtNum(v.max_likes)}</td>
      <td>${fmtNum(v.max_comments)}</td>
      <td>${fmtNum(v.days_trended_in_month)}</td>
      <td>${v.first_date || ""} → ${v.last_date || ""}</td>
    </tr>
  `;
}

function renderVideos(rows) {
  const body = rows.map(videoRowHtml).join("");
  document.getElementById("tagVideos").innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Video</th>
          <th>Max views</th>
          <th>Max likes</th>
          <th>Max comments</th>
          <th>Days trended (month)</th>
          <th>Date range</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

function drawLineChart(canvasId, points, selectedMonth) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext("2d");

  // Make canvas crisp on HiDPI
  const cssWidth = canvas.clientWidth || 800;
  const cssHeight = canvas.getAttribute("height") ? Number(canvas.getAttribute("height")) : 220;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(cssWidth * dpr);
  canvas.height = Math.floor(cssHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Clear
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  if (!points || points.length === 0) {
    ctx.fillText("No series data found for this tag.", 10, 20);
    return;
  }

  const padL = 48, padR = 18, padT = 14, padB = 34;
  const W = cssWidth, H = cssHeight;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const ys = points.map(p => Number(p.video_share || 0));
  const yMax = Math.max(...ys, 0) * 1.1 || 0.01;
  const yMin = 0;

  const xFor = (i) => padL + (points.length === 1 ? plotW / 2 : (i * plotW) / (points.length - 1));
  const yFor = (y) => padT + (1 - (y - yMin) / (yMax - yMin)) * plotH;

  // Axes
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + plotH);
  ctx.lineTo(padL + plotW, padT + plotH);
  ctx.stroke();

  // Y ticks (0, mid, max)
  ctx.font = "12px system-ui, -apple-system, Segoe UI, Arial";
  ctx.fillStyle = "#000";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  const ticks = [0, yMax / 2, yMax];
  ticks.forEach(t => {
    const y = yFor(t);
    ctx.beginPath();
    ctx.moveTo(padL - 4, y);
    ctx.lineTo(padL, y);
    ctx.stroke();
    ctx.fillText((t * 100).toFixed(1) + "%", padL - 6, y);
  });

  // Line
  ctx.beginPath();
  points.forEach((p, i) => {
    const x = xFor(i);
    const y = yFor(Number(p.video_share || 0));
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Points + selected marker
  const selIdx = points.findIndex(p => p.month === selectedMonth);
  points.forEach((p, i) => {
    const x = xFor(i);
    const y = yFor(Number(p.video_share || 0));
    ctx.beginPath();
    ctx.arc(x, y, i === selIdx ? 4 : 2.5, 0, Math.PI * 2);
    ctx.fill();
  });

  // X labels (every ~3 points)
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const step = Math.max(1, Math.floor(points.length / 6));
  points.forEach((p, i) => {
    if (i % step !== 0 && i !== points.length - 1) return;
    const label = (p.month || "").slice(0, 7);
    ctx.fillText(label, xFor(i), padT + plotH + 8);
  });
}

async function loadMonths() {
  const months = await fetchJson("/api/us/tags/months");
  monthSelect.innerHTML = months.map(m => `<option value="${m}">${m.slice(0, 7)}</option>`).join("");
  return months;
}

async function loadSeries(tag, selectedMonth) {
  const seriesResp = await fetchJson(`/api/us/tags/series?tag=${encodeURIComponent(tag)}`);
  const series = seriesResp.series || [];

  // Summary
  if (series.length) {
    const first = series[0];
    const last = series[series.length - 1];
    seriesSummaryEl.textContent =
      `Range: ${first.month.slice(0,7)} → ${last.month.slice(0,7)} | Latest share: ${fmtPctShare(last.video_share)} | Latest distinct videos: ${fmtNum(last.distinct_videos)}`;
  } else {
    seriesSummaryEl.textContent = "No time-series rows found for this tag.";
  }

  drawLineChart("shareChart", series, selectedMonth);
}

async function loadVideos(tag, month, metric) {
  const resp = await fetchJson(
    `/api/us/tags/videos?tag=${encodeURIComponent(tag)}&month=${encodeURIComponent(month)}&metric=${encodeURIComponent(metric)}&limit=20`
  );
  renderVideos(resp.results || []);
}

async function loadAll(tag) {
  const month = monthSelect.value;
  const metric = metricSelect.value;

  setQueryParam("month", month);

  setStatus(`Loading ${tag} for ${month.slice(0, 7)}...`);

  await Promise.all([
    loadSeries(tag, month),
    loadVideos(tag, month, metric),
  ]);

  setStatus("Done.");
}

async function init() {
  try {
    const tag = getTagFromPath();
    tagTitleEl.textContent = `Tag: ${tag} (US)`;

    const months = await loadMonths();
    const qsMonth = getQueryParam("month");
    monthSelect.value = (qsMonth && months.includes(qsMonth)) ? qsMonth : months[0];

    await loadAll(tag);

    refreshBtn.addEventListener("click", () => loadAll(tag));
    monthSelect.addEventListener("change", () => loadAll(tag));
    metricSelect.addEventListener("change", () => loadAll(tag));
  } catch (e) {
    console.error(e);
    setStatus(`Error: ${e.message}`);
  }
}

init();
