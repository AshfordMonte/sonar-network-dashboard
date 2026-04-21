// src/services/sonarService.js

const { sonarGraphqlRequest } = require("../../sonarClient");
const { getEnvInt, requireEnv } = require("../utils/env");
const { pickCount, uniqStrings, firstNonEmpty } = require("../utils/normalize");
const {
  ACCOUNT_BY_ID_QUERY,
  CUSTOMER_EQUIPMENT_SUMMARY_QUERY,
  DOWN_ACCOUNTS_QUERY,
  GOOD_ACCOUNTS_QUERY,
  INFRASTRUCTURE_DOWN_TABLE_QUERY,
  INFRASTRUCTURE_GOOD_TABLE_QUERY,
  INFRASTRUCTURE_INVENTORY_SNAPSHOT_QUERY,
  INFRASTRUCTURE_TABLE_SNAPSHOT_QUERY,
  INFRASTRUCTURE_WARNING_TABLE_QUERY,
  OPEN_TICKET_COUNT_QUERY,
  UNINVENTORIED_ACCOUNTS_QUERY,
  WARNING_ACCOUNTS_QUERY,
} = require("../sonar/queries");

const CUSTOMER_QUERY_PAGE_SIZE = 1000;

// Loads the Sonar connection settings and shared query variables.
function getSonarConfig() {
  const endpoint = requireEnv("SONAR_ENDPOINT");
  const token = requireEnv("SONAR_TOKEN");

  const companyId = getEnvInt("SONAR_COMPANY_ID");
  const accountStatusID = getEnvInt("SONAR_ACCOUNT_STATUS_ID");

  return {
    endpoint,
    token,
    variables: {
      companyId: companyId ?? null,
      accountStatusID: accountStatusID ?? null,
    },
  };
}

// Tiny wrapper so the rest of the file does not repeat the request boilerplate.
async function runSonarQuery(query, variables) {
  const { endpoint, token } = getSonarConfig();

  return sonarGraphqlRequest({
    endpoint,
    token,
    query,
    variables,
  });
}

// Returns the variable set used by account-scoped queries.
function getCustomerQueryVariables() {
  return getSonarConfig().variables;
}

// Returns the variable set used by network-site queries.
function getInfrastructureQueryVariables() {
  const { companyId } = getSonarConfig().variables;
  return { companyId };
}

// Normalizes GraphQL count results into the dashboard summary shape.
function mapInventoryCounts(data) {
  const total = pickCount(data.total);
  const good = pickCount(data.good);
  const warning = pickCount(data.warning);
  const down = pickCount(data.down);
  const uninventoried = pickCount(data.uninventoried_only);

  return { good, warning, uninventoried, down, total };
}

// Normalizes infrastructure status values for consistent comparisons.
function getNormalizedInfrastructureStatus(item) {
  return String(item?.icmp_device_status || "").trim().toUpperCase();
}

// Converts infrastructure status codes into UI-friendly labels.
function getInfrastructureStatusLabel(status) {
  if (status === "GOOD") return "Good";
  if (status === "WARNING") return "Warning";
  if (status === "DOWN") return "Down";
  return "Unmonitored";
}

// Checks whether an infrastructure status should land in the unmonitored bucket.
function isUnmonitoredInfrastructureStatus(status) {
  return status !== "GOOD" && status !== "WARNING" && status !== "DOWN";
}

// Totals infrastructure equipment counts while excluding suppressed items.
function summarizeInfrastructureEquipment(sites, suppressedItemIds = new Set()) {
  const summary = {
    good: 0,
    warning: 0,
    unmonitored: 0,
    down: 0,
    total: 0,
  };

  for (const site of sites || []) {
    const inventoryItems = site?.inventory_items?.entities || [];

    for (const item of inventoryItems) {
      const itemId = String(item?.id || "").trim();

      if (itemId && suppressedItemIds.has(itemId)) {
        continue;
      }

      const status = getNormalizedInfrastructureStatus(item);
      summary.total += 1;

      if (status === "GOOD") {
        summary.good += 1;
      } else if (status === "WARNING") {
        summary.warning += 1;
      } else if (status === "DOWN") {
        summary.down += 1;
      } else {
        summary.unmonitored += 1;
      }
    }
  }

  return summary;
}

// Sorts infrastructure rows so tables stay stable between refreshes.
function compareInfrastructureRows(a, b) {
  return (
    String(a.networkSiteName || "").localeCompare(String(b.networkSiteName || ""), "en", {
      sensitivity: "base",
    }) ||
    String(a.deviceName || "").localeCompare(String(b.deviceName || ""), "en", {
      sensitivity: "base",
    }) ||
    String((a.ipAddresses || [])[0] || "").localeCompare(
      String((b.ipAddresses || [])[0] || ""),
      "en",
      { sensitivity: "base" },
    )
  );
}

