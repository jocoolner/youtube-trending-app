const statusEl = document.getElementById("status");
const dateSelect = document.getElementById("dateSelect");
const refreshBtn = document.getElementById("refreshBtn");

function setStatus(msg) {
  statusEl.textContent = msg;
}

function fmtNum(x) {
  if (x === null || x === undefined) return "";
  const n = Number(x);
  if (Number.isNaN(n)) return String(x);
  return n.toLocaleString();
}

function videoRowHtml(v, extraLabel = null, extraValue = null) {
  const href = `/video/${encodeURIComponent(v.video_id)}`;
  return `
    <tr>
      <td>
        <a class="rowlink" href="${href}">
          <img class="thumb" src="${v.video_default_thumbnail || ""}" alt="">
          <div>
            <div class="title">${v.video_title || "(no title)"}</div>
            <div class="meta">${v.channel_title || ""}</div>
          </div>
        </a>
      </td>
      <td>${fmtNum(v.video_view_count)}</td>
      <td>${fmtNum(v.video_like_count)}</td>
      <td>${fmtNum(v.video_comment_count)}</td>
      ${extraLabel ? `<td>${fmtNum(extraValue)}</td>` : ""}
    </tr>
  `;
}

function renderTable(targetId, rows, options = {}) {
  const el = document.getElementById(targetId);
  const { extraLabel = null, extraField = null, limitNote = "" } = options;

  const headerExtra = extraLabel ? `<th>${extraLabel}</th>` : "";
  const body = rows.map(v => videoRowHtml(v, extraLabel, extraField ? v[extraField] : null)).join("");

  el.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Video</th>
          <th>Views</th>
          <th>Likes</th>
          <th>Comments</th>
          ${headerExtra}
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
    ${limitNote ? `<div class="small" style="padding:8px 10px;">${limitNote}</div>` : ""}
  `;
}

async function fetchJson(url) {
  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`${resp.status} ${resp.statusText} - ${text}`);
  }
  return resp.json();
}

async function loadDates() {
  setStatus("Loading dates...");
  const dates = await fetchJson("/api/us/dates");
  dateSelect.innerHTML = dates.map(d => `<option value="${d}">${d}</option>`).join("");
  setStatus(`Loaded ${dates.length} dates.`);
  return dates;
}

async function loadAll(date) {
  setStatus(`Loading dashboards for ${date}...`);

  const [topViews, topLikes, topSticky, topReach, trending200] = await Promise.all([
    fetchJson(`/api/us/top?metric=views&date=${date}&limit=20`),
    fetchJson(`/api/us/top?metric=likes&date=${date}&limit=20`),
    fetchJson(`/api/us/top_advanced?metric=stickiness&date=${date}&limit=20`),
    fetchJson(`/api/us/top_advanced?metric=reach&date=${date}&limit=20`),
    fetchJson(`/api/us/trending?date=${date}&limit=200`)
  ]);

  renderTable("topViews", topViews.results, { limitNote: "Top 20 videos trending in the US that day, ranked by views." });
  renderTable("topLikes", topLikes.results, { limitNote: "Top 20 videos trending in the US that day, ranked by likes." });
  renderTable("topStickiness", topSticky.results, { extraLabel: "Days trended (US)", extraField: "days_trended_us" });
  renderTable("topReach", topReach.results, { extraLabel: "Countries", extraField: "countries_count" });
  renderTable("trending200", trending200.results, { limitNote: "Top 200 daily US trending list, ranked by views." });

  setStatus(`Done. Showing ${date}.`);
}

async function init() {
  try {
    const dates = await loadDates();
    const defaultDate = dates[0]; // v_us_dates is DESC -> first is latest
    dateSelect.value = defaultDate;

    await loadAll(defaultDate);

    refreshBtn.addEventListener("click", async () => {
      await loadAll(dateSelect.value);
    });

    dateSelect.addEventListener("change", async () => {
      await loadAll(dateSelect.value);
    });

  } catch (err) {
    console.error(err);
    setStatus(`Error: ${err.message}`);
  }
}

init();
