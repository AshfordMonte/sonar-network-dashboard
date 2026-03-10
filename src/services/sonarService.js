// src/services/sonarService.js

const { sonarGraphqlRequest } = require("../../sonarClient");
const { getEnvInt, requireEnv } = require("../utils/env");
const { pickCount, uniqStrings, firstNonEmpty } = require("../utils/normalize");
const {
  ACCOUNT_BY_ID_QUERY,
  CUSTOMER_EQUIPMENT_SUMMARY_QUERY,
  DOWN_ACCOUNTS_QUERY,
  INFRASTRUCTURE_EQUIPMENT_SUMMARY_QUERY,
  INFRASTRUCTURE_INVENTORY_SNAPSHOT_QUERY,
  WARNING_ACCOUNTS_QUERY,
} = require("../sonar/queries");

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

function getCustomerQueryVariables() {
  return getSonarConfig().variables;
}

function getInfrastructureQueryVariables() {
  const { companyId } = getSonarConfig().variables;
  return { companyId };
}

function mapInventoryCounts(data) {
  const total = pickCount(data.total);
  const good = pickCount(data.good);
  const warning = pickCount(data.warning);
  const down = pickCount(data.down);
  const uninventoried = pickCount(data.uninventoried_only);

  return { good, warning, uninventoried, down, total };
}

function isUninventoriedInfrastructureSite(site) {
  const inventoryItems = site?.inventory_items?.entities || [];

  // Empty sites do not count here.
  // We only count sites that have inventory items and every status is blank/null.
  if (!inventoryItems.length) return false;

  return inventoryItems.every((item) => {
    const status = String(item?.icmp_device_status || "").trim();
    return !status;
  });
}

async function getCustomerEquipmentSummary() {
  const data = await runSonarQuery(
    CUSTOMER_EQUIPMENT_SUMMARY_QUERY,
    getCustomerQueryVariables(),
  );

  return { customerEquipment: mapInventoryCounts(data) };
}

async function getInfrastructureEquipmentSummary() {
  const variables = getInfrastructureQueryVariables();
  const [countData, snapshotData] = await Promise.all([
    runSonarQuery(INFRASTRUCTURE_EQUIPMENT_SUMMARY_QUERY, variables),
    runSonarQuery(INFRASTRUCTURE_INVENTORY_SNAPSHOT_QUERY, variables),
  ]);

  const infrastructureEquipment = mapInventoryCounts(countData);
  const sites = snapshotData?.network_sites?.entities || [];

  // Sonar gives us good/warning/down counts directly, but the null-only site
  // case was easier and safer to calculate on our side.
  infrastructureEquipment.uninventoried = sites.filter(
    isUninventoriedInfrastructureSite,
  ).length;

  return { infrastructureEquipment };
}

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

async function getDownCustomers() {
  const data = await runSonarQuery(DOWN_ACCOUNTS_QUERY, getCustomerQueryVariables());
  const entities = data?.accounts?.entities || [];

  return mapAccountEntitiesToRows(entities, "Down");
}

async function getWarningCustomers() {
  const data = await runSonarQuery(WARNING_ACCOUNTS_QUERY, getCustomerQueryVariables());
  const entities = data?.accounts?.entities || [];

  return mapAccountEntitiesToRows(entities, "Warning");
}

module.exports = {
  getCustomerEquipmentSummary,
  getCustomersByIds,
  getDownCustomers,
  getInfrastructureEquipmentSummary,
  getWarningCustomers,
};