// Builds a fallback row for suppressed devices missing from the current snapshot.
function buildMissingSuppressedInfrastructureRow(itemId) {
  return {
    inventoryItemId: itemId,
    deviceName: "(not found in current snapshot)",
    status: "Suppressed",
    ipAddresses: [],
    networkSiteId: null,
    networkSiteName: "-",
  };
}

// Sonar exposes infrastructure IP assignments through InventoryModelFieldData,
// so we flatten that relation into table rows keyed by inventory item ID.
function mapInfrastructureRows(
  sites,
  {
    desiredStatus = null,
    excludedItemIds = new Set(),
    includedItemIds = null,
  } = {},
) {
  const rowsByItemId = new Map();

  for (const site of sites || []) {
    const histories = site?.ip_assignment_histories?.entities || [];

    for (const history of histories) {
      if (history?.removed_datetime) {
        continue;
      }

      const assignable = history?.ipassignmentable;

      if (assignable?.__typename !== "InventoryModelFieldData") {
        continue;
      }

      const item = assignable?.inventory_item;
      const itemId = String(assignable?.inventory_item_id || item?.id || "").trim();

      if (!itemId) {
        continue;
      }

      if (includedItemIds && !includedItemIds.has(itemId)) {
        continue;
      }

      if (excludedItemIds.has(itemId)) {
        continue;
      }

      const status = getNormalizedInfrastructureStatus(item);

      if (desiredStatus && status !== desiredStatus) {
        continue;
      }

      const existing = rowsByItemId.get(itemId);

      if (existing) {
        existing.ipAddresses = uniqStrings([...existing.ipAddresses, history?.subnet]);
        continue;
      }

      rowsByItemId.set(itemId, {
        inventoryItemId: itemId,
        deviceName:
          firstNonEmpty([history?.description, item?.inventory_model?.name]) || "(unknown)",
        status: getInfrastructureStatusLabel(status),
        ipAddresses: uniqStrings([history?.subnet]),
        networkSiteId: site?.id || null,
        networkSiteName: site?.name || "(unknown)",
      });
    }
  }

  return [...rowsByItemId.values()].sort(compareInfrastructureRows);
}

// Builds a lookup of current IP assignments for one network site.
function buildCurrentInfrastructureHistoryMap(site) {
  const historyMap = new Map();

  for (const history of site?.ip_assignment_histories?.entities || []) {
    if (history?.removed_datetime) {
      continue;
    }

    const assignable = history?.ipassignmentable;

    if (assignable?.__typename !== "InventoryModelFieldData") {
      continue;
    }

    const itemId = String(assignable?.inventory_item_id || "").trim();

    if (!itemId) {
      continue;
    }

    const existing = historyMap.get(itemId) || {
      descriptions: [],
      ipAddresses: [],
    };

    existing.descriptions = uniqStrings([...existing.descriptions, history?.description]);
    existing.ipAddresses = uniqStrings([...existing.ipAddresses, history?.subnet]);
    historyMap.set(itemId, existing);
  }

  return historyMap;
}

// Converts unmonitored infrastructure inventory items into table rows.
function mapUnmonitoredInfrastructureRows(sites, suppressedItemIds = new Set()) {
  const rows = [];

  for (const site of sites || []) {
    const currentHistoryMap = buildCurrentInfrastructureHistoryMap(site);
    const inventoryItems = site?.inventory_items?.entities || [];

    for (const item of inventoryItems) {
      const itemId = String(item?.id || "").trim();

      if (!itemId || suppressedItemIds.has(itemId)) {
        continue;
      }

      const status = getNormalizedInfrastructureStatus(item);

      if (!isUnmonitoredInfrastructureStatus(status)) {
        continue;
      }

      const currentInfo = currentHistoryMap.get(itemId) || {
        descriptions: [],
        ipAddresses: [],
      };

      rows.push({
        inventoryItemId: itemId,
        deviceName:
          firstNonEmpty([...currentInfo.descriptions, item?.inventory_model?.name]) ||
          "(unknown)",
        status: getInfrastructureStatusLabel(status),
        ipAddresses: currentInfo.ipAddresses,
        networkSiteId: site?.id || null,
        networkSiteName: site?.name || "(unknown)",
      });
    }
  }

  return rows.sort(compareInfrastructureRows);
}

