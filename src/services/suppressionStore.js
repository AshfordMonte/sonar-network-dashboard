const fs = require("fs");
const path = require("path");

// Where we store suppression lists on disk.
const ACCOUNTS_DATA_PATH = path.resolve(__dirname, "../../data/suppressions.json");
const INFRASTRUCTURE_DATA_PATH = path.resolve(
  __dirname,
  "../../data/infrastructure-suppressions.json",
);

let suppressedAccounts = new Set();
let suppressedInfrastructureItems = new Set();

function ensureJsonFile(filePath, initialValue) {
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(initialValue, null, 2));
  }
}

// Load suppression data from disk into memory.
function loadAccounts() {
  ensureJsonFile(ACCOUNTS_DATA_PATH, { accounts: [] });

  const raw = JSON.parse(fs.readFileSync(ACCOUNTS_DATA_PATH, "utf-8"));
  suppressedAccounts = new Set((raw.accounts || []).map(String));
}

function loadInfrastructureItems() {
  ensureJsonFile(INFRASTRUCTURE_DATA_PATH, { inventoryItems: [] });

  const raw = JSON.parse(fs.readFileSync(INFRASTRUCTURE_DATA_PATH, "utf-8"));
  suppressedInfrastructureItems = new Set((raw.inventoryItems || []).map(String));
}

// Persist the in-memory sets back to disk.
function saveAccounts() {
  fs.writeFileSync(
    ACCOUNTS_DATA_PATH,
    JSON.stringify({ accounts: [...suppressedAccounts] }, null, 2),
  );
}

function saveInfrastructureItems() {
  fs.writeFileSync(
    INFRASTRUCTURE_DATA_PATH,
    JSON.stringify({ inventoryItems: [...suppressedInfrastructureItems] }, null, 2),
  );
}

// Return the live suppression set.
function getSuppressedAccounts() {
  return suppressedAccounts;
}

function getSuppressedInfrastructureItems() {
  return suppressedInfrastructureItems;
}

// Add an account ID to suppressions.
function suppressAccount(id) {
  suppressedAccounts.add(String(id));
  saveAccounts();
}

// Remove an account ID from suppressions.
function unsuppressAccount(id) {
  suppressedAccounts.delete(String(id));
  saveAccounts();
}

function suppressInfrastructureItem(id) {
  // Infrastructure suppressions are keyed by inventory item ID so the table
  // rows and overview counts stay aligned.
  suppressedInfrastructureItems.add(String(id));
  saveInfrastructureItems();
}

function unsuppressInfrastructureItem(id) {
  suppressedInfrastructureItems.delete(String(id));
  saveInfrastructureItems();
}

// Load once at startup.
loadAccounts();
loadInfrastructureItems();

module.exports = {
  getSuppressedAccounts,
  getSuppressedInfrastructureItems,
  suppressAccount,
  suppressInfrastructureItem,
  unsuppressAccount,
  unsuppressInfrastructureItem,
};
