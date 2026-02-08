const statusEl = document.getElementById("status");
const dateSelect = document.getElementById("dateSelect");
const refreshBtn = document.getElementById("refreshBtn");
const dailyTableEl = document.getElementById("dailyTable");
const alltimeTableEl = document.getElementById("alltimeTable");
const dailySummaryEl = document.getElementById("dailySummary");
const alltimeSummaryEl = document.getElementById("alltimeSummary");
const overviewEl = document.getElementById("channelsOverview");

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

function renderDaily(rows, date) {
  if (!dailyTableEl) return;

  if (!rows || rows.length === 0) {
    dailyTableEl.innerHTML = `<div class="small" style="padding:10px;">No daily channel data.</div>`;
    renderKpis(dailySummaryEl, []);
    return;
  }

  const body = rows.map((r) => `
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
          <th>Total views (day)</th>
          <th>Total likes (day)</th>
          <th>Total comments (day)</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  `;

  const top = rows[0];
  renderKpis(dailySummaryEl, [
    { label: "Date", value: date || "-" },
    { label: "Channels shown", value: fmtNum(rows.length) },
    { label: "Top daily channel", value: top.channel_title || top.channel_id || "-" },
    { label: "Top distinct videos", value: fmtNum(top.distinct_videos) },
  ]);
}

function renderAlltime(rows) {
  if (!alltimeTableEl) return;

  if (!rows || rows.length === 0) {
    alltimeTableEl.innerHTML = `<div class="small" style="padding:10px;">No all-time channel data.</div>`;
    renderKpis(alltimeSummaryEl, []);
    return;
  }

  const body = rows.map((r) => `
    <tr>
      <td><a href="/channel/${encodeURIComponent(r.channel_id)}">${r.channel_title || r.channel_id}</a></td>
      <td>${fmtNum(r.distinct_videos_alltime)}</td>
      <td>${fmtNum(r.days_active)}</td>
      <td>${fmtNum(r.appearances_alltime)}</td>
      <td>${r.first_date || ""} to ${r.last_date || ""}</td>
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

  const top = rows[0];
  renderKpis(alltimeSummaryEl, [
    { label: "Channels shown", value: fmtNum(rows.length) },
    { label: "Top all-time channel", value: top.channel_title || top.channel_id || "-" },
    { label: "Top distinct videos", value: fmtNum(top.distinct_videos_alltime) },
    { label: "Top days active", value: fmtNum(top.days_active) },
  ]);
}

async function loadDates() {
  if (!dateSelect) return [];
  const dates = await fetchJson("/api/us/dates");
  if (!dates || !dates.length) {
    dateSelect.innerHTML = "";
    return [];
  }
  dateSelect.innerHTML = dates.map((d) => `<option value="${d}">${d}</option>`).join("");
  return dates;
}

async function loadAll(date) {
  if (!date) {
    setStatus("No date available.");
    return;
  }

  setStatus(`Loading leaderboards for ${date}...`);

  const [daily, alltime] = await Promise.all([
    fetchJson(`/api/us/channels/daily?date=${encodeURIComponent(date)}&limit=20`),
    fetchJson("/api/us/channels/alltime?limit=20"),
  ]);

  const dailyRows = daily.results || [];
  const allRows = alltime.results || [];
  renderDaily(dailyRows, date);
  renderAlltime(allRows);

  renderKpis(overviewEl, [
    { label: "Selected date", value: date },
    { label: "Daily channels", value: fmtNum(dailyRows.length) },
    { label: "All-time channels", value: fmtNum(allRows.length) },
  ]);

  setStatus("Done.");
}

async function init() {
  try {
    if (!dateSelect || !refreshBtn) {
      setStatus("Missing page elements.");
      return;
    }

    const dates = await loadDates();
    if (!dates.length) {
      setStatus("No US dates found.");
      return;
    }

    const defaultDate = dates[0];
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
