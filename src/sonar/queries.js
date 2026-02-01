// src/sonar/queries.js

//Graphql queries to send out to API endpoint

const FULL_LIST_QUERY = `
query full_list($companyId: Int64Bit, $accountStatusID: Int64Bit) {
  total: accounts(company_id: $companyId, account_status_id: $accountStatusID) {
    page_info { total_count }
  }
  good: accounts(
    company_id: $companyId
    account_status_id: $accountStatusID
    reverse_relation_filters: [
      { relation: "addresses.inventory_items"
        search: { string_fields: [{ attribute: "icmp_device_status", search_value: "Good", match: true }] }
      }
    ]
  ) { page_info { total_count } }

  down: accounts(
    company_id: $companyId
    account_status_id: $accountStatusID
    reverse_relation_filters: [
      { relation: "addresses.inventory_items"
        search: { string_fields: [{ attribute: "icmp_device_status", search_value: "Down", match: true }] }
      }
    ]
  ) { page_info { total_count } }

  warning: accounts(
    company_id: $companyId
    account_status_id: $accountStatusID
    reverse_relation_filters: [
      { relation: "addresses.inventory_items"
        search: { string_fields: [{ attribute: "icmp_device_status", search_value: "Warning", match: true }] }
      }
    ]
  ) { page_info { total_count } }

  uninventoried_only: accounts(
    company_id: $companyId
    account_status_id: $accountStatusID
    reverse_relation_filters: [
      { relation: "uninventoried_mac_addresses", search: { exists: ["mac_address"] } },
      { relation: "addresses.inventory_items", search: { exists: ["icmp_device_status"] }, is_empty: true }
    ]
  ) { page_info { total_count } }
}
`;

const DOWN_ACCOUNTS_QUERY = `
query down_accounts($companyId: Int64Bit, $accountStatusID: Int64Bit) {
  accounts(
    company_id: $companyId
    paginator: {page: 1, records_per_page: 300}
    reverse_relation_filters: [
      { relation: "addresses.inventory_items"
        search: { string_fields: [{ attribute: "icmp_device_status", search_value: "Down", match: true }] }
      }
    ]
    account_status_id: $accountStatusID
  ) {
    entities {
      id
      name
      addresses { entities { line1 } }
      ip_assignment_histories { entities { subnet } }
    }
  }
}
`;

const WARNING_ACCOUNTS_QUERY = `
query warning_accounts($companyId: Int64Bit, $accountStatusID: Int64Bit) {
  accounts(
    company_id: $companyId
    paginator: {page: 1, records_per_page: 300}
    reverse_relation_filters: [
      { relation: "addresses.inventory_items"
        search: { string_fields: [{ attribute: "icmp_device_status", search_value: "Warning", match: true }] }
      }
    ]
    account_status_id: $accountStatusID
  ) {
    entities {
      id
      name
      addresses { entities { line1 } }
      ip_assignment_histories { entities { subnet } }
    }
  }
}
`;

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
  FULL_LIST_QUERY,
  DOWN_ACCOUNTS_QUERY,
  WARNING_ACCOUNTS_QUERY,
  ACCOUNT_BY_ID_QUERY,
};

