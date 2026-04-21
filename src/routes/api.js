// src/routes/api.js (CommonJS)
const express = require("express");
const {
  getCustomerEquipmentSummary,
  getCustomersByIds,
  getDownCustomers,
  getGoodCustomers,
  getInfrastructureDownRows,
  getInfrastructureEquipmentSummary,
  getInfrastructureGoodRows,
  getInfrastructureUnmonitoredRows,
  getInfrastructureWarningRows,
  getOpenTicketCount,
  getSuppressedInfrastructureRows,
  getUninventoriedCustomers,
  getWarningCustomers,
} = require("../services/sonarService");

const {
  getSuppressedAccounts,
  getSuppressedInfrastructureItems,
} = require("../services/suppressionStore");
const { getEnvInt } = require("../utils/env");

const router = express.Router();
const CACHE_TTL_MS = getEnvInt("CACHE_TTL_MS") ?? 60_000;

// Creates a simple in-memory cache record for one endpoint.
function makeCache(ttlMs) {
  return { ttlMs, ts: 0, value: null };
}

// Checks whether a cache entry is still valid.
function cacheFresh(cache) {
  return cache.value && Date.now() - cache.ts < cache.ttlMs;
}

// Removes suppressed customers from a customer row list.
function filterSuppressed(customers) {
  const suppressed = getSuppressedAccounts();
  return customers.filter((customer) => !suppressed.has(String(customer.customerId)));
}

// Parses a positive integer query parameter with bounds.
function parsePositiveInt(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, min), max);
}

// Slices a full row list into one page and returns pagination metadata.
function paginateRows(rows, requestedPage, pageSize) {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(requestedPage, 1), totalPages);
  const start = total ? (page - 1) * pageSize : 0;
  const end = Math.min(start + pageSize, total);

  return {
    rows: rows.slice(start, end),
    meta: {
      page,
      pageSize,
      total,
      totalPages,
      from: total ? start + 1 : 0,
      to: end,
    },
  };
}

const summaryCache = makeCache(CACHE_TTL_MS);

router.get("/status-summary", async (req, res) => {
  try {
    if (cacheFresh(summaryCache)) {
      return res.json({
        ok: true,
        source: "cache",
        summary: summaryCache.value,
      });
    }

    const suppressed = getSuppressedAccounts();
    const suppressedInfrastructureItems = getSuppressedInfrastructureItems();

    // Pull everything we need for the overview at the same time.
    const [
      infrastructureSummary,
      customerSummary,
      downCustomers,
      warningCustomers,
      uninventoriedCustomers,
      openTickets,
    ] = await Promise.all([
      getInfrastructureEquipmentSummary({
        suppressedItemIds: suppressedInfrastructureItems,
      }),
      getCustomerEquipmentSummary(),
      getDownCustomers(),
      getWarningCustomers(),
      getUninventoriedCustomers(),
      getOpenTicketCount(),
    ]);

    const visibleDown = downCustomers.filter(
      (customer) => !suppressed.has(String(customer.customerId)),
    );
    const visibleWarning = warningCustomers.filter(
      (customer) => !suppressed.has(String(customer.customerId)),
    );
    const visibleUninventoried = uninventoriedCustomers.filter(
      (customer) => !suppressed.has(String(customer.customerId)),
    );

    const suppressedDown = downCustomers.length - visibleDown.length;
    const suppressedWarning = warningCustomers.length - visibleWarning.length;
    const suppressedUninventoried =
      uninventoriedCustomers.length - visibleUninventoried.length;

    const visibleTotal =
      customerSummary.customerEquipment.total -
      suppressedDown -
      suppressedWarning -
      suppressedUninventoried;

    const customerEquipment = {
      down: visibleDown.length,
      warning: visibleWarning.length,
      uninventoried: visibleUninventoried.length,
      good:
        visibleTotal -
        visibleDown.length -
        visibleWarning.length -
        visibleUninventoried.length,
      total: visibleTotal,
    };

    const payload = {
      infrastructureEquipment: infrastructureSummary.infrastructureEquipment,
      customerEquipment,
      // Tickets are shown as a single overview card for now.
      tickets: {
        open: openTickets,
      },
      meta: {
        suppressed: {
          down: suppressedDown,
          warning: suppressedWarning,
          uninventoried: suppressedUninventoried,
        },
      },
    };

    summaryCache.ts = Date.now();
    summaryCache.value = payload;

    res.json({ ok: true, source: "sonar", summary: payload });
  } catch (err) {
    console.error("Status summary error:", err);
    res.status(200).json({
      ok: false,
      source: "error",
      error: err.message,
      summary: {
        infrastructureEquipment: { good: 0, warning: 0, unmonitored: 0, down: 0, total: 0 },
        customerEquipment: { good: 0, warning: 0, uninventoried: 0, down: 0, total: 0 },
        tickets: { open: 0 },
      },
    });
  }
});

const downCache = makeCache(CACHE_TTL_MS);
const goodCache = makeCache(CACHE_TTL_MS);

