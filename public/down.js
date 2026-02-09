/**
 * down.js
 *
 * Page logic for the "Down Customers" view.
 *
 * Backend provides:
 *   GET /api/down-customers
 *   POST /api/suppressions/accounts/:id
 */

const el = (id) => document.getElementById(id);

// How often the page refreshes (in milliseconds)
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

function setApiState(state, message) {
  ui.apiDot.classList.remove("status__dot--ok", "status__dot--bad");
  if (state === "ok") ui.apiDot.classList.add("status__dot--ok");
  if (state === "bad") ui.apiDot.classList.add("status__dot--bad");
  ui.apiStatus.textContent = message;
}

function setLastUpdated(date = new Date()) {
  ui.lastUpdated.textContent = `Last updated: ${date.toLocaleString()}`;
}

function buildSonarCustomerUrl(customerId) {
  return `https://wi-fiber.sonar.software/app#/accounts/show/${encodeURIComponent(customerId)}`;
}

function normalize(s) {
  return String(s ?? "").toLowerCase();
}

function joinIps(ipAddresses) {
  if (!Array.isArray(ipAddresses)) return "";
  return ipAddresses.filter(Boolean).join(", ");
}

function renderTable(customers) {
  ui.rows.innerHTML = "";

  if (!customers.length) {
    ui.empty.hidden = false;
    ui.count.textContent = "0 customers";
    return;
  }

  ui.empty.hidden = true;
  ui.count.textContent = `${customers.length} customer${customers.length === 1 ? "" : "s"}`;

  const frag = document.createDocumentFragment();

  for (const c of customers) {
    const tr = document.createElement("tr");

    // Customer name (clickable)
    const nameTd = document.createElement("td");
    const a = document.createElement("a");
    a.className = "pc-link";
    a.href = buildSonarCustomerUrl(c.customerId);
    a.target = "_blank";
    a.rel = "noreferrer";
    a.textContent = c.customerName || "(unknown)";
    nameTd.appendChild(a);

    // Status
    const statusTd = document.createElement("td");
    statusTd.innerHTML = `<span class="badge badge--down">${c.status || "Down"}</span>`;

    // Device / notes
    const deviceTd = document.createElement("td");
    deviceTd.textContent = c.deviceName || "—";

    // IPs
    const ipTd = document.createElement("td");
    ipTd.textContent = joinIps(c.ipAddresses) || "—";

    // Address
    const addrTd = document.createElement("td");
    addrTd.textContent = c.address || "—";

    // Actions
    const actionsTd = document.createElement("td");
    actionsTd.className = "actions-col";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "suppress-btn";
    btn.dataset.id = String(c.customerId);
    btn.textContent = "Suppress";
    btn.title = "Suppress this account";

    actionsTd.appendChild(btn);

    tr.append(nameTd, statusTd, deviceTd, ipTd, addrTd, actionsTd);
    frag.appendChild(tr);
  }

  ui.rows.appendChild(frag);
}

async function fetchDownCustomers() {
  const res = await fetch("/api/down-customers", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

let lastCustomers = [];

function applyFilter() {
  const q = normalize(ui.filter.value);

  if (!q) {
    renderTable(lastCustomers);
    return;
  }

  const filtered = lastCustomers.filter((c) => {
    const blob = [
      c.customerName,
      c.status,
      c.deviceName,
      joinIps(c.ipAddresses),
      c.address,
    ]
      .map(normalize)
      .join(" | ");

    return blob.includes(q);
  });

  renderTable(filtered);
}

async function refresh() {
  try {
    const payload = await fetchDownCustomers();
    if (!payload.ok) throw new Error(payload.error || "API returned ok=false");

    lastCustomers = Array.isArray(payload.customers) ? payload.customers : [];
    setApiState("ok", payload.source === "cache" ? "API: Connected (cached)" : "API: Connected");
    setLastUpdated(new Date());
    applyFilter();
  } catch (err) {
    console.error(err);
    setApiState("bad", "API: Request failed");
    setLastUpdated(new Date());
    renderTable([]);
  }
}

async function init() {
  ui.filter.addEventListener("input", applyFilter);
  await refresh();
  setInterval(refresh, REFRESH_MS);
}

// Suppress button handler (event delegation)
document.addEventListener("click", async (e) => {
  const btn = e.target.closest(".suppress-btn");
  if (!btn) return;

  const id = btn.dataset.id;
  if (!id) return;

  btn.disabled = true;
  const oldText = btn.textContent;
  btn.textContent = "…";

  try {
    const res = await fetch(`/api/suppressions/accounts/${encodeURIComponent(id)}`, {
      method: "POST",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${text}`);
    }

    // Re-fetch so table + summary stay consistent
    await refresh();
  } catch (err) {
    console.error("Suppress failed:", err);
    btn.disabled = false;
    btn.textContent = oldText;
    alert("Failed to suppress. Check console/logs.");
  }
});

init();
