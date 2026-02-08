const statusEl = document.getElementById("status");
const metaEl = document.getElementById("channelMeta");
const tableEl = document.getElementById("channelVideos");
const videosSummaryEl = document.getElementById("channelVideosSummary");

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
  if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText} - ${await resp.text()}`);
  return resp.json();
}

function renderMeta(c) {
  const ytChannelHref = `https://www.youtube.com/channel/${encodeURIComponent(c.channel_id)}`;
  metaEl.innerHTML = `
    <div>
      <div class="title" style="font-size:18px;">${c.channel_title || c.channel_id}</div>
      <div class="meta" style="margin-top:6px;">Channel country: ${c.channel_country || "N/A"}</div>
      <div class="kpi-row" style="margin-top:10px;">
        <div class="kpi"><div class="label">Distinct videos (US)</div><div class="value">${fmtNum(c.distinct_videos_alltime)}</div></div>
        <div class="kpi"><div class="label">Days active (US)</div><div class="value">${fmtNum(c.days_active)}</div></div>
        <div class="kpi"><div class="label">Appearances (US)</div><div class="value">${fmtNum(c.appearances_alltime)}</div></div>
        <div class="kpi"><div class="label">Date range</div><div class="value">${c.first_date || ""} to ${c.last_date || ""}</div></div>
      </div>
      <div style="margin-top:12px;">
        <a class="btn" href="${ytChannelHref}" target="_blank" rel="noopener">Open channel on YouTube</a>
      </div>
    </div>
  `;
}

function renderVideos(rows) {
  if (!rows || rows.length === 0) {
    tableEl.innerHTML = `<div class="small" style="padding:10px;">No US trending videos found.</div>`;
    renderKpis(videosSummaryEl, []);
    return;
  }

  const body = rows.map((v) => `
    <tr>
      <td>
        <a class="rowlink" href="/video/${encodeURIComponent(v.video_id)}">
          <img class="thumb" src="${v.video_default_thumbnail || ""}" alt="">
          <div>
            <div class="title">${v.video_title || "(no title)"}</div>
            <div class="meta">US: ${fmtNum(v.days_trended_us)} days | ${v.first_trending_us || ""} to ${v.last_trending_us || ""}</div>
          </div>
        </a>
      </td>
      <td>${fmtNum(v.video_view_count)}</td>
      <td>${fmtNum(v.video_like_count)}</td>
      <td>${fmtNum(v.video_comment_count)}</td>
      <td>${fmtNum(v.countries_count)}</td>
    </tr>
  `).join("");

  tableEl.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Video</th>
          <th>Max views</th>
          <th>Max likes</th>
          <th>Max comments</th>
          <th>Global reach</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  `;

  const top = rows[0];
  renderKpis(videosSummaryEl, [
    { label: "Videos shown", value: fmtNum(rows.length) },
    { label: "Top US days trended", value: fmtNum(top.days_trended_us) },
    { label: "Top max views", value: fmtNum(top.video_view_count) },
  ]);
}

async function init() {
  const channelId = window.__CHANNEL_ID__;
  try {
    setStatus("Loading channel detail...");
    const data = await fetchJson(`/api/us/channel/${encodeURIComponent(channelId)}?limit=200`);
    renderMeta(data.channel);
    renderVideos(data.videos);
    setStatus("Done.");
  } catch (e) {
    console.error(e);
    setStatus(`Error: ${e.message}`);
    if (metaEl) metaEl.innerHTML = `<div class="small">Failed to load channel.</div>`;
  }
}

init();
