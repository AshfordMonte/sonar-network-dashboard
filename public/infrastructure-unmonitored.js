/**
 * infrastructure-unmonitored.js
 *
 * Page logic for the "Unmonitored Infrastructure Equipment" view.
 *
 * Backend provides:
 *   GET  /api/infrastructure-unmonitored
 *   POST /api/suppressions/infrastructure-items/:id
 */

const el = (id) => document.getElementById(id);

const REFRESH_MS =
  typeof window.DASHBOARD_REFRESH_MS === "number"
    ? window.DASHBOARD_REFRESH_MS
    : 60_000;

const ui = {
  rows: el("rows"),
  empty: el("empty"),
  count: el("count"),
  filter: el("filter"),
  apiDot: el("api-dot"),
  apiStatus: el("api-status"),
  lastUpdated: el("last-updated"),
};

// Updates the footer API indicator for the current page state.
function setApiState(state, message) {
  ui.apiDot.classList.remove("status__dot--ok", "status__dot--bad");
  if (state === "ok") ui.apiDot.classList.add("status__dot--ok");
  if (state === "bad") ui.apiDot.classList.add("status__dot--bad");
  ui.apiStatus.textContent = message;
}

// Refreshes the footer timestamp after each data load.
function setLastUpdated(date = new Date()) {
  ui.lastUpdated.textContent = `Last updated: ${date.toLocaleString()}`;
}

// Builds the Sonar URL for a network site detail page.
function buildSonarSiteUrl(siteId) {
  return `https://wi-fiber.sonar.software/app#/network/sites/show/${encodeURIComponent(siteId)}`;
}

// Normalizes values for case-insensitive filtering.
function normalize(s) {
  return String(s ?? "").toLowerCase();
}

// Joins a device's IP list for display in one table cell.
function joinIps(ipAddresses) {
  if (!Array.isArray(ipAddresses)) return "";
  return ipAddresses.filter(Boolean).join(", ");
}

// Renders the visible unmonitored rows into the table.
function renderTable(rows) {
  ui.rows.innerHTML = "";

  if (!rows.length) {
    ui.empty.hidden = false;
    ui.count.textContent = "0 devices";
    return;
  }

  ui.empty.hidden = true;
  ui.count.textContent = `${rows.length} device${rows.length === 1 ? "" : "s"}`;

  const frag = document.createDocumentFragment();

  for (const row of rows) {
    const tr = document.createElement("tr");

    const deviceTd = document.createElement("td");
    deviceTd.textContent = row.deviceName || "(unknown)";

    const statusTd = document.createElement("td");
    statusTd.innerHTML = `<span class="badge badge--neutral">${row.status || "Unmonitored"}</span>`;

    const ipTd = document.createElement("td");
    ipTd.textContent = joinIps(row.ipAddresses) || "-";

    const siteTd = document.createElement("td");
    const siteLink = document.createElement("a");
    siteLink.className = "pc-link";
    siteLink.href = buildSonarSiteUrl(row.networkSiteId);
    siteLink.target = "_blank";
    siteLink.rel = "noreferrer";
    siteLink.textContent = row.networkSiteName || "(unknown)";
    siteTd.appendChild(siteLink);

    const actionsTd = document.createElement("td");
    actionsTd.className = "actions-col";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "suppress-btn";
    btn.dataset.id = String(row.inventoryItemId || "");
    btn.textContent = "Suppress";
    btn.title = "Suppress this infrastructure device";

    actionsTd.appendChild(btn);

    tr.append(deviceTd, statusTd, ipTd, siteTd, actionsTd);
    frag.appendChild(tr);
  }

  ui.rows.appendChild(frag);
}

// Fetches the visible unmonitored infrastructure rows from the backend.
async function fetchInfrastructureUnmonitoredRows() {
  const res = await fetch("/api/infrastructure-unmonitored", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

let lastRows = [];

// Applies the current text filter to the last fetched row set.
function applyFilter() {
  const q = normalize(ui.filter.value);

  if (!q) {
    renderTable(lastRows);
    return;
  }

  const filtered = lastRows.filter((row) => {
    const blob = [
      row.deviceName,
      row.status,
      joinIps(row.ipAddresses),
      row.networkSiteName,
    ]
      .map(normalize)
      .join(" | ");

    return blob.includes(q);
  });

  renderTable(filtered);
}

// Reloads the table data and updates the page status chrome.
async function refresh() {
  try {
    const payload = await fetchInfrastructureUnmonitoredRows();
    if (!payload.ok) throw new Error(payload.error || "API returned ok=false");

    lastRows = Array.isArray(payload.rows) ? payload.rows : [];
    setApiState(
      "ok",
      payload.source === "cache" ? "API: Connected (cached)" : "API: Connected",
    );
    setLastUpdated(new Date());
    applyFilter();
  } catch (err) {
    console.error(err);
    setApiState("bad", "API: Request failed");
    setLastUpdated(new Date());
    renderTable([]);
  }
}

// Wires up page events and starts the refresh loop.
async function init() {
  ui.filter.addEventListener("input", applyFilter);
  await refresh();
  setInterval(refresh, REFRESH_MS);
}

document.addEventListener("click", async (e) => {
  const btn = e.target.closest(".suppress-btn");
  if (!btn) return;

  const id = btn.dataset.id;
  if (!id) return;

  btn.disabled = true;
  const oldText = btn.textContent;
  btn.textContent = "...";

  try {
    const res = await fetch(
      `/api/suppressions/infrastructure-items/${encodeURIComponent(id)}`,
      {
        method: "POST",
      },
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${text}`);
    }

    await refresh();
  } catch (err) {
    console.error("Suppress failed:", err);
    btn.disabled = false;
    btn.textContent = oldText;
    alert("Failed to suppress. Check console/logs.");
  }
});

init();