router.get("/down-customers", async (req, res) => {
  try {
    if (cacheFresh(downCache)) {
      return res.json({
        ok: true,
        source: "cache",
        customers: downCache.value,
      });
    }

    const customers = await getDownCustomers();
    const visibleCustomers = filterSuppressed(customers);

    downCache.ts = Date.now();
    downCache.value = visibleCustomers;

    res.json({
      ok: true,
      source: "sonar",
      customers: visibleCustomers,
      meta: {
        raw: customers.length,
        suppressed: customers.length - visibleCustomers.length,
        visible: visibleCustomers.length,
      },
    });
  } catch (err) {
    console.error("Down customers error:", err);
    res
      .status(200)
      .json({ ok: false, source: "error", error: err.message, customers: [] });
  }
});

const warningCache = makeCache(CACHE_TTL_MS);
const uninventoriedCache = makeCache(CACHE_TTL_MS);
const infrastructureDownCache = makeCache(CACHE_TTL_MS);
const infrastructureGoodCache = makeCache(CACHE_TTL_MS);
const infrastructureUnmonitoredCache = makeCache(CACHE_TTL_MS);
const infrastructureWarningCache = makeCache(CACHE_TTL_MS);
const suppressedInfrastructureCache = makeCache(CACHE_TTL_MS);

router.get("/good-customers", async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1);
    const pageSize = parsePositiveInt(req.query.pageSize, 500, { min: 1, max: 500 });
    const fromCache = cacheFresh(goodCache);

    if (!fromCache) {
      const customers = await getGoodCustomers();
      goodCache.ts = Date.now();
      goodCache.value = filterSuppressed(customers);
    }

    const pagination = paginateRows(goodCache.value || [], page, pageSize);

    res.json({
      ok: true,
      source: fromCache ? "cache" : "sonar",
      customers: pagination.rows,
      meta: pagination.meta,
    });
  } catch (err) {
    console.error("Good customers error:", err);
    res.status(200).json({
      ok: false,
      source: "error",
      error: err.message,
      customers: [],
      meta: {
        page: 1,
        pageSize: 500,
        total: 0,
        totalPages: 1,
        from: 0,
        to: 0,
      },
    });
  }
});

router.get("/warning-customers", async (req, res) => {
  try {
    if (cacheFresh(warningCache)) {
      return res.json({
        ok: true,
        source: "cache",
        customers: warningCache.value,
      });
    }

    const customers = await getWarningCustomers();
    const visibleCustomers = filterSuppressed(customers);

    warningCache.ts = Date.now();
    warningCache.value = visibleCustomers;

    res.json({
      ok: true,
      source: "sonar",
      customers: visibleCustomers,
      meta: {
        raw: customers.length,
        suppressed: customers.length - visibleCustomers.length,
        visible: visibleCustomers.length,
      },
    });
  } catch (err) {
    console.error("Warning customers error:", err);
    res
      .status(200)
      .json({ ok: false, source: "error", error: err.message, customers: [] });
  }
});

router.get("/infrastructure-good", async (req, res) => {
  try {
    if (cacheFresh(infrastructureGoodCache)) {
      return res.json({
        ok: true,
        source: "cache",
        rows: infrastructureGoodCache.value,
      });
    }

    const suppressedInfrastructureItems = getSuppressedInfrastructureItems();
    const rows = await getInfrastructureGoodRows({
      suppressedItemIds: suppressedInfrastructureItems,
    });

    infrastructureGoodCache.ts = Date.now();
    infrastructureGoodCache.value = rows;

    res.json({
      ok: true,
      source: "sonar",
      rows,
      meta: {
        visible: rows.length,
        suppressed: suppressedInfrastructureItems.size,
      },
    });
  } catch (err) {
    console.error("Infrastructure good rows error:", err);
    res.status(200).json({
      ok: false,
      source: "error",
      error: err.message,
      rows: [],
    });
  }
});

router.get("/uninventoried-customers", async (req, res) => {
  try {
    if (cacheFresh(uninventoriedCache)) {
      return res.json({
        ok: true,
        source: "cache",
        customers: uninventoriedCache.value,
      });
    }

    const customers = await getUninventoriedCustomers();
    const visibleCustomers = filterSuppressed(customers);

    uninventoriedCache.ts = Date.now();
    uninventoriedCache.value = visibleCustomers;

    res.json({
      ok: true,
      source: "sonar",
      customers: visibleCustomers,
      meta: {
        raw: customers.length,
        suppressed: customers.length - visibleCustomers.length,
        visible: visibleCustomers.length,
      },
    });
  } catch (err) {
    console.error("Uninventoried customers error:", err);
    res.status(200).json({
      ok: false,
      source: "error",
      error: err.message,
      customers: [],
    });
  }
});

