const statusEl = document.getElementById("status");
const monthSelect = document.getElementById("monthSelect");
const metricSelect = document.getElementById("metricSelect");
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

function renderVideos(rows, metric) {
  const body = rows.map(r => `
    <tr>
      <td>
        <a class="rowlink" href="/video/${encodeURIComponent(r.video_id)}">
          <img class="thumb" src="${r.video_default_thumbnail || ""}" alt="">
          <div>
            <div class="title">${r.video_title || "(no title)"}</div>
            <div class="meta">
              <a href="/channel/${encodeURIComponent(r.channel_id)}">${r.channel_title || r.channel_id}</a>
              • ${r.days_trended_in_month} days
              • ${r.first_date} → ${r.last_date}
            </div>
          </div>
        </a>
      </td>
      <td>${fmtNum(r.max_views)}</td>
      <td>${fmtNum(r.max_likes)}</td>
      <td>${fmtNum(r.max_comments)}</td>
    </tr>
  `).join("");

  document.getElementById("videosTable").innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Video</th>
          <th>Max views (month)</th>
          <th>Max likes (month)</th>
          <th>Max comments (month)</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
    <div class="small" style="padding:8px 10px;">
      Sorted by <b>${metric}</b> (aggregated per video within the month).
    </div>
  `;
}

async function loadMonths() {
  const months = await fetchJson("/api/us/tags/months");
  monthSelect.innerHTML = months.map(m => `<option value="${m}">${m.slice(0,7)}</option>`).join("");
  return months;
}

async function loadVideos(month, metric) {
  const tag = window.TAG;
  setStatus(`Loading videos for "${tag}" (${month.slice(0,7)})...`);

  const data = await fetchJson(
    `/api/us/tags/videos?tag=${encodeURIComponent(tag)}&month=${encodeURIComponent(month)}&metric=${encodeURIComponent(metric)}&limit=20`
  );

  renderVideos(data.results, metric);
  setStatus(`Done. Found ${data.count} videos.`);
}

async function init() {
  try {
    const months = await loadMonths();
    const url = new URL(window.location.href);
    const urlMonth = url.searchParams.get("month");
    const defaultMonth = urlMonth && months.includes(urlMonth) ? urlMonth : months[0];

    monthSelect.value = defaultMonth;
    metricSelect.value = "views";

    await loadVideos(defaultMonth, metricSelect.value);

    refreshBtn.addEventListener("click", async () => {
      await loadVideos(monthSelect.value, metricSelect.value);
    });

    monthSelect.addEventListener("change", async () => {
      await loadVideos(monthSelect.value, metricSelect.value);
    });

    metricSelect.addEventListener("change", async () => {
      await loadVideos(monthSelect.value, metricSelect.value);
    });
  } catch (e) {
    console.error(e);
    setStatus(`Error: ${e.message}`);
  }
}

init();
