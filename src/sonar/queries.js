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

// Site-level infrastructure counts kept here in case we want them later.
// The overview currently uses equipment counts calculated from the snapshot below.
const INFRASTRUCTURE_EQUIPMENT_SUMMARY_QUERY = buildInventoryCountQuery({
  queryName: "NetworkSiteInventoryCounts",
  ...INFRASTRUCTURE_INVENTORY,
});

// Full infrastructure snapshot used for equipment totals.
// This gives us every inventory item so we can count actual equipment instead of sites.
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

// GOOD table rows come from the IP assignment side so we can show the
// device description plus the current live IP for each infrastructure item.
const INFRASTRUCTURE_GOOD_TABLE_QUERY = buildInventoryStatusListQuery({
  queryName: "network_sites_good_table",
  variables: INFRASTRUCTURE_INVENTORY.variables,
  entityName: INFRASTRUCTURE_INVENTORY.entityName,
  baseArgs: INFRASTRUCTURE_INVENTORY.baseArgs,
  relationPath: INFRASTRUCTURE_INVENTORY.relationPath,
  statusField: INFRASTRUCTURE_INVENTORY.statusField,
  statusValue: INFRASTRUCTURE_INVENTORY.statuses.good,
  paginator: { page: 1, records_per_page: 10000 },
  entitySelection: `
entities {
  id
  name
  ip_assignment_histories {
    entities {
      id
      description
      subnet
      removed_datetime
      ipassignmentable {
        __typename
        ... on InventoryModelFieldData {
          id
          inventory_item_id
          inventory_item {
            id
            icmp_device_status
            inventory_model {
              name
            }
          }
        }
      }
    }
  }
}
`,
});

// Broader snapshot used when we need to resolve suppressed infrastructure rows
// by inventory item ID, regardless of their current status.
const INFRASTRUCTURE_TABLE_SNAPSHOT_QUERY = buildEntityListQuery({
  queryName: "network_sites_table_snapshot",
  variables: INFRASTRUCTURE_INVENTORY.variables,
  entityName: INFRASTRUCTURE_INVENTORY.entityName,
  args: {
    ...INFRASTRUCTURE_INVENTORY.baseArgs,
    paginator: { page: 1, records_per_page: 10000 },
  },
  entitySelection: `
entities {
  id
  name
  ip_assignment_histories {
    entities {
      id
      description
      subnet
      removed_datetime
      ipassignmentable {
        __typename
        ... on InventoryModelFieldData {
          id
          inventory_item_id
          inventory_item {
            id
            icmp_device_status
            inventory_model {
              name
            }
          }
        }
      }
    }
  }
}
`,
});

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

function buildInfrastructureUnmonitoredSitesQuery() {
  // Right now the same snapshot query is enough for unmonitored sites.
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
  INFRASTRUCTURE_GOOD_TABLE_QUERY,
  INFRASTRUCTURE_INVENTORY_SNAPSHOT_QUERY,
  INFRASTRUCTURE_TABLE_SNAPSHOT_QUERY,
  WARNING_ACCOUNTS_QUERY,
  buildInfrastructureSitesByStatusQuery,
  buildInfrastructureUnmonitoredSitesQuery,
};
