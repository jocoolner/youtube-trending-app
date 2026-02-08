const statusEl = document.getElementById("status");
const dateSelect = document.getElementById("dateSelect");
const refreshBtn = document.getElementById("refreshBtn");
const overviewKpisEl = document.getElementById("overviewKpis");

const searchInput = document.getElementById("searchInput");
const searchType = document.getElementById("searchType");
const searchScope = document.getElementById("searchScope");
const searchBtn = document.getElementById("searchBtn");
const searchStatus = document.getElementById("searchStatus");
const searchResults = document.getElementById("searchResults");

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg;
}

function setSearchStatus(msg) {
  if (searchStatus) searchStatus.textContent = msg;
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
  if (!el) return;

  const { extraLabel = null, extraField = null, limitNote = "", emptyNote = "No rows found." } = options;
  if (!rows || !rows.length) {
    el.innerHTML = `<div class="small" style="padding:10px;">${emptyNote}</div>`;
    return;
  }

  const headerExtra = extraLabel ? `<th>${extraLabel}</th>` : "";
  const body = rows.map((v) => videoRowHtml(v, extraLabel, extraField ? v[extraField] : null)).join("");

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
  if (!dates || !dates.length) {
    if (dateSelect) dateSelect.innerHTML = "";
    setStatus("No US dates found.");
    return [];
  }
  if (dateSelect) {
    dateSelect.innerHTML = dates.map((d) => `<option value="${d}">${d}</option>`).join("");
  }
  setStatus(`Loaded ${dates.length} dates.`);
  return dates;
}

async function loadAll(date) {
  setStatus(`Loading dashboard for ${date}...`);

  const [topViews, topLikes, topSticky, topReach, trending200] = await Promise.all([
    fetchJson(`/api/us/top?metric=views&date=${encodeURIComponent(date)}&limit=20`),
    fetchJson(`/api/us/top?metric=likes&date=${encodeURIComponent(date)}&limit=20`),
    fetchJson(`/api/us/top_advanced?metric=stickiness&date=${encodeURIComponent(date)}&limit=20`),
    fetchJson(`/api/us/top_advanced?metric=reach&date=${encodeURIComponent(date)}&limit=20`),
    fetchJson(`/api/us/trending?date=${encodeURIComponent(date)}&limit=200`),
  ]);

  renderTable("topViews", topViews.results, { limitNote: "Top 20 US trending videos that day ranked by views." });
  renderTable("topLikes", topLikes.results, { limitNote: "Top 20 US trending videos that day ranked by likes." });
  renderTable("topStickiness", topSticky.results, { extraLabel: "Days trended (US)", extraField: "days_trended_us" });
  renderTable("topReach", topReach.results, { extraLabel: "Countries", extraField: "countries_count" });
  renderTable("trending200", trending200.results, { limitNote: "Top 200 US trending list for the day ranked by views." });

  const viewLead = topViews.results?.[0];
  const likeLead = topLikes.results?.[0];
  const stickyLead = topSticky.results?.[0];
  const reachLead = topReach.results?.[0];
  renderKpis(overviewKpisEl, [
    { label: "Date", value: date },
    { label: "Trending rows", value: fmtNum(trending200.count || 0) },
    { label: "Top views", value: fmtNum(viewLead?.video_view_count) },
    { label: "Top likes", value: fmtNum(likeLead?.video_like_count) },
    { label: "Max stickiness", value: fmtNum(stickyLead?.days_trended_us) },
    { label: "Max reach", value: fmtNum(reachLead?.countries_count) },
  ]);

  setStatus(`Done. Showing ${date}.`);
}

function clearSearch() {
  if (searchResults) searchResults.innerHTML = "";
  setSearchStatus("");
}

