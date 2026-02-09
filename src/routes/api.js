// src/routes/api.js (CommonJS)
const express = require("express");
const {
  getCustomerEquipmentSummary,
  getDownCustomers,
  getWarningCustomers,
  getCustomersByIds
} = require("../services/sonarService");

const { getSuppressedAccounts } = require("../services/suppressionStore");
const { getEnvInt } = require("../utils/env");

const router = express.Router();
const CACHE_TTL_MS = getEnvInt("CACHE_TTL_MS") ?? 60_000;

// Simple helper cache factory
function makeCache(ttlMs) {
  return { ttlMs, ts: 0, value: null };
}
function cacheFresh(cache) {
  return cache.value && Date.now() - cache.ts < cache.ttlMs;
}
function filterSuppressed(customers) {
  const suppressed = getSuppressedAccounts();
  return customers.filter((c) => !suppressed.has(String(c.customerId)));
}


// ---- /api/status-summary ----
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

    // pull raw lists
    const [summary, downCustomers, warningCustomers] = await Promise.all([
      getCustomerEquipmentSummary(),
      getDownCustomers(),
      getWarningCustomers(),
    ]);

    // filter suppressed
    const visibleDown = downCustomers.filter(
      (c) => !suppressed.has(String(c.customerId)),
    );

    const visibleWarning = warningCustomers.filter(
      (c) => !suppressed.has(String(c.customerId)),
    );

    // suppressed counts
    const suppressedDown = downCustomers.length - visibleDown.length;
    const suppressedWarning = warningCustomers.length - visibleWarning.length;

    // total after suppression
    const visibleTotal =
      summary.customerEquipment.total - suppressedDown - suppressedWarning;

    // rebuild counts
    const customerEquipment = {
      down: visibleDown.length,
      warning: visibleWarning.length,
      uninventoried: summary.customerEquipment.uninventoried,
      good:
        visibleTotal -
        visibleDown.length -
        visibleWarning.length -
        summary.customerEquipment.uninventoried,
      total: visibleTotal,
    };

    const payload = {
      infrastructureEquipment: summary.infrastructureEquipment,
      customerEquipment,
      meta: {
        suppressed: {
          down: suppressedDown,
          warning: suppressedWarning,
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
        infrastructureEquipment: { good: 0, warning: 0, bad: 0, down: 0 },
        customerEquipment: { good: 0, warning: 0, bad: 0, down: 0, total: 0 },
      },
    });
  }
});

// ---- /api/down-customers ----
const downCache = makeCache(CACHE_TTL_MS);

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

// ---- /api/warning-customers ----
const warningCache = makeCache(CACHE_TTL_MS);

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

// ---- /api/suppressed-customers ----
router.get("/suppressed-customers", async (req, res) => {
  try {
    const suppressed = [...getSuppressedAccounts()];

    if (!suppressed.length) {
      return res.json({
        ok: true,
        source: "local",
        customers: []
      });
    }

    const customers = await getCustomersByIds(suppressed);

    res.json({
      ok: true,
      source: "sonar",
      customers
    });
  } catch (err) {
    console.error("Suppressed customers error:", err);
    res.status(200).json({
      ok: false,
      source: "error",
      error: err.message,
      customers: []
    });
  }
});


function clearCustomerCaches() {
  summaryCache.ts = 0;
  downCache.ts = 0;
  warningCache.ts = 0;
}

module.exports = {
  router,
  clearCustomerCaches,
};
