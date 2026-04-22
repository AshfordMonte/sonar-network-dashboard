/**
 * good.js
 *
 * Page logic for the "Good Customers" view.
 *
 * Backend provides:
 *   GET /api/good-customers?page=1&pageSize=500
 *   POST /api/suppressions/accounts/:id
 */

const el = (id) => document.getElementById(id);

const REFRESH_MS =
  typeof window.DASHBOARD_REFRESH_MS === "number"
    ? window.DASHBOARD_REFRESH_MS
    : 60_000;

const PAGE_SIZE = 500;

const ui = {
  rows: el("rows"),
  empty: el("empty"),
  count: el("count"),
  filter: el("filter"),
  pagination: el("pagination"),
  apiDot: el("api-dot"),
  apiStatus: el("api-status"),
  lastUpdated: el("last-updated"),
};

let currentPage = 1;
let lastCustomers = [];
let lastMeta = {
  page: 1,
  pageSize: PAGE_SIZE,
  total: 0,
  totalPages: 1,
  from: 0,
  to: 0,
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

function updateUrlPage(page) {
  const url = new URL(window.location.href);
  url.searchParams.set("page", String(page));
  window.history.replaceState({}, "", url);
}

function parsePageFromUrl() {
  const parsed = Number.parseInt(new URLSearchParams(window.location.search).get("page"), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function setCount(filteredCount) {
  const base = `Showing ${lastMeta.from}-${lastMeta.to} of ${lastMeta.total} customers`;
  const pageInfo = `Page ${lastMeta.page} of ${lastMeta.totalPages}`;

  if (!ui.filter.value.trim()) {
    ui.count.textContent = `${base} | ${pageInfo}`;
    return;
  }

  ui.count.textContent = `${filteredCount} filtered customers on ${pageInfo}`;
}

function renderTable(customers) {
  ui.rows.innerHTML = "";

  if (!customers.length) {
    ui.empty.hidden = false;
    setCount(0);
    return;
  }

  ui.empty.hidden = true;
  setCount(customers.length);

  const frag = document.createDocumentFragment();

  for (const c of customers) {
    const tr = document.createElement("tr");

    const nameTd = document.createElement("td");
    const a = document.createElement("a");
    a.className = "pc-link";
    a.href = buildSonarCustomerUrl(c.customerId);
    a.target = "_blank";
    a.rel = "noreferrer";
    a.textContent = c.customerName || "(unknown)";
    nameTd.appendChild(a);

    const statusTd = document.createElement("td");
    statusTd.innerHTML = `<span class="badge badge--good">${c.status || "Good"}</span>`;

    const ipTd = document.createElement("td");
    ipTd.textContent = joinIps(c.ipAddresses) || "-";

    const addrTd = document.createElement("td");
    addrTd.textContent = c.address || "-";

    const actionsTd = document.createElement("td");
    actionsTd.className = "actions-col";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "suppress-btn";
    btn.dataset.id = String(c.customerId);
    btn.textContent = "Suppress";
    btn.title = "Suppress this account";

    actionsTd.appendChild(btn);

    tr.append(nameTd, statusTd, ipTd, addrTd, actionsTd);
    frag.appendChild(tr);
  }

  ui.rows.appendChild(frag);
}

function buildPageList(page, totalPages) {
  const pages = [];

  for (let i = Math.max(1, page - 2); i <= Math.min(totalPages, page + 2); i += 1) {
    pages.push(i);
  }

  if (!pages.includes(1)) {
    pages.unshift(1);
  }

  if (!pages.includes(totalPages)) {
    pages.push(totalPages);
  }

  return [...new Set(pages)].sort((a, b) => a - b);
}

function renderPagination() {
  ui.pagination.innerHTML = "";

  if (lastMeta.totalPages <= 1) {
    return;
  }

  const fragment = document.createDocumentFragment();
  const pages = buildPageList(lastMeta.page, lastMeta.totalPages);

  function addButton(label, page, { disabled = false, active = false } = {}) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `pagination__button${active ? " pagination__button--active" : ""}`;
    button.textContent = label;
    button.disabled = disabled;
    button.dataset.page = String(page);
    fragment.appendChild(button);
  }

  addButton("Prev", lastMeta.page - 1, { disabled: lastMeta.page <= 1 });

  for (let i = 0; i < pages.length; i += 1) {
    const page = pages[i];
    const previous = pages[i - 1];

    if (previous && page - previous > 1) {
      const gap = document.createElement("span");
      gap.className = "pagination__ellipsis";
      gap.textContent = "...";
      fragment.appendChild(gap);
    }

    addButton(String(page), page, { active: page === lastMeta.page });
  }

  addButton("Next", lastMeta.page + 1, {
    disabled: lastMeta.page >= lastMeta.totalPages,
  });

  ui.pagination.appendChild(fragment);
}

async function fetchGoodCustomers(page) {
  const res = await fetch(`/api/good-customers?page=${page}&pageSize=${PAGE_SIZE}`, {
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

function applyFilter() {
  const q = normalize(ui.filter.value);

  if (!q) {
    renderTable(lastCustomers);
    return;
  }

  const filtered = lastCustomers.filter((c) => {
    const blob = [c.customerName, c.status, joinIps(c.ipAddresses), c.address]
      .map(normalize)
      .join(" | ");

    return blob.includes(q);
  });

  renderTable(filtered);
}

async function refresh() {
  window.DashboardLoadingUI?.startFetch();
  ui.apiStatus.textContent = "API: Loading...";

  try {
    const payload = await fetchGoodCustomers(currentPage);
    if (!payload.ok) throw new Error(payload.error || "API returned ok=false");

    lastCustomers = Array.isArray(payload.customers) ? payload.customers : [];
    lastMeta = payload.meta || lastMeta;
    currentPage = lastMeta.page || currentPage;

    updateUrlPage(currentPage);
    renderPagination();
    setApiState("ok", payload.source === "cache" ? "API: Connected (cached)" : "API: Connected");
    setLastUpdated(new Date());
    applyFilter();
  } catch (err) {
    console.error(err);
    setApiState("bad", "API: Request failed");
    setLastUpdated(new Date());
    lastCustomers = [];
    lastMeta = {
      page: 1,
      pageSize: PAGE_SIZE,
      total: 0,
      totalPages: 1,
      from: 0,
      to: 0,
    };
    renderPagination();
    renderTable([]);
  } finally {
    window.DashboardLoadingUI?.finishFetch();
  }
}

async function goToPage(page) {
  const nextPage = Number.parseInt(String(page), 10);

  if (!Number.isFinite(nextPage) || nextPage < 1 || nextPage === currentPage) {
    return;
  }

  currentPage = nextPage;
  await refresh();
}

async function init() {
  currentPage = parsePageFromUrl();
  ui.filter.addEventListener("input", applyFilter);
  ui.pagination.addEventListener("click", async (event) => {
    const button = event.target.closest(".pagination__button");
    if (!button || button.disabled) return;
    await goToPage(button.dataset.page);
  });

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
    const res = await fetch(`/api/suppressions/accounts/${encodeURIComponent(id)}`, {
      method: "POST",
    });

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
