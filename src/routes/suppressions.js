const express = require("express");
const {
  getSuppressedAccounts,
  suppressAccount,
  unsuppressAccount
} = require("../services/suppressionStore");
const { clearCustomerCaches } = require("./api");

const router = express.Router();

// List all suppressed accounts
router.get("/", (req, res) => {
  res.json({
    ok: true,
    accounts: [...getSuppressedAccounts()]
  });
});

// Suppress account
router.post("/accounts/:id", (req, res) => {
  suppressAccount(req.params.id);
  clearCustomerCaches();
  res.json({ ok: true });
});


// Unsuppress account
router.delete("/accounts/:id", (req, res) => {
  unsuppressAccount(req.params.id);
  clearCustomerCaches();
  res.json({ ok: true });
});

module.exports = router;
