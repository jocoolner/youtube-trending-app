const statusEl = document.getElementById("status");
const dateSelect = document.getElementById("dateSelect");
const refreshBtn = document.getElementById("refreshBtn");

function setStatus(msg){ statusEl.textContent = msg; }

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

function renderDaily(rows) {
  const body = rows.map(r => `
    <tr>
      <td>${r.channel_title || r.channel_id}</td>
      <td>${fmtNum(r.distinct_videos)}</td>
      <td>${fmtNum(r.sum_views)}</td>
      <td>${fmtNum(r.sum_likes)}</td>
      <td>${fmtNum(r.sum_comments)}</td>
    </tr>
  `).join("");

  document.getElementById("dailyTable").innerHTML = `
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
  const body = rows.map(r => `
    <tr>
      <td>${r.channel_title || r.channel_id}</td>
      <td>${fmtNum(r.distinct_videos_alltime)}</td>
      <td>${fmtNum(r.days_active)}</td>
      <td>${fmtNum(r.appearances_alltime)}</td>
      <td>${r.first_date || ""} → ${r.last_date || ""}</td>
    </tr>
  `).join("");

  document.getElementById("alltimeTable").innerHTML = `
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
  const dates = await fetchJson("/api/us/dates");
  dateSelect.innerHTML = dates.map(d => `<option value="${d}">${d}</option>`).join("");
  return dates;
}

async function loadAll(date) {
  setStatus(`Loading leaderboards for ${date}...`);
  const [daily, alltime] = await Promise.all([
    fetchJson(`/api/us/channels/daily?date=${date}&limit=20`),
    fetchJson(`/api/us/channels/alltime?limit=20`)
  ]);

  renderDaily(daily.results);
  renderAlltime(alltime.results);
  setStatus("Done.");
}

async function init() {
  try {
    const dates = await loadDates();
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
