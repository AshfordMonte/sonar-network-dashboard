/**
 * server.js
 *
 * This is the backend for the dashboard.
 *
 * Responsibilities:
 * - Serve the static frontend (public/index.html, styles.css, app.js)
 * - Provide an internal API endpoint: GET /api/status-summary
 * - Call Sonar's GraphQL API (server-side only — keeps token private)
 * - Cache results so multiple dashboard viewers don't spam Sonar API
 * - Print usable LAN URLs on startup
 */

// Built-in Node modules
const path = require("path");
const os = require("os");

// Third-party modules
const express = require("express");
const dotenv = require("dotenv");

// Local modules
const { sonarGraphqlRequest } = require("./sonarClient");

// Load environment variables from .env into process.env
dotenv.config();

// Create the Express app
const app = express();

// Port can be set in .env. Defaults to 3000.
const PORT = Number(process.env.PORT || 3000);

// Bind to all interfaces so other machines on the LAN can reach it.
// NOTE: 0.0.0.0 is *not* an address you browse to — it means "listen everywhere".
const HOST = "0.0.0.0";

/**
 * Serve the frontend files out of ./public
 */
app.use(express.static(path.join(__dirname, "public")));

/**
 * Simple health endpoint.
 * Useful for quickly testing "is the server alive?"
 */
app.get("/health", (req, res) => res.json({ ok: true }));

/**
 * Sonar GraphQL query used to count customer equipment statuses.
 *
 * This query returns total account count and several filtered totals:
 * - good / warning / down are based on inventory_items.icmp_device_status
 * - uninventoried_only tracks customer-owned gear that isn't ICMP polled
 *
 * Variables:
 * - $companyId (Int64Bit)
 * - $accountStatusID (Int64Bit)
 */
const FULL_LIST_QUERY = `
query full_list($companyId: Int64Bit, $accountStatusID: Int64Bit) {
  total: accounts(company_id: $companyId, account_status_id: $accountStatusID) {
    page_info { total_count }
  }
  good: accounts(
    company_id: $companyId
    account_status_id: $accountStatusID
    reverse_relation_filters: [
      { relation: "addresses.inventory_items"
        search: { string_fields: [{ attribute: "icmp_device_status", search_value: "Good", match: true }] }
      }
    ]
  ) { page_info { total_count } }

  down: accounts(
    company_id: $companyId
    account_status_id: $accountStatusID
    reverse_relation_filters: [
      { relation: "addresses.inventory_items"
        search: { string_fields: [{ attribute: "icmp_device_status", search_value: "Down", match: true }] }
      }
    ]
  ) { page_info { total_count } }

  warning: accounts(
    company_id: $companyId
    account_status_id: $accountStatusID
    reverse_relation_filters: [
      { relation: "addresses.inventory_items"
        search: { string_fields: [{ attribute: "icmp_device_status", search_value: "Warning", match: true }] }
      }
    ]
  ) { page_info { total_count } }

  uninventoried_only: accounts(
    company_id: $companyId
    account_status_id: $accountStatusID
    reverse_relation_filters: [
      { relation: "uninventoried_mac_addresses", search: { exists: ["mac_address"] } },
      { relation: "addresses.inventory_items", search: { exists: ["icmp_device_status"] }, is_empty: true }
    ]
  ) { page_info { total_count } }
}
`;

// ---- Sonar Query (Down Accounts List) ----
const DOWN_ACCOUNTS_QUERY = `
query down_accounts($companyId: Int64Bit, $accountStatusID: Int64Bit) {
  accounts(
    company_id: $companyId
    reverse_relation_filters: [
      { relation: "addresses.inventory_items"
        search: { string_fields: [{ attribute: "icmp_device_status", search_value: "Down", match: true }] }
      }
    ]
    account_status_id: $accountStatusID
  ) {
    entities {
      id
      name
      addresses { entities { line1 } }
      ip_assignment_histories { entities { subnet } }
    }
  }
}
`;


/**
 * Cache settings.
 *
 * If multiple people load the dashboard, they'd otherwise all cause Sonar calls.
 * With caching, the server calls Sonar once per CACHE_MS window, and everyone
 * gets the same response until the cache expires.
 */
const CACHE_MS = 60_000; // 60 seconds
let cache = { ts: 0, payload: null };

/**
 * Helper: read an environment variable and safely convert it to a number.
 * Returns null if missing or invalid.
 */