// Fetches the customer equipment summary used on the overview page.
async function getCustomerEquipmentSummary() {
  const data = await runSonarQuery(
    CUSTOMER_EQUIPMENT_SUMMARY_QUERY,
    getCustomerQueryVariables(),
  );

  return { customerEquipment: mapInventoryCounts(data) };
}

// Fetches the infrastructure equipment summary used on the overview page.
async function getInfrastructureEquipmentSummary({ suppressedItemIds = new Set() } = {}) {
  const snapshotData = await runSonarQuery(
    INFRASTRUCTURE_INVENTORY_SNAPSHOT_QUERY,
    getInfrastructureQueryVariables(),
  );

  const sites = snapshotData?.network_sites?.entities || [];

  // For infrastructure, the overview tiles should reflect equipment counts,
  // not just how many sites matched a status.
  return {
    infrastructureEquipment: summarizeInfrastructureEquipment(sites, suppressedItemIds),
  };
}

// Returns visible GOOD infrastructure rows for the detail table.
async function getInfrastructureGoodRows({ suppressedItemIds = new Set() } = {}) {
  const data = await runSonarQuery(
    INFRASTRUCTURE_GOOD_TABLE_QUERY,
    getInfrastructureQueryVariables(),
  );

  const sites = data?.network_sites?.entities || [];

  return mapInfrastructureRows(sites, {
    desiredStatus: "GOOD",
    excludedItemIds: suppressedItemIds,
  });
}

// Returns visible DOWN infrastructure rows for the detail table.
async function getInfrastructureDownRows({ suppressedItemIds = new Set() } = {}) {
  const data = await runSonarQuery(
    INFRASTRUCTURE_DOWN_TABLE_QUERY,
    getInfrastructureQueryVariables(),
  );

  const sites = data?.network_sites?.entities || [];

  return mapInfrastructureRows(sites, {
    desiredStatus: "DOWN",
    excludedItemIds: suppressedItemIds,
  });
}

// Returns visible WARNING infrastructure rows for the detail table.
async function getInfrastructureWarningRows({ suppressedItemIds = new Set() } = {}) {
  const data = await runSonarQuery(
    INFRASTRUCTURE_WARNING_TABLE_QUERY,
    getInfrastructureQueryVariables(),
  );

  const sites = data?.network_sites?.entities || [];

  return mapInfrastructureRows(sites, {
    desiredStatus: "WARNING",
    excludedItemIds: suppressedItemIds,
  });
}

// Returns visible unmonitored infrastructure rows for the detail table.
async function getInfrastructureUnmonitoredRows({ suppressedItemIds = new Set() } = {}) {
  const data = await runSonarQuery(
    INFRASTRUCTURE_TABLE_SNAPSHOT_QUERY,
    getInfrastructureQueryVariables(),
  );

  const sites = data?.network_sites?.entities || [];

  return mapUnmonitoredInfrastructureRows(sites, suppressedItemIds);
}

// Fetches the count of tickets that are not yet closed.
async function getOpenTicketCount() {
  const data = await runSonarQuery(OPEN_TICKET_COUNT_QUERY, getInfrastructureQueryVariables());
  return Number(data?.tickets?.page_info?.total_count || 0);
}

// Rehydrates suppressed infrastructure IDs back into table rows.
async function getSuppressedInfrastructureRows({ suppressedItemIds = new Set() } = {}) {
  if (!suppressedItemIds.size) return [];

  const data = await runSonarQuery(
    INFRASTRUCTURE_TABLE_SNAPSHOT_QUERY,
    getInfrastructureQueryVariables(),
  );

  const sites = data?.network_sites?.entities || [];

  const rows = mapInfrastructureRows(sites, {
    includedItemIds: suppressedItemIds,
  });

  const seenItemIds = new Set(rows.map((row) => String(row.inventoryItemId)));

  // Keep suppressed IDs visible even if Sonar no longer returns a current
  // IP assignment row for them, so the UI can still offer an unsuppress action.
  for (const itemId of suppressedItemIds) {
    const normalizedId = String(itemId);
    if (seenItemIds.has(normalizedId)) continue;
    rows.push(buildMissingSuppressedInfrastructureRow(normalizedId));
  }

  return rows.sort(compareInfrastructureRows);
}

