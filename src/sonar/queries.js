// src/sonar/queries.js

const {
  buildEntityListQuery,
  buildInventoryCountQuery,
  buildInventoryStatusListQuery,
  buildStatusScopedRelationSelection,
} = require("./inventoryQueryBuilder");

const INVENTORY_STATUS_FIELD = "icmp_device_status";

// Customer inventory settings.
// These use the older customer relation path and title case status values.
const CUSTOMER_INVENTORY = {
  variables: ["$companyId: Int64Bit", "$accountStatusID: Int64Bit"],
  entityName: "accounts",
  baseArgs: {
    company_id: "$companyId",
    account_status_id: "$accountStatusID",
  },
  relationPath: "addresses.inventory_items",
  statusField: INVENTORY_STATUS_FIELD,
  statuses: {
    good: "Good",
    warning: "Warning",
    down: "Down",
  },
  uninventoriedFilters: [
    {
      relation: "uninventoried_mac_addresses",
      search: { exists: ["mac_address"] },
    },
    {
      relation: "addresses.inventory_items",
      search: { exists: [INVENTORY_STATUS_FIELD] },
      is_empty: true,
    },
  ],
};

// Infrastructure inventory settings.
// network_sites uses a different relation path and uppercase status values.
const INFRASTRUCTURE_INVENTORY = {
  variables: ["$companyId: Int64Bit!"],
  entityName: "network_sites",
  baseArgs: {
    company_id: "$companyId",
  },
  relationPath: "inventory_items",
  statusField: INVENTORY_STATUS_FIELD,
  statuses: {
    good: "GOOD",
    warning: "WARNING",
    down: "DOWN",
  },
};

// Customer dashboard tile counts.
const CUSTOMER_EQUIPMENT_SUMMARY_QUERY = buildInventoryCountQuery({
  queryName: "CustomerInventoryCounts",
  ...CUSTOMER_INVENTORY,
});

// Infrastructure dashboard tile counts.
// Uninventoried is handled separately in JS because Sonar rejects duplicate
// reverse relation filters on inventory_items for network_sites.
const INFRASTRUCTURE_EQUIPMENT_SUMMARY_QUERY = buildInventoryCountQuery({
  queryName: "NetworkSiteInventoryCounts",
  ...INFRASTRUCTURE_INVENTORY,
});

// Full infrastructure snapshot used to calculate uninventoried sites in JS.
// We only need a light set of fields here.
const INFRASTRUCTURE_INVENTORY_SNAPSHOT_QUERY = buildEntityListQuery({
  queryName: "network_sites_inventory_snapshot",
  variables: INFRASTRUCTURE_INVENTORY.variables,
  entityName: INFRASTRUCTURE_INVENTORY.entityName,
  args: {
    ...INFRASTRUCTURE_INVENTORY.baseArgs,
    paginator: { page: 1, records_per_page: 10000 },
  },
  entitySelection: `
page_info { total_count }
entities {
  name
  inventory_items {
    entities {
      id
      icmp_device_status
    }
  }
}
`,
});

// Customer detail table queries.
const DOWN_ACCOUNTS_QUERY = buildInventoryStatusListQuery({
  queryName: "down_accounts",
  variables: CUSTOMER_INVENTORY.variables,
  entityName: CUSTOMER_INVENTORY.entityName,
  baseArgs: CUSTOMER_INVENTORY.baseArgs,
  relationPath: CUSTOMER_INVENTORY.relationPath,
  statusField: CUSTOMER_INVENTORY.statusField,
  statusValue: CUSTOMER_INVENTORY.statuses.down,
  paginator: { page: 1, records_per_page: 2000 },
  entitySelection: `
entities {
  id
  name
  addresses { entities { line1 } }
  ip_assignment_histories { entities { subnet } }
}
`,
});

const WARNING_ACCOUNTS_QUERY = buildInventoryStatusListQuery({
  queryName: "warning_accounts",
  variables: CUSTOMER_INVENTORY.variables,
  entityName: CUSTOMER_INVENTORY.entityName,
  baseArgs: CUSTOMER_INVENTORY.baseArgs,
  relationPath: CUSTOMER_INVENTORY.relationPath,
  statusField: CUSTOMER_INVENTORY.statusField,
  statusValue: CUSTOMER_INVENTORY.statuses.warning,
  paginator: { page: 1, records_per_page: 2000 },
  entitySelection: `
entities {
  id
  name
  addresses { entities { line1 } }
  ip_assignment_histories { entities { subnet } }
}
`,
});

function buildInfrastructureEntitySelection(statusValue) {
  // For infrastructure detail pages, we want the site name plus only the
  // inventory items that match the chosen status.
  return `
entities {
  name
  ${buildStatusScopedRelationSelection({
    relationName: "inventory_items",
    statusField: INFRASTRUCTURE_INVENTORY.statusField,
    statusValue,
    selection: `
entities {
  id
  icmp_device_status
}
`,
  })}
  ip_assignment_histories {
    entities {
      id
      description
    }
  }
}
`;
}

function buildInfrastructureSitesByStatusQuery(statusKey) {
  const statusValue = INFRASTRUCTURE_INVENTORY.statuses[statusKey];

  if (!statusValue) {
    throw new Error(`Unknown infrastructure status key: ${statusKey}`);
  }

  return buildInventoryStatusListQuery({
    queryName: `network_sites_${statusKey}`,
    variables: INFRASTRUCTURE_INVENTORY.variables,
    entityName: INFRASTRUCTURE_INVENTORY.entityName,
    baseArgs: INFRASTRUCTURE_INVENTORY.baseArgs,
    relationPath: INFRASTRUCTURE_INVENTORY.relationPath,
    statusField: INFRASTRUCTURE_INVENTORY.statusField,
    statusValue,
    paginator: { page: 1, records_per_page: 10000 },
    entitySelection: buildInfrastructureEntitySelection(statusValue),
  });
}

function buildInfrastructureUninventoriedSitesQuery() {
  // Right now the same snapshot query is enough for uninventoried sites.
  // We can always swap this later if Sonar gives us a cleaner filter.
  return INFRASTRUCTURE_INVENTORY_SNAPSHOT_QUERY;
}

const ACCOUNT_BY_ID_QUERY = `
query account_by_id($id: Int64Bit) {
  accounts(id: $id) {
    entities {
      id
      name
      addresses { entities { line1 } }
      ip_assignment_histories { entities { subnet } }
    }
  }
}
`;

module.exports = {
  ACCOUNT_BY_ID_QUERY,
  CUSTOMER_EQUIPMENT_SUMMARY_QUERY,
  DOWN_ACCOUNTS_QUERY,
  INFRASTRUCTURE_EQUIPMENT_SUMMARY_QUERY,
  INFRASTRUCTURE_INVENTORY_SNAPSHOT_QUERY,
  WARNING_ACCOUNTS_QUERY,
  buildInfrastructureSitesByStatusQuery,
  buildInfrastructureUninventoriedSitesQuery,
};