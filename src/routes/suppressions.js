const express = require("express");
const {
  getSuppressedAccounts,
  getSuppressedInfrastructureItems,
  suppressAccount,
  suppressInfrastructureItem,
  unsuppressAccount,
  unsuppressInfrastructureItem,
} = require("../services/suppressionStore");
const { clearCustomerCaches, clearInfrastructureCaches } = require("./api");

const router = express.Router();

// List all suppressed accounts.
router.get("/", (req, res) => {
  res.json({
    ok: true,
    accounts: [...getSuppressedAccounts()],
    infrastructureItems: [...getSuppressedInfrastructureItems()],
  });
});

// Suppress account by ID and clear cached data.
router.post("/accounts/:id", (req, res) => {
  suppressAccount(req.params.id);
  clearCustomerCaches();
  res.json({ ok: true });
});

// Unsuppress account by ID and clear cached data.
router.delete("/accounts/:id", (req, res) => {
  unsuppressAccount(req.params.id);
  clearCustomerCaches();
  res.json({ ok: true });
});

router.post("/infrastructure-items/:id", (req, res) => {
  suppressInfrastructureItem(req.params.id);
  clearInfrastructureCaches();
  res.json({ ok: true });
});

router.delete("/infrastructure-items/:id", (req, res) => {
  unsuppressInfrastructureItem(req.params.id);
  clearInfrastructureCaches();
  res.json({ ok: true });
});

module.exports = router;