// Resolves a list of suppressed customer IDs back into display rows.
async function getCustomersByIds(customerIds = []) {
  if (!customerIds.length) return [];

  const { endpoint, token } = getSonarConfig();
  const concurrency = 5;
  const ids = customerIds.map(String);

  const results = [];
  let idx = 0;

  async function worker() {
    while (idx < ids.length) {
      const myIdx = idx++;
      const idStr = ids[myIdx];

      try {
        const data = await sonarGraphqlRequest({
          endpoint,
          token,
          query: ACCOUNT_BY_ID_QUERY,
          variables: { id: Number(idStr) },
        });

        const entities = data?.accounts?.entities || [];
        const rows = mapAccountEntitiesToRows(entities, "Suppressed");

        for (const row of rows) results.push(row);
      } catch (err) {
        // If a suppressed account no longer exists in Sonar, just skip it.
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, ids.length) },
    () => worker(),
  );
  await Promise.all(workers);

  const order = new Map(ids.map((id, index) => [id, index]));
  results.sort(
    (a, b) =>
      (order.get(String(a.customerId)) ?? 0) -
      (order.get(String(b.customerId)) ?? 0),
  );

  return results;
}

// Converts Sonar account entities into the table row shape used by the UI.
function mapAccountEntitiesToRows(entities, statusLabel) {
  return (entities || []).map((account) => {
    const id = account?.id;
    const name = account?.name || "(unknown)";

    const addressLines = uniqStrings(
      account?.addresses?.entities?.map((address) => address?.line1),
    );
    const address = firstNonEmpty(addressLines);

    const ipAddresses = uniqStrings(
      account?.ip_assignment_histories?.entities?.map((assignment) => assignment?.subnet),
    );

    return {
      customerId: id,
      customerName: name,
      status: statusLabel,
      deviceName: "-",
      ipAddresses,
      address,
    };
  });
}

// Fetches all account entities for a paged customer query.
async function fetchAllCustomerAccountEntities(query) {
  const entities = [];
  let page = 1;
  let totalCount = null;

  while (true) {
    const data = await runSonarQuery(query, {
      ...getCustomerQueryVariables(),
      page,
      pageSize: CUSTOMER_QUERY_PAGE_SIZE,
    });

    const accountPage = data?.accounts;
    const pageEntities = accountPage?.entities || [];
    const pageTotal = Number(accountPage?.page_info?.total_count || 0);

    if (totalCount === null) {
      totalCount = pageTotal;
    }

    entities.push(...pageEntities);

    if (!pageEntities.length || entities.length >= totalCount) {
      break;
    }

    page += 1;
  }

  return entities;
}

// Deduplicates customer rows by account ID so cross-page fetches stay stable.
function dedupeCustomerRows(rows) {
  const seen = new Set();
  const deduped = [];

  for (const row of rows || []) {
    const id = String(row?.customerId || "").trim();

    if (!id || seen.has(id)) {
      continue;
    }

    seen.add(id);
    deduped.push(row);
  }

  return deduped;
}

// Returns visible Down customer rows for the customer detail page.
async function getDownCustomers() {
  const entities = await fetchAllCustomerAccountEntities(DOWN_ACCOUNTS_QUERY);
  return dedupeCustomerRows(mapAccountEntitiesToRows(entities, "Down"));
}

// Returns visible Warning customer rows for the customer detail page.
async function getWarningCustomers() {
  const entities = await fetchAllCustomerAccountEntities(WARNING_ACCOUNTS_QUERY);
  return dedupeCustomerRows(mapAccountEntitiesToRows(entities, "Warning"));
}

// Returns visible Uninventoried customer rows for the customer detail page.
async function getUninventoriedCustomers() {
  const entities = await fetchAllCustomerAccountEntities(UNINVENTORIED_ACCOUNTS_QUERY);
  return dedupeCustomerRows(mapAccountEntitiesToRows(entities, "Uninventoried"));
}

// Returns customer rows that belong in the dashboard's derived GOOD bucket.
async function getGoodCustomers() {
  const [goodEntities, downCustomers, warningCustomers, uninventoriedCustomers] =
    await Promise.all([
      fetchAllCustomerAccountEntities(GOOD_ACCOUNTS_QUERY),
      getDownCustomers(),
      getWarningCustomers(),
      getUninventoriedCustomers(),
    ]);

  const excludedCustomerIds = new Set([
    ...downCustomers.map((customer) => String(customer.customerId)),
    ...warningCustomers.map((customer) => String(customer.customerId)),
    ...uninventoriedCustomers.map((customer) => String(customer.customerId)),
  ]);

  const goodRows = mapAccountEntitiesToRows(goodEntities, "Good").filter(
    (customer) => !excludedCustomerIds.has(String(customer.customerId)),
  );

  return dedupeCustomerRows(goodRows);
}

module.exports = {
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
};
