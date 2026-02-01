const fs = require("fs");
const path = require("path");

const DATA_PATH = path.resolve(__dirname, "../../data/suppressions.json");

let suppressedAccounts = new Set();

function load() {
  if (!fs.existsSync(DATA_PATH)) {
    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
    fs.writeFileSync(DATA_PATH, JSON.stringify({ accounts: [] }, null, 2));
  }

  const raw = JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));
  suppressedAccounts = new Set((raw.accounts || []).map(String));
}

function save() {
  fs.writeFileSync(
    DATA_PATH,
    JSON.stringify({ accounts: [...suppressedAccounts] }, null, 2)
  );
}

function getSuppressedAccounts() {
  return suppressedAccounts;
}

function suppressAccount(id) {
  suppressedAccounts.add(String(id));
  save();
}

function unsuppressAccount(id) {
  suppressedAccounts.delete(String(id));
  save();
}

// load once at startup
load();

module.exports = {
  getSuppressedAccounts,
  suppressAccount,
  unsuppressAccount
};