function getEnvInt(name) {
  const v = process.env[name];
  if (v === undefined || v === "") return null;

  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Helper: safely pull the count from Sonar's result format.
 * Sonar returns counts under: { page_info: { total_count } }
 */
function pickCount(node) {
  return node?.page_info?.total_count ?? 0;
}

function uniqStrings(list) {
  const out = [];
  const seen = new Set();
  for (const v of list || []) {
    const s = String(v || "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function firstNonEmpty(list) {
  for (const v of list || []) {
    const s = String(v || "").trim();
    if (s) return s;
  }
  return "";
}


/**
 * Calls Sonar GraphQL and returns the customer equipment summary in our
 * dashboard-friendly shape.
 *
 * Requires in .env:
 * - SONAR_ENDPOINT
 * - SONAR_TOKEN
 *
 * Optional in .env:
 * - SONAR_COMPANY_ID
 * - SONAR_ACCOUNT_STATUS_ID
 */
async function getCustomerEquipmentSummary() {
  const endpoint = process.env.SONAR_ENDPOINT;
  const token = process.env.SONAR_TOKEN;

  // Fail fast if the Sonar connection info isn't configured
  if (!endpoint || !token) {
    throw new Error("Missing SONAR_ENDPOINT or SONAR_TOKEN in .env");
  }

  // Optional filters you can set in .env (null means "no filter")
  const companyId = getEnvInt("SONAR_COMPANY_ID");
  const accountStatusID = getEnvInt("SONAR_ACCOUNT_STATUS_ID");

  const variables = {
    companyId: companyId ?? null,
    accountStatusID: accountStatusID ?? null,
  };

  // Run GraphQL request against Sonar
  const data = await sonarGraphqlRequest({
    endpoint,
    token,
    query: FULL_LIST_QUERY,
    variables,
  });

  // Convert Sonar response -> dashboard counts
  const total = pickCount(data.total);
  const good = pickCount(data.good);
  const warning = pickCount(data.warning);
  const down = pickCount(data.down);

  // This represents customer-owned gear that isn't being ICMP polled
  const uninventoried = pickCount(data.uninventoried_only);

  return { customerEquipment: { good, warning, uninventoried, down, total } };
}
async function getDownCustomers() {
  const endpoint = process.env.SONAR_ENDPOINT;
  const token = process.env.SONAR_TOKEN;

  if (!endpoint || !token) {
    throw new Error("Missing SONAR_ENDPOINT or SONAR_TOKEN in .env");
  }

  const companyId = getEnvInt("SONAR_COMPANY_ID");
  const accountStatusID = getEnvInt("SONAR_ACCOUNT_STATUS_ID");

  const variables = {
    companyId: companyId ?? null,
    accountStatusID: accountStatusID ?? null,
  };

  const data = await sonarGraphqlRequest({
    endpoint,
    token,
    query: DOWN_ACCOUNTS_QUERY,
    variables,
  });

  const entities = data?.accounts?.entities || [];

  // Map Sonar -> frontend shape
  return entities.map((a) => {
    const id = a?.id; // Sonar returns as a string in your sample
    const name = a?.name || "(unknown)";

    const addressLines = uniqStrings(a?.addresses?.entities?.map(x => x?.line1));
    const address = firstNonEmpty(addressLines);

    const ipAddresses = uniqStrings(a?.ip_assignment_histories?.entities?.map(x => x?.subnet));

    return {
      customerId: id,
      customerName: name,
      status: "Down",
      deviceName: "—",       // placeholder until you add device details
      ipAddresses,
      address,
    };
  });
}

/**
 * GET /api/status-summary
 *
 * This endpoint is what the frontend calls on a timer.
 * It returns a consistent JSON structure:
 * {
 *   ok: true/false,
 *   source: "sonar" | "cache" | "error",
 *   summary: { ...counts... }
 * }
 */
app.get("/api/status-summary", async (req, res) => {
  try {
    const now = Date.now();

    // If cache is still fresh, return it immediately (no Sonar call)
    if (cache.payload && now - cache.ts < CACHE_MS) {
      return res.json({ ok: true, source: "cache", summary: cache.payload });
    }

    // Otherwise, fetch fresh data from Sonar
    const customer = await getCustomerEquipmentSummary();

    // Infrastructure isn't ready yet — keep stable placeholders for the UI
    const payload = {
      infrastructureEquipment: { good: 0, warning: 0, bad: 0, down: 0 },
      customerEquipment: customer.customerEquipment,
    };

    // Save to cache for the next requests
    cache = { ts: now, payload };

    // Send response to the frontend
    res.json({ ok: true, source: "sonar", summary: payload });
  } catch (err) {
    // Don't crash the server — return a structured error response instead
    console.error("Status summary error:", err);

    res.status(200).json({
      ok: false,
      source: "error",
      error: err.message,
      summary: {
        infrastructureEquipment: { good: 0, warning: 0, bad: 0, down: 0 },
        customerEquipment: { good: 0, warning: 0, bad: 0, down: 0, total: 0 },
      },
    });
  }
});

// Cache for down customer list (separate from summary cache)
const DOWN_CACHE_MS = 60_000;
let downCache = { ts: 0, customers: null };

app.get("/api/down-customers", async (req, res) => {
  try {
    const now = Date.now();

    if (downCache.customers && now - downCache.ts < DOWN_CACHE_MS) {
      return res.json({ ok: true, source: "cache", customers: downCache.customers });
    }

    const customers = await getDownCustomers();

    downCache = { ts: now, customers };
    res.json({ ok: true, source: "sonar", customers });
  } catch (err) {
    console.error("Down customers error:", err);
    res.status(200).json({
      ok: false,
      source: "error",
      error: err.message,
      customers: [],
    });
  }
});


/**
 * Returns a list of external IPv4 addresses on this machine.
 *
 * This is used only for printing the correct LAN URL(s) at startup.
 */
function getLocalIPs() {
  const nets = os.networkInterfaces();
  const results = [];

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Skip internal adapters (127.0.0.1) and anything not IPv4
      if (net.family === "IPv4" && !net.internal) {
        results.push(net.address);
      }
    }
  }

  return results;
}

/**
 * Start the web server.
 *
 * Note: We bind to 0.0.0.0 so the service is reachable on the LAN.
 * The printed URLs below are the ones you actually browse to.
 */
app.listen(PORT, HOST, () => {
  console.log(`Dashboard server started.`);
  console.log(`Local: http://localhost:${PORT}`);

  const ips = getLocalIPs();

  if (ips.length === 0) {
    console.log("No external IPv4 addresses detected.");
  } else {
    console.log("LAN access:");
    ips.forEach((ip) => {
      console.log(`  → http://${ip}:${PORT}`);
    });
  }
});