// src/services/sonarService.js

const { sonarGraphqlRequest } = require("../../sonarClient");
const { getEnvInt, requireEnv } = require("../utils/env");
const { pickCount, uniqStrings, firstNonEmpty } = require("../utils/normalize");
//Imports Graphql queries into variables
const {
  FULL_LIST_QUERY,
  DOWN_ACCOUNTS_QUERY,
  WARNING_ACCOUNTS_QUERY,
  ACCOUNT_BY_ID_QUERY,
} = require("../sonar/queries");

//Grabs env variables to build the sonar api calls
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

//Full customer count API call and imports into customerEquipment property
async function getCustomerEquipmentSummary() {
  const { endpoint, token, variables } = getSonarConfig();

  const data = await sonarGraphqlRequest({
    endpoint,
    token,
    query: FULL_LIST_QUERY,
    variables,
  });

  const total = pickCount(data.total);
  const good = pickCount(data.good);
  const warning = pickCount(data.warning);
  const down = pickCount(data.down);
  const uninventoried = pickCount(data.uninventoried_only);

  return { customerEquipment: { good, warning, uninventoried, down, total } };
}

async function getCustomersByIds(customerIds = []) {
  if (!customerIds.length) return [];

  const { endpoint, token } = getSonarConfig();

  // Small concurrency limit (suppressed list should be small, but this is safer)
  const CONCURRENCY = 5;
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
        // Reuse existing normalizer for consistent output keys
        const rows = mapAccountEntitiesToRows(entities, "Suppressed");

        // In practice accounts(id: X) should return 0 or 1 entity, but this is safe
        for (const row of rows) results.push(row);
      } catch (err) {
        // If an ID no longer exists / Sonar errors for that account, skip it
        // (Optional: console.warn here)
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(CONCURRENCY, ids.length) },
    () => worker()
  );
  await Promise.all(workers);

  // Keep stable ordering matching the suppression list
  const order = new Map(ids.map((id, i) => [id, i]));
  results.sort(
    (a, b) => (order.get(String(a.customerId)) ?? 0) - (order.get(String(b.customerId)) ?? 0)
  );

  return results;
}


//Formats Sonar customer data into data for the web app below
function mapAccountEntitiesToRows(entities, statusLabel) {
  return (entities || []).map((a) => {
    const id = a?.id;
    const name = a?.name || "(unknown)";

    const addressLines = uniqStrings(
      a?.addresses?.entities?.map((x) => x?.line1),
    );
    const address = firstNonEmpty(addressLines);

    const ipAddresses = uniqStrings(
      a?.ip_assignment_histories?.entities?.map((x) => x?.subnet),
    );

    return {
      customerId: id,
      customerName: name,
      status: statusLabel,
      deviceName: "—",
      ipAddresses,
      address,
    };
  });
}

//Grabs down customers from Sonar then formats them
async function getDownCustomers() {
  const { endpoint, token, variables } = getSonarConfig();

  const data = await sonarGraphqlRequest({
    endpoint,
    token,
    query: DOWN_ACCOUNTS_QUERY,
    variables,
  });

  const entities = data?.accounts?.entities || [];
  return mapAccountEntitiesToRows(entities, "Down");
}

//Grabs warning customers from Sonar then formats them
async function getWarningCustomers() {
  const { endpoint, token, variables } = getSonarConfig();

  const data = await sonarGraphqlRequest({
    endpoint,
    token,
    query: WARNING_ACCOUNTS_QUERY,
    variables,
  });

  const entities = data?.accounts?.entities || [];
  return mapAccountEntitiesToRows(entities, "Warning");
}

module.exports = {
  getCustomerEquipmentSummary,
  getDownCustomers,
  getWarningCustomers,
  getCustomersByIds,
};
