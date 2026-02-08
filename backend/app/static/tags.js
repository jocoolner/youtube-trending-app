const statusEl = document.getElementById("status");
const monthSelect = document.getElementById("monthSelect");
const refreshBtn = document.getElementById("refreshBtn");
const topSummaryEl = document.getElementById("topSummary");
const risingSummaryEl = document.getElementById("risingSummary");
const fallingSummaryEl = document.getElementById("fallingSummary");

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg;
}

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
  return `${(n * 100).toFixed(2)}%`;
}

async function fetchJson(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText} - ${await resp.text()}`);
  return resp.json();
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

function renderNoRows(targetId, message) {
  const el = document.getElementById(targetId);
  if (!el) return;
  el.innerHTML = `<div class="small" style="padding:10px;">${message}</div>`;
}

function tagLinkHtml(tag) {
  const month = monthSelect?.value || "";
  const href = `/tag/${encodeURIComponent(tag)}?month=${encodeURIComponent(month)}`;
  return `<a href="${href}">${tag}</a>`;
}

function renderTop(rows) {
  if (!rows || rows.length === 0) {
    renderNoRows("topTags", "No top-tag rows found for this month.");
    renderKpis(topSummaryEl, []);
    return;
  }

  const body = rows.map((r) => `
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

  const lead = rows[0];
  renderKpis(topSummaryEl, [
    { label: "Top tag", value: lead.tag || "-" },
    { label: "Top share", value: fmtPctShare(lead.video_share) },
    { label: "Top distinct videos", value: fmtNum(lead.distinct_videos) },
  ]);
}

function renderRising(rows) {
  if (!rows || rows.length === 0) {
    renderNoRows("risingTags", "No rising-tag rows found for this month.");
    renderKpis(risingSummaryEl, []);
    return;
  }

  const body = rows.map((r) => `
    <tr>
      <td class="mono">${tagLinkHtml(r.tag)}</td>
      <td>${fmtPctShare(r.share_prev)}</td>
      <td>${fmtPctShare(r.share_now)}</td>
      <td>${fmtPctShare(r.delta)}</td>
      <td>${r.lift === null ? "" : `${Number(r.lift).toFixed(2)}x`}</td>
    </tr>
  `).join("");

  document.getElementById("risingTags").innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Tag</th>
          <th>Prev share</th>
          <th>Now share</th>
          <th>Delta share</th>
          <th>Lift</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  `;

  const lead = rows[0];
  renderKpis(risingSummaryEl, [
    { label: "Fastest rising", value: lead.tag || "-" },
    { label: "Largest delta", value: fmtPctShare(lead.delta) },
    { label: "Lift", value: lead.lift === null ? "-" : `${Number(lead.lift).toFixed(2)}x` },
  ]);
}

function renderFalling(rows) {
  if (!rows || rows.length === 0) {
    renderNoRows("fallingTags", "No falling-tag rows found for this month.");
    renderKpis(fallingSummaryEl, []);
    return;
  }

  const body = rows.map((r) => `
    <tr>
      <td class="mono">${tagLinkHtml(r.tag)}</td>
      <td>${fmtPctShare(r.share_prev)}</td>
      <td>${fmtPctShare(r.share_now)}</td>
      <td>${fmtPctShare(r.delta)}</td>
      <td>${r.lift === null ? "" : `${Number(r.lift).toFixed(2)}x`}</td>
    </tr>
  `).join("");

  document.getElementById("fallingTags").innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Tag</th>
          <th>Prev share</th>
          <th>Now share</th>
          <th>Delta share</th>
          <th>Lift</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  `;

  const lead = rows[0];
  renderKpis(fallingSummaryEl, [
    { label: "Fastest falling", value: lead.tag || "-" },
    { label: "Largest delta", value: fmtPctShare(lead.delta) },
    { label: "Lift", value: lead.lift === null ? "-" : `${Number(lead.lift).toFixed(2)}x` },
  ]);
}

async function loadMonths() {
  setStatus("Loading months...");
  const months = await fetchJson("/api/us/tags/months");
  if (!months || !months.length) {
    monthSelect.innerHTML = "";
    setStatus("No monthly tag data available.");
    return [];
  }

  monthSelect.innerHTML = months.map((m) => `<option value="${m}">${m.slice(0, 7)}</option>`).join("");
  setStatus(`Loaded ${months.length} months.`);
  return months;
}

async function loadAll(month) {
  setStatus(`Loading tag analytics for ${month.slice(0, 7)}...`);

  const [top, rising, falling] = await Promise.all([
    fetchJson(`/api/us/tags/top?month=${encodeURIComponent(month)}&limit=50`),
    fetchJson(`/api/us/tags/rising?month=${encodeURIComponent(month)}&limit=50`),
    fetchJson(`/api/us/tags/falling?month=${encodeURIComponent(month)}&limit=50`),
  ]);

  renderTop(top.results || []);
  renderRising(rising.results || []);
  renderFalling(falling.results || []);
  setStatus("Done.");
}

async function init() {
  try {
    const months = await loadMonths();
    if (!months.length) return;

    const defaultMonth = months[0];
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
