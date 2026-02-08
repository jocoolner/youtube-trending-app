const statusEl = document.getElementById("status");
const monthSelect = document.getElementById("monthSelect");
const metricSelect = document.getElementById("metricSelect");
const refreshBtn = document.getElementById("refreshBtn");
const tagTitleEl = document.getElementById("tagTitle");
const seriesSummaryEl = document.getElementById("seriesSummary");
const videosSummaryEl = document.getElementById("videosSummary");

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg;
}

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
  return `${(n * 100).toFixed(2)}%`;
}

function getTagFromPath() {
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

function renderKpis(items) {
  if (!videosSummaryEl) return;
  if (!items || !items.length) {
    videosSummaryEl.innerHTML = "";
    return;
  }
  videosSummaryEl.innerHTML = items.map((it) => `
    <div class="kpi">
      <div class="label">${it.label}</div>
      <div class="value">${it.value}</div>
    </div>
  `).join("");
}

function videoRowHtml(v) {
  const href = `/video/${encodeURIComponent(v.video_id)}`;
  const chHref = `/channel/${encodeURIComponent(v.channel_id)}`;
  return `
    <tr>
      <td>
        <div class="rowlink">
          <img class="thumb" src="${v.video_default_thumbnail || ""}" alt="">
          <div>
            <div class="title"><a href="${href}">${v.video_title || "(no title)"}</a></div>
            <div class="meta"><a href="${chHref}">${v.channel_title || v.channel_id || ""}</a></div>
          </div>
        </div>
      </td>
      <td>${fmtNum(v.max_views)}</td>
      <td>${fmtNum(v.max_likes)}</td>
      <td>${fmtNum(v.max_comments)}</td>
      <td>${fmtNum(v.days_trended_in_month)}</td>
      <td>${v.first_date || ""} to ${v.last_date || ""}</td>
    </tr>
  `;
}

function renderVideos(rows, metric) {
  const tableEl = document.getElementById("tagVideos");
  if (!tableEl) return;

  if (!rows || rows.length === 0) {
    tableEl.innerHTML = `<div class="small" style="padding:10px;">No videos found for this tag in the selected month.</div>`;
    renderKpis([]);
    return;
  }

  const body = rows.map(videoRowHtml).join("");
  tableEl.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Video</th>
          <th>Max views ${metric === "views" ? "(ranked)" : ""}</th>
          <th>Max likes ${metric === "likes" ? "(ranked)" : ""}</th>
          <th>Max comments</th>
          <th>Days trended (month)</th>
          <th>Date range</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  `;

  const top = rows[0];
  renderKpis([
    { label: "Videos shown", value: fmtNum(rows.length) },
    { label: "Top video days trended", value: fmtNum(top.days_trended_in_month) },
    { label: metric === "views" ? "Top max views" : "Top max likes", value: metric === "views" ? fmtNum(top.max_views) : fmtNum(top.max_likes) },
  ]);
}

function drawLineChart(canvasId, points, selectedMonth) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const cssWidth = canvas.clientWidth || 800;
  const cssHeight = canvas.getAttribute("height") ? Number(canvas.getAttribute("height")) : 220;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(cssWidth * dpr);
  canvas.height = Math.floor(cssHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  if (!points || points.length === 0) {
    ctx.fillStyle = "#9fb1cc";
    ctx.font = "12px Space Grotesk, Segoe UI, sans-serif";
    ctx.fillText("No series data found for this tag.", 10, 20);
    return;
  }

  const padL = 48;
  const padR = 18;
  const padT = 14;
  const padB = 34;
  const plotW = cssWidth - padL - padR;
  const plotH = cssHeight - padT - padB;

  const ys = points.map((p) => Number(p.video_share || 0));
  const yMax = Math.max(...ys, 0) * 1.1 || 0.01;
  const yMin = 0;
  const xFor = (i) => padL + (points.length === 1 ? plotW / 2 : (i * plotW) / (points.length - 1));
  const yFor = (y) => padT + (1 - (y - yMin) / (yMax - yMin)) * plotH;

  ctx.strokeStyle = "#2a3b58";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + plotH);
  ctx.lineTo(padL + plotW, padT + plotH);
  ctx.stroke();

  ctx.font = "12px Space Grotesk, Segoe UI, sans-serif";
  ctx.fillStyle = "#9fb1cc";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  const ticks = [0, yMax / 2, yMax];
  ticks.forEach((t) => {
    const y = yFor(t);
    ctx.beginPath();
    ctx.moveTo(padL - 4, y);
    ctx.lineTo(padL, y);
    ctx.stroke();
    ctx.fillText(`${(t * 100).toFixed(1)}%`, padL - 6, y);
  });

  ctx.strokeStyle = "#2ec4b6";
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((p, i) => {
    const x = xFor(i);
    const y = yFor(Number(p.video_share || 0));
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  const selIdx = points.findIndex((p) => p.month === selectedMonth);
  points.forEach((p, i) => {
    const x = xFor(i);
    const y = yFor(Number(p.video_share || 0));
    ctx.fillStyle = i === selIdx ? "#8ec5ff" : "#2ec4b6";
    ctx.beginPath();
    ctx.arc(x, y, i === selIdx ? 4 : 2.5, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = "#9fb1cc";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const step = Math.max(1, Math.floor(points.length / 6));
  points.forEach((p, i) => {
    if (i % step !== 0 && i !== points.length - 1) return;
    ctx.fillText((p.month || "").slice(0, 7), xFor(i), padT + plotH + 8);
  });
}

async function loadMonths() {
  const months = await fetchJson("/api/us/tags/months");
  if (!months || !months.length) {
    monthSelect.innerHTML = "";
    return [];
  }
  monthSelect.innerHTML = months.map((m) => `<option value="${m}">${m.slice(0, 7)}</option>`).join("");
  return months;
}

async function loadSeries(tag, selectedMonth) {
  const seriesResp = await fetchJson(`/api/us/tags/series?tag=${encodeURIComponent(tag)}`);
  const series = seriesResp.series || [];

  if (series.length) {
    const first = series[0];
    const last = series[series.length - 1];
    seriesSummaryEl.textContent = `Range: ${first.month.slice(0, 7)} to ${last.month.slice(0, 7)} | Latest share: ${fmtPctShare(last.video_share)} | Latest distinct videos: ${fmtNum(last.distinct_videos)}`;
  } else {
    seriesSummaryEl.textContent = "No time-series rows found for this tag.";
  }

  drawLineChart("shareChart", series, selectedMonth);
}

async function loadVideos(tag, month, metric) {
  const resp = await fetchJson(
    `/api/us/tags/videos?tag=${encodeURIComponent(tag)}&month=${encodeURIComponent(month)}&metric=${encodeURIComponent(metric)}&limit=20`
  );
  renderVideos(resp.results || [], metric);
}

async function loadAll(tag) {
  const month = monthSelect.value;
  const metric = metricSelect.value;
  if (!month) {
    setStatus("No monthly tag data available.");
    return;
  }
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
    if (!months.length) {
      setStatus("No monthly tag data available.");
      return;
    }
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
