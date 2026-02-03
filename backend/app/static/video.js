const statusEl = document.getElementById("status");
const metaEl = document.getElementById("videoMeta");
const historyEl = document.getElementById("videoHistory");
const spreadEl = document.getElementById("videoSpread");

function setStatus(msg) {
  statusEl.textContent = msg;
}

function fmtNum(x) {
  if (x === null || x === undefined) return "";
  const n = Number(x);
  if (Number.isNaN(n)) return String(x);
  return n.toLocaleString();
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
    <div style="display:flex; gap:14px; align-items:flex-start;">
      <img class="thumb" style="width:160px;height:90px;border-radius:12px;"
           src="${v.video_default_thumbnail || ""}" alt="">
      <div style="flex:1;">
        <div class="title" style="font-size:18px;">${v.video_title || "(no title)"}</div>

        <div class="meta" style="margin-top:6px;">
          Channel: <b>${v.channel_title || ""}</b>
        </div>

        <div class="meta">
          Category ID: ${v.video_category_id ?? ""} · Duration: ${v.video_duration ?? ""} · Definition: ${v.video_definition ?? ""}
        </div>

        <div style="margin-top:10px; display:flex; gap:14px; flex-wrap:wrap;">
          <div class="small">Global reach: <b>${fmtNum(v.countries_count)}</b> countries</div>
          <div class="small">US stickiness: <b>${fmtNum(v.days_trended_us)}</b> days</div>
          <div class="small">US first/last: <b>${v.first_trending_us || ""}</b> → <b>${v.last_trending_us || ""}</b></div>
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
  if (!rows.length) {
    historyEl.innerHTML = `<div class="small" style="padding:10px;">No US history found for this video.</div>`;
    return;
  }

  const body = rows.map(r => `
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
}

function renderSpread(rows) {
  if (!rows.length) {
    spreadEl.innerHTML = `<div class="small" style="padding:10px;">No country spread data.</div>`;
    return;
  }

  const body = rows.map(r => `
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
      Countries where this video appeared on the trending list the most days.
    </div>
  `;
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
    metaEl.innerHTML = `<div class="small">Failed to load video details.</div>`;
  }
}

init();