function renderSearchVideos(data) {
  const rows = data.results || [];
  if (!rows.length) {
    searchResults.innerHTML = `<div class="small" style="padding:10px;">No results.</div>`;
    return;
  }

  const body = rows.map((r) => {
    const videoHref = `/video/${encodeURIComponent(r.video_id)}`;
    const channelHref = r.channel_id ? `/channel/${encodeURIComponent(r.channel_id)}` : "#";
    const dateLabel = data.scope === "day"
      ? (r.video_trending_date || "")
      : `${r.first_trending_us || ""} to ${r.last_trending_us || ""}`;

    const metricLabel = data.scope === "day"
      ? `Views: ${fmtNum(r.video_view_count)}`
      : `US days: ${fmtNum(r.days_trended_us)} | Reach: ${fmtNum(r.countries_count)}`;

    return `
      <tr>
        <td>
          <div class="rowlink">
            <img class="thumb" src="${r.video_default_thumbnail || ""}" alt="">
            <div>
              <div class="title"><a href="${videoHref}">${r.video_title || "(no title)"}</a></div>
              <div class="meta"><a href="${channelHref}">${r.channel_title || r.channel_id || ""}</a></div>
            </div>
          </div>
        </td>
        <td>${dateLabel}</td>
        <td>${metricLabel}</td>
      </tr>
    `;
  }).join("");

  searchResults.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Video</th>
          <th>${data.scope === "day" ? "Date" : "US trending range"}</th>
          <th>${data.scope === "day" ? "Daily stats" : "All-time stats"}</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

function renderSearchChannels(data) {
  const rows = data.results || [];
  if (!rows.length) {
    searchResults.innerHTML = `<div class="small" style="padding:10px;">No results.</div>`;
    return;
  }

  const body = rows.map((r) => {
    const href = `/channel/${encodeURIComponent(r.channel_id)}`;

    if (data.scope === "day") {
      return `
        <tr>
          <td><a href="${href}">${r.channel_title || r.channel_id}</a></td>
          <td>${fmtNum(r.distinct_videos)}</td>
          <td>Views: ${fmtNum(r.sum_views)} | Likes: ${fmtNum(r.sum_likes)} | Comments: ${fmtNum(r.sum_comments)}</td>
        </tr>
      `;
    }

    return `
      <tr>
        <td><a href="${href}">${r.channel_title || r.channel_id}</a></td>
        <td>${fmtNum(r.distinct_videos_alltime)}</td>
        <td>US range: ${r.first_trending_us || ""} to ${r.last_trending_us || ""}</td>
      </tr>
    `;
  }).join("");

  searchResults.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Channel</th>
          <th>${data.scope === "day" ? "Distinct videos (day)" : "Distinct videos (US all-time)"}</th>
          <th>${data.scope === "day" ? "Daily totals" : "US trending range"}</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

let searchTimer = null;

async function runSearch() {
  if (!searchInput || !searchResults) return;

  const q = (searchInput.value || "").trim();
  if (q.length < 2) {
    clearSearch();
    return;
  }

  const type = searchType?.value || "videos";
  const scope = searchScope?.value || "day";
  const date = dateSelect?.value || "";
  const endpoint = type === "channels" ? "/api/us/search/channels" : "/api/us/search/videos";
  const url = scope === "day"
    ? `${endpoint}?q=${encodeURIComponent(q)}&scope=day&date=${encodeURIComponent(date)}&limit=20`
    : `${endpoint}?q=${encodeURIComponent(q)}&scope=all&limit=20`;

  try {
    setSearchStatus(`Searching ${type} (${scope})...`);
    const data = await fetchJson(url);
    if (type === "channels") renderSearchChannels(data);
    else renderSearchVideos(data);
    setSearchStatus(`Found ${data.count} result(s).`);
  } catch (e) {
    console.error(e);
    setSearchStatus(`Error: ${e.message}`);
  }
}

function initSearch() {
  if (!searchInput || !searchBtn || !searchResults) return;
  searchBtn.addEventListener("click", runSearch);

  searchInput.addEventListener("input", () => {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 300);
  });

  if (searchScope) searchScope.addEventListener("change", runSearch);
  if (searchType) searchType.addEventListener("change", runSearch);
}

async function init() {
  try {
    const dates = await loadDates();
    if (!dates.length) return;

    const defaultDate = dates[0];
    if (dateSelect) dateSelect.value = defaultDate;
    await loadAll(defaultDate);

    if (refreshBtn) {
      refreshBtn.addEventListener("click", async () => {
        await loadAll(dateSelect.value);
        if (searchScope && searchScope.value === "day") runSearch();
      });
    }

    if (dateSelect) {
      dateSelect.addEventListener("change", async () => {
        await loadAll(dateSelect.value);
        if (searchScope && searchScope.value === "day") runSearch();
      });
    }

    initSearch();
  } catch (err) {
    console.error(err);
    setStatus(`Error: ${err.message}`);
  }
}

init();