// Returns the visible infrastructure rows that are currently WARNING.
router.get("/infrastructure-warning", async (req, res) => {
  try {
    if (cacheFresh(infrastructureWarningCache)) {
      return res.json({
        ok: true,
        source: "cache",
        rows: infrastructureWarningCache.value,
      });
    }

    const suppressedInfrastructureItems = getSuppressedInfrastructureItems();
    const rows = await getInfrastructureWarningRows({
      suppressedItemIds: suppressedInfrastructureItems,
    });

    infrastructureWarningCache.ts = Date.now();
    infrastructureWarningCache.value = rows;

    res.json({
      ok: true,
      source: "sonar",
      rows,
      meta: {
        visible: rows.length,
        suppressed: suppressedInfrastructureItems.size,
      },
    });
  } catch (err) {
    console.error("Infrastructure warning rows error:", err);
    res.status(200).json({
      ok: false,
      source: "error",
      error: err.message,
      rows: [],
    });
  }
});

// Returns the visible infrastructure rows that are currently DOWN.
router.get("/infrastructure-down", async (req, res) => {
  try {
    if (cacheFresh(infrastructureDownCache)) {
      return res.json({
        ok: true,
        source: "cache",
        rows: infrastructureDownCache.value,
      });
    }

    const suppressedInfrastructureItems = getSuppressedInfrastructureItems();
    const rows = await getInfrastructureDownRows({
      suppressedItemIds: suppressedInfrastructureItems,
    });

    infrastructureDownCache.ts = Date.now();
    infrastructureDownCache.value = rows;

    res.json({
      ok: true,
      source: "sonar",
      rows,
      meta: {
        visible: rows.length,
        suppressed: suppressedInfrastructureItems.size,
      },
    });
  } catch (err) {
    console.error("Infrastructure down rows error:", err);
    res.status(200).json({
      ok: false,
      source: "error",
      error: err.message,
      rows: [],
    });
  }
});

// Returns the visible infrastructure rows that land in the unmonitored bucket.
router.get("/infrastructure-unmonitored", async (req, res) => {
  try {
    if (cacheFresh(infrastructureUnmonitoredCache)) {
      return res.json({
        ok: true,
        source: "cache",
        rows: infrastructureUnmonitoredCache.value,
      });
    }

    const suppressedInfrastructureItems = getSuppressedInfrastructureItems();
    const rows = await getInfrastructureUnmonitoredRows({
      suppressedItemIds: suppressedInfrastructureItems,
    });

    infrastructureUnmonitoredCache.ts = Date.now();
    infrastructureUnmonitoredCache.value = rows;

    res.json({
      ok: true,
      source: "sonar",
      rows,
      meta: {
        visible: rows.length,
        suppressed: suppressedInfrastructureItems.size,
      },
    });
  } catch (err) {
    console.error("Infrastructure unmonitored rows error:", err);
    res.status(200).json({
      ok: false,
      source: "error",
      error: err.message,
      rows: [],
    });
  }
});

router.get("/suppressed-customers", async (req, res) => {
  try {
    const suppressed = [...getSuppressedAccounts()];

    if (!suppressed.length) {
      return res.json({
        ok: true,
        source: "local",
        customers: [],
      });
    }

    const customers = await getCustomersByIds(suppressed);

    res.json({
      ok: true,
      source: "sonar",
      customers,
    });
  } catch (err) {
    console.error("Suppressed customers error:", err);
    res.status(200).json({
      ok: false,
      source: "error",
      error: err.message,
      customers: [],
    });
  }
});

router.get("/suppressed-infrastructure", async (req, res) => {
  try {
    if (cacheFresh(suppressedInfrastructureCache)) {
      return res.json({
        ok: true,
        source: "cache",
        rows: suppressedInfrastructureCache.value,
      });
    }

    const suppressedInfrastructureItems = getSuppressedInfrastructureItems();

    if (!suppressedInfrastructureItems.size) {
      return res.json({
        ok: true,
        source: "local",
        rows: [],
      });
    }

    // Rehydrate suppressed inventory item IDs back into table rows so the UI
    // can show context and offer unsuppress actions.
    const rows = await getSuppressedInfrastructureRows({
      suppressedItemIds: suppressedInfrastructureItems,
    });

    suppressedInfrastructureCache.ts = Date.now();
    suppressedInfrastructureCache.value = rows;

    res.json({
      ok: true,
      source: "sonar",
      rows,
      meta: {
        stored: suppressedInfrastructureItems.size,
        visible: rows.length,
      },
    });
  } catch (err) {
    console.error("Suppressed infrastructure error:", err);
    res.status(200).json({
      ok: false,
      source: "error",
      error: err.message,
      rows: [],
    });
  }
});

// Clears cached customer responses after suppression changes.
function clearCustomerCaches() {
  summaryCache.ts = 0;
  downCache.ts = 0;
  goodCache.ts = 0;
  warningCache.ts = 0;
  uninventoriedCache.ts = 0;
}

// Clears cached infrastructure responses after suppression changes.
function clearInfrastructureCaches() {
  summaryCache.ts = 0;
  infrastructureDownCache.ts = 0;
  infrastructureGoodCache.ts = 0;
  infrastructureUnmonitoredCache.ts = 0;
  infrastructureWarningCache.ts = 0;
  suppressedInfrastructureCache.ts = 0;
}

module.exports = {
  clearInfrastructureCaches,
  router,
  clearCustomerCaches,
};
