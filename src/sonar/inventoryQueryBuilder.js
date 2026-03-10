// src/sonar/inventoryQueryBuilder.js
//
// Small helper functions for building Sonar GraphQL queries in one place.
// This keeps the query file cleaner and helps us avoid copy/paste.

function toGraphqlInput(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    return value.startsWith("$") ? value : JSON.stringify(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => toGraphqlInput(item)).join(", ")}]`;
  }
  if (typeof value === "object") {
    const parts = Object.entries(value)
      .filter(([, item]) => item !== null && item !== undefined)
      .map(([key, item]) => `${key}: ${toGraphqlInput(item)}`);
    return `{ ${parts.join(", ")} }`;
  }

  throw new Error(`Unsupported GraphQL input type: ${typeof value}`);
}

function indentBlock(text, spaces = 2) {
  const prefix = " ".repeat(spaces);
  return String(text)
    .trim()
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

function buildVariableSignature(variables = []) {
  return variables.join(", ");
}

function buildArgsBlock(args = {}) {
  return Object.entries(args)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => `${key}: ${toGraphqlInput(value)}`)
    .join("\n");
}

function buildStatusSearch(statusField, statusValue) {
  // Sonar status searches all use this same shape.
  return {
    string_fields: [
      {
        attribute: statusField,
        search_value: statusValue,
        match: true,
      },
    ],
  };
}

function buildStatusReverseRelationFilter({ relationPath, statusField, statusValue }) {
  // This is the piece Sonar uses to find a parent object by a child status.
  return {
    relation: relationPath,
    search: buildStatusSearch(statusField, statusValue),
  };
}

function buildQueryField({ alias, entityName, args = {}, selection }) {
  const argsBlock = buildArgsBlock(args);
  const head = `${alias}: ${entityName}`;

  if (!argsBlock) {
    return `${head} {
${indentBlock(selection, 4)}
  }`;
  }

  return `${head}(
${indentBlock(argsBlock, 4)}
  ) {
${indentBlock(selection, 4)}
  }`;
}

function buildEntityListQuery({
  queryName,
  variables,
  alias,
  entityName,
  args,
  entitySelection,
}) {
  // Generic list query builder for cases where we want the actual rows back.
  return `query ${queryName}(${buildVariableSignature(variables)}) {
${indentBlock(
  buildQueryField({
    alias: alias || entityName,
    entityName,
    args,
    selection: entitySelection,
  }),
  2,
)}
}`;
}

function buildInventoryCountQuery({
  queryName,
  variables,
  entityName,
  baseArgs,
  relationPath,
  statusField,
  statuses,
  uninventoriedFilters = [],
  uninventoriedAlias = "uninventoried_only",
}) {
  // Builds the summary count query used by the overview tiles.
  const sections = [
    buildQueryField({
      alias: "total",
      entityName,
      args: baseArgs,
      selection: "page_info { total_count }",
    }),
  ];

  for (const [alias, statusValue] of Object.entries(statuses)) {
    sections.push(
      buildQueryField({
        alias,
        entityName,
        args: {
          ...baseArgs,
          reverse_relation_filters: [
            buildStatusReverseRelationFilter({
              relationPath,
              statusField,
              statusValue,
            }),
          ],
        },
        selection: "page_info { total_count }",
      }),
    );
  }

  if (uninventoriedFilters.length) {
    sections.push(
      buildQueryField({
        alias: uninventoriedAlias,
        entityName,
        args: {
          ...baseArgs,
          reverse_relation_filters: uninventoriedFilters,
        },
        selection: "page_info { total_count }",
      }),
    );
  }

  return `query ${queryName}(${buildVariableSignature(variables)}) {
${sections.map((section) => indentBlock(section, 2)).join("\n\n")}
}`;
}

function buildInventoryStatusListQuery({
  queryName,
  variables,
  entityName,
  baseArgs,
  relationPath,
  statusField,
  statusValue,
  paginator,
  entitySelection,
}) {
  // Builds a list query for one status like Down or Warning.
  return buildEntityListQuery({
    queryName,
    variables,
    entityName,
    args: {
      ...baseArgs,
      ...(paginator ? { paginator } : {}),
      reverse_relation_filters: [
        buildStatusReverseRelationFilter({
          relationPath,
          statusField,
          statusValue,
        }),
      ],
    },
    entitySelection,
  });
}

function buildInventoryUninventoriedListQuery({
  queryName,
  variables,
  entityName,
  baseArgs,
  paginator,
  uninventoriedFilters,
  entitySelection,
}) {
  // Kept separate because uninventoried rules can be different from normal statuses.
  return buildEntityListQuery({
    queryName,
    variables,
    entityName,
    args: {
      ...baseArgs,
      ...(paginator ? { paginator } : {}),
      reverse_relation_filters: uninventoriedFilters,
    },
    entitySelection,
  });
}

function buildStatusScopedRelationSelection({
  relationName,
  statusField,
  statusValue,
  selection,
}) {
  // The reverse filter decides which site shows up.
  // This part trims the nested inventory_items array to just the matching status.
  return `${relationName}(search: ${toGraphqlInput(buildStatusSearch(statusField, statusValue))}) {
${indentBlock(selection, 2)}
}`;
}

module.exports = {
  buildEntityListQuery,
  buildInventoryCountQuery,
  buildInventoryStatusListQuery,
  buildInventoryUninventoriedListQuery,
  buildStatusScopedRelationSelection,
  buildStatusReverseRelationFilter,
  buildStatusSearch,
};