/**
 * Frontend logic for the dashboard
 *
 * What this file does:
 * - Calls GET /api/status-summary on the backend
 * - Updates the dashboard tiles with live data
 * - Shows API connection status
 * - Refreshes automatically on a timer
 */

// How often the dashboard refreshes (in milliseconds)
// 60,000 ms = 60 seconds = 1 minute
const REFRESH_MS =
  typeof window.DASHBOARD_REFRESH_MS === "number"
    ? window.DASHBOARD_REFRESH_MS
    : 60_000;

/**
 * Small helper function to grab DOM elements by ID.
 * This just saves us from typing document.getElementById() everywhere.
 */
const el = (id) => document.getElementById(id);

/**
 * Centralized reference to all UI elements we care about.
 * This avoids repeatedly querying the DOM.
 */
const ui = {
  infra: {
    good: el("infra-good"),
    warning: el("infra-warning"),
    bad: el("infra-bad"),
    down: el("infra-down"),
  },
  cust: {
    good: el("cust-good"),
    warning: el("cust-warning"),
    uninventoried: el("cust-uninventoried"),
    down: el("cust-down"),
  },

  apiDot: el("api-dot"),
  apiStatus: el("api-status"),
  lastUpdated: el("last-updated"),
};

/**
 * Formats numbers for display in the UI.
 * - Adds commas (1,234)
 * - Replaces invalid values with an em dash
 */
function fmt(n) {
  if (typeof n !== "number" || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US");
}

/**
 * Updates the API connection indicator in the footer.
 * Changes the color of the dot and the status text.
 */
function setApiState(state, message) {
  ui.apiDot.classList.remove("status__dot--ok", "status__dot--bad");

  if (state === "ok") ui.apiDot.classList.add("status__dot--ok");
  if (state === "bad") ui.apiDot.classList.add("status__dot--bad");

  ui.apiStatus.textContent = message;
}

/**
 * Updates the "Last updated" timestamp in the footer.
 */
function setLastUpdated(date = new Date()) {
  ui.lastUpdated.textContent = `Last updated: ${date.toLocaleString()}`;
}

/**
 * Takes a summary object from the API and updates the UI tiles.
 * Uses optional chaining (?.) so missing fields don't crash the app.
 */
function render(summary) {
  ui.infra.good.textContent = fmt(summary?.infrastructureEquipment?.good);
  ui.infra.warning.textContent = fmt(summary?.infrastructureEquipment?.warning);
  ui.infra.bad.textContent = fmt(summary?.infrastructureEquipment?.bad);
  ui.infra.down.textContent = fmt(summary?.infrastructureEquipment?.down);

  ui.cust.good.textContent = fmt(summary?.customerEquipment?.good);
  ui.cust.warning.textContent = fmt(summary?.customerEquipment?.warning);
  ui.cust.uninventoried.textContent = fmt(summary?.customerEquipment?.uninventoried);
  ui.cust.down.textContent = fmt(summary?.customerEquipment?.down);
}

/**
 * Mock data used when the API is unavailable.
 * This prevents the UI from breaking and gives a visual reference.
 */
function getMockSummary() {
  return {
    infrastructureEquipment: { good: 71, warning: 0, bad: 0, down: 58 },
    customerEquipment: { good: 1489, warning: 9, bad: 1, down: 71 },
  };
}

/**
 * Fetches the summary data from the backend API.
 * Throws an error if the request fails.
 */
async function fetchSummary() {
  const res = await fetch("/api/status-summary", { cache: "no-store" });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  return await res.json(); // { ok, source, summary, ... }
}

/**
 * Main refresh function.
 * - Fetches data
 * - Updates UI
 * - Updates API status indicator
 * - Updates timestamp
 */
async function refresh() {
  try {
    const payload = await fetchSummary();
    render(payload.summary);

    if (payload.ok) {
      const label =
        payload.source === "cache"
          ? "API: Connected (cached)"
          : "API: Connected";
      setApiState("ok", label);
    } else {
      setApiState("bad", `API: Error (${payload.error || "unknown"})`);
    }

    setLastUpdated(new Date());
  } catch (err) {
    // If the request fails entirely (network error, server down, etc.)
    setApiState("bad", "API: Request failed");
    setLastUpdated(new Date());
  }
}

// Run once on page load
refresh();

// Automatically refresh on an interval
setInterval(refresh, REFRESH_MS);
