/**
 * down.js
 *
 * Page logic for the "Down Customers" view.
 *
 * Backend (later) should provide:
 *   GET /api/down-customers
 *
 * Expected response shape (suggested):
 * {
 *   ok: true,
 *   customers: [
 *     {
 *       customerId: 123,
 *       customerName: "Jane Doe",
 *       status: "Down",
 *       deviceName: "Customer Router (or CPE name)",
 *       ipAddresses: ["10.1.2.3", "10.1.2.4"],
 *       address: "123 Main St, City, ST ZIP"
 *     }
 *   ]
 * }
 */

const el = (id) => document.getElementById(id);

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
  // Your provided pattern:
  // https://wi-fiber.sonar.software/app#/accounts/show/X
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

    tr.append(nameTd, statusTd, deviceTd, ipTd, addrTd);
    frag.appendChild(tr);
  }

  ui.rows.appendChild(frag);
}

async function fetchDownCustomers() {
  const res = await fetch("/api/down-customers", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

/**
 * Temporary mock data so the page looks right today.
 * Once you add /api/down-customers, this will only be used when the API fails.
 */
function getMock() {
  return {
    ok: true,
    customers: [
      {
        customerId: 101,
        customerName: "Example Customer",
        status: "Down",
        deviceName: "Customer CPE",
        ipAddresses: ["172.20.1.236"],
        address: "120 Roy Nichols Blanco TX, 78606",
      },
      {
        customerId: 102,
        customerName: "Another Customer",
        status: "Down",
        deviceName: "Customer Router",
        ipAddresses: ["10.100.61.102", "172.18.1.58"],
        address: "112 N Avenue O Johnson City TX, 78636",
      },
    ],
  };
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
    ].map(normalize).join(" | ");

    return blob.includes(q);
  });

  renderTable(filtered);
}

async function init() {
  try {
    const payload = await fetchDownCustomers();
    if (!payload.ok) throw new Error(payload.error || "API returned ok=false");

    lastCustomers = Array.isArray(payload.customers) ? payload.customers : [];
    setApiState("ok", "API: Connected");
    setLastUpdated(new Date());
    renderTable(lastCustomers);
  } catch (err) {
    const payload = getMock();
    lastCustomers = payload.customers;
    setApiState("bad", "API: Using mock data");
    setLastUpdated(new Date());
    renderTable(lastCustomers);
  }

  ui.filter.addEventListener("input", applyFilter);
}

init();
