// channels.js — Channel Leaderboard page (US)

const statusEl = document.getElementById("status");
const dateSelect = document.getElementById("dateSelect");
const refreshBtn = document.getElementById("refreshBtn");
const dailyTableEl = document.getElementById("dailyTable");
const alltimeTableEl = document.getElementById("alltimeTable");

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
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`${resp.status} ${resp.statusText} - ${text}`);
  }
  return resp.json();
}

function renderDaily(rows) {
  if (!dailyTableEl) return;

  if (!rows || rows.length === 0) {
    dailyTableEl.innerHTML = `<div class="small" style="padding:10px;">No daily channel data.</div>`;
    return;
  }

  const body = rows.map(r => `
    <tr>
      <td><a href="/channel/${encodeURIComponent(r.channel_id)}">${r.channel_title || r.channel_id}</a></td>
      <td>${fmtNum(r.distinct_videos)}</td>
      <td>${fmtNum(r.sum_views)}</td>
      <td>${fmtNum(r.sum_likes)}</td>
      <td>${fmtNum(r.sum_comments)}</td>
    </tr>
  `).join("");

  dailyTableEl.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Channel</th>
          <th>Distinct videos</th>
          <th>Total views (that day)</th>
          <th>Total likes (that day)</th>
          <th>Total comments (that day)</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

function renderAlltime(rows) {
  if (!alltimeTableEl) return;

  if (!rows || rows.length === 0) {
    alltimeTableEl.innerHTML = `<div class="small" style="padding:10px;">No all-time channel data.</div>`;
    return;
  }

  const body = rows.map(r => `
    <tr>
      <td><a href="/channel/${encodeURIComponent(r.channel_id)}">${r.channel_title || r.channel_id}</a></td>
      <td>${fmtNum(r.distinct_videos_alltime)}</td>
      <td>${fmtNum(r.days_active)}</td>
      <td>${fmtNum(r.appearances_alltime)}</td>
      <td>${r.first_date || ""} → ${r.last_date || ""}</td>
    </tr>
  `).join("");

  alltimeTableEl.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Channel</th>
          <th>Distinct videos (all-time)</th>
          <th>Days active</th>
          <th>Trending appearances</th>
          <th>Date range</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

async function loadDates() {
  if (!dateSelect) return [];
  const dates = await fetchJson("/api/us/dates");
  dateSelect.innerHTML = (dates || []).map(d => `<option value="${d}">${d}</option>`).join("");
  return dates || [];
}

async function loadAll(date) {
  if (!date) {
    setStatus("No date available.");
    return;
  }

  const dateParam = encodeURIComponent(date);
  setStatus(`Loading leaderboards for ${date}...`);

  const [daily, alltime] = await Promise.all([
    fetchJson(`/api/us/channels/daily?date=${dateParam}&limit=20`),
    fetchJson(`/api/us/channels/alltime?limit=20`)
  ]);

  renderDaily(daily.results);
  renderAlltime(alltime.results);
  setStatus("Done.");
}

async function init() {
  try {
    if (!dateSelect || !refreshBtn) {
      setStatus("Missing page elements. Check channels.html.");
      return;
    }

    const dates = await loadDates();
    if (!dates.length) {
      setStatus("No US dates found.");
      return;
    }

    const defaultDate = dates[0]; // v_us_dates is DESC => latest
    dateSelect.value = defaultDate;
    await loadAll(defaultDate);

    refreshBtn.addEventListener("click", async () => loadAll(dateSelect.value));
    dateSelect.addEventListener("change", async () => loadAll(dateSelect.value));

  } catch (e) {
    console.error(e);
    setStatus(`Error: ${e.message}`);
  }
}

init();
