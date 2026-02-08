const statusEl = document.getElementById("status");
const metaEl = document.getElementById("videoMeta");
const historyEl = document.getElementById("videoHistory");
const spreadEl = document.getElementById("videoSpread");
const historySummaryEl = document.getElementById("videoHistorySummary");
const spreadSummaryEl = document.getElementById("videoSpreadSummary");

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg;
}

function fmtNum(x) {
  if (x === null || x === undefined) return "";
  const n = Number(x);
  if (Number.isNaN(n)) return String(x);
  return n.toLocaleString();
}

function renderKpis(targetEl, items) {
  if (!targetEl) return;
  if (!items || !items.length) {
    targetEl.innerHTML = "";
    return;
  }
  targetEl.innerHTML = items.map((it) => `
    <div class="kpi">
      <div class="label">${it.label}</div>
      <div class="value">${it.value}</div>
    </div>
  `).join("");
}

async function fetchJson(url) {
  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`${resp.status} ${resp.statusText} - ${text}`);
  }
  return resp.json();
}

function renderMeta(v) {
  const channelHref = `/channel/${encodeURIComponent(v.channel_id)}`;
  const ytVideoHref = `https://www.youtube.com/watch?v=${encodeURIComponent(v.video_id)}`;
  const ytChannelHref = `https://www.youtube.com/channel/${encodeURIComponent(v.channel_id)}`;

  metaEl.innerHTML = `
    <div style="display:flex; gap:14px; align-items:flex-start; flex-wrap:wrap;">
      <img class="thumb" style="width:160px;height:90px;border-radius:12px;" src="${v.video_default_thumbnail || ""}" alt="">
      <div style="flex:1; min-width:280px;">
        <div class="title" style="font-size:18px;">${v.video_title || "(no title)"}</div>
        <div class="meta" style="margin-top:6px;">Channel: <b>${v.channel_title || ""}</b></div>
        <div class="meta">Category: ${v.video_category_id ?? ""} | Duration: ${v.video_duration ?? ""} | Definition: ${v.video_definition ?? ""}</div>

        <div class="kpi-row" style="margin-top:10px;">
          <div class="kpi"><div class="label">Global reach</div><div class="value">${fmtNum(v.countries_count)} countries</div></div>
          <div class="kpi"><div class="label">US stickiness</div><div class="value">${fmtNum(v.days_trended_us)} days</div></div>
          <div class="kpi"><div class="label">US first to last</div><div class="value">${v.first_trending_us || ""} to ${v.last_trending_us || ""}</div></div>
        </div>

        <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;">
          <a class="btn" href="${channelHref}">More from this channel</a>
          <a class="btn" href="${ytVideoHref}" target="_blank" rel="noopener">Open video on YouTube</a>
          <a class="btn" href="${ytChannelHref}" target="_blank" rel="noopener">Open channel on YouTube</a>
        </div>
      </div>
    </div>
  `;
}

function renderHistory(rows) {
  if (!rows || !rows.length) {
    historyEl.innerHTML = `<div class="small" style="padding:10px;">No US history found for this video.</div>`;
    renderKpis(historySummaryEl, []);
    return;
  }

  const body = rows.map((r) => `
    <tr>
      <td>${r.date}</td>
      <td>${fmtNum(r.video_view_count)}</td>
      <td>${fmtNum(r.video_like_count)}</td>
      <td>${fmtNum(r.video_comment_count)}</td>
    </tr>
  `).join("");

  historyEl.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Views</th>
          <th>Likes</th>
          <th>Comments</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  `;

  const first = rows[0];
  const last = rows[rows.length - 1];
  renderKpis(historySummaryEl, [
    { label: "US trending days", value: fmtNum(rows.length) },
    { label: "US range", value: `${first.date || ""} to ${last.date || ""}` },
    { label: "Latest views", value: fmtNum(last.video_view_count) },
  ]);
}

function renderSpread(rows) {
  if (!rows || !rows.length) {
    spreadEl.innerHTML = `<div class="small" style="padding:10px;">No country spread data.</div>`;
    renderKpis(spreadSummaryEl, []);
    return;
  }

  const body = rows.map((r) => `
    <tr>
      <td>${r.country}</td>
      <td>${fmtNum(r.days)}</td>
    </tr>
  `).join("");

  spreadEl.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Country</th>
          <th>Days trended</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
    <div class="small" style="padding:8px 10px;">
      Countries where this video appeared on trending the most days.
    </div>
  `;

  const top = rows[0];
  renderKpis(spreadSummaryEl, [
    { label: "Countries shown", value: fmtNum(rows.length) },
    { label: "Top country", value: top.country || "-" },
    { label: "Top country days", value: fmtNum(top.days) },
  ]);
}

async function init() {
  const videoId = window.__VIDEO_ID__;
  try {
    setStatus("Loading video details...");
    const data = await fetchJson(`/api/video/${encodeURIComponent(videoId)}?country=United%20States`);
    renderMeta(data.video);
    renderHistory(data.history);
    renderSpread(data.country_spread_top20);
    setStatus("Done.");
  } catch (err) {
    console.error(err);
    setStatus(`Error: ${err.message}`);
    if (metaEl) metaEl.innerHTML = `<div class="small">Failed to load video details.</div>`;
  }
}

init();
