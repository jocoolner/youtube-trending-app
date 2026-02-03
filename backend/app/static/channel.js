// channel.js — Channel Detail page

const statusEl = document.getElementById("status");
const metaEl = document.getElementById("channelMeta");
const tableEl = document.getElementById("channelVideos");

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg;
}

function fmtNum(x) {
  if (x === null || x === undefined) return "";
  const n = Number(x);
  if (Number.isNaN(n)) return String(x);
  return n.toLocaleString();
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

      <div style="margin-top:10px; display:flex; gap:14px; flex-wrap:wrap;">
        <div class="small">Distinct videos (US all-time): <b>${fmtNum(c.distinct_videos_alltime)}</b></div>
        <div class="small">Days active (US): <b>${fmtNum(c.days_active)}</b></div>
        <div class="small">Appearances (US): <b>${fmtNum(c.appearances_alltime)}</b></div>
        <div class="small">Date range: <b>${c.first_date || ""}</b> → <b>${c.last_date || ""}</b></div>
      </div>

      <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;">
        <a class="btn" href="${ytChannelHref}" target="_blank" rel="noopener">Open channel on YouTube</a>
      </div>
    </div>
  `;
}

function renderVideos(rows) {
  if (!rows || rows.length === 0) {
    tableEl.innerHTML = `<div class="small" style="padding:10px;">No US trending videos found.</div>`;
    return;
  }

  const body = rows.map(v => `
    <tr>
      <td>
        <a class="rowlink" href="/video/${encodeURIComponent(v.video_id)}">
          <img class="thumb" src="${v.video_default_thumbnail || ""}" alt="">
          <div>
            <div class="title">${v.video_title || "(no title)"}</div>
            <div class="meta">US: ${fmtNum(v.days_trended_us)} days · ${v.first_trending_us || ""} → ${v.last_trending_us || ""}</div>
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
          <th>Max Views</th>
          <th>Max Likes</th>
          <th>Max Comments</th>
          <th>Global Reach</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  `;
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
