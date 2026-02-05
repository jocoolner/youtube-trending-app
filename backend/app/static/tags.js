const statusEl = document.getElementById("status");
const monthSelect = document.getElementById("monthSelect");
const refreshBtn = document.getElementById("refreshBtn");

function setStatus(msg) { statusEl.textContent = msg; }

function fmtNum(x) {
  if (x === null || x === undefined) return "";
  const n = Number(x);
  if (Number.isNaN(n)) return String(x);
  return n.toLocaleString();
}

function fmtPctShare(x) {
  if (x === null || x === undefined) return "";
  const n = Number(x);
  if (Number.isNaN(n)) return String(x);
  return (n * 100).toFixed(2) + "%";
}

async function fetchJson(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText} - ${await resp.text()}`);
  return resp.json();
}

function tagLinkHtml(tag) {
  const month = monthSelect?.value || "";
  const href = `/tag/${encodeURIComponent(tag)}?month=${encodeURIComponent(month)}`;
  return `<a href="${href}">${tag}</a>`;
}

function renderTop(rows) {
  const body = rows.map(r => `
    <tr>
      <td class="mono">${tagLinkHtml(r.tag)}</td>
      <td>${fmtNum(r.distinct_videos)}</td>
      <td>${fmtNum(r.total_videos)}</td>
      <td>${fmtPctShare(r.video_share)}</td>
    </tr>
  `).join("");

  document.getElementById("topTags").innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Tag</th>
          <th>Distinct videos</th>
          <th>Total videos (month)</th>
          <th>Share</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

function renderRising(rows) {
  const body = rows.map(r => `
    <tr>
      <td class="mono">${tagLinkHtml(r.tag)}</td>
      <td>${fmtPctShare(r.share_prev)}</td>
      <td>${fmtPctShare(r.share_now)}</td>
      <td>${fmtPctShare(r.delta)}</td>
      <td>${r.lift === null ? "" : Number(r.lift).toFixed(2) + "x"}</td>
    </tr>
  `).join("");

  document.getElementById("risingTags").innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Tag</th>
          <th>Prev share</th>
          <th>Now share</th>
          <th>Δ share</th>
          <th>Lift</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

async function loadMonths() {
  setStatus("Loading months...");
  const months = await fetchJson("/api/us/tags/months");
  monthSelect.innerHTML = months.map(m => `<option value="${m}">${m.slice(0, 7)}</option>`).join("");
  setStatus(`Loaded ${months.length} months.`);
  return months;
}

async function loadAll(month) {
  setStatus(`Loading tag analytics for ${month.slice(0, 7)}...`);

  const [top, rising] = await Promise.all([
    fetchJson(`/api/us/tags/top?month=${encodeURIComponent(month)}&limit=50`),
    fetchJson(`/api/us/tags/rising?month=${encodeURIComponent(month)}&limit=50`)
  ]);

  renderTop(top.results);
  renderRising(rising.results);

  setStatus("Done.");
}

async function init() {
  try {
    const months = await loadMonths();
    const defaultMonth = months[0]; // DESC -> first is latest
    monthSelect.value = defaultMonth;

    await loadAll(defaultMonth);

    refreshBtn.addEventListener("click", async () => loadAll(monthSelect.value));
    monthSelect.addEventListener("change", async () => loadAll(monthSelect.value));
  } catch (e) {
    console.error(e);
    setStatus(`Error: ${e.message}`);
  }
}

init();
