function jsonResponse(body, status = 200) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}

async function mockJson(page, matcher, body, status = 200) {
  await page.route(matcher, async (route) => {
    await route.fulfill(jsonResponse(body, status));
  });
}

async function mockStatusSummary(page, summary) {
  await mockJson(page, /\/api\/status-summary$/, {
    ok: true,
    source: "mock",
    summary,
  });
}

async function mockCustomerList(page, endpoint, customers, source = "mock") {
  await mockJson(page, new RegExp(`${endpoint.replace("/", "\\/")}$`), {
    ok: true,
    source,
    customers,
    meta: {
      raw: customers.length,
      suppressed: 0,
      visible: customers.length,
    },
  });
}

async function mockInfrastructureList(page, endpoint, rows, source = "mock") {
  await mockJson(page, new RegExp(`${endpoint.replace("/", "\\/")}$`), {
    ok: true,
    source,
    rows,
    meta: {
      visible: rows.length,
      suppressed: 0,
    },
  });
}

module.exports = {
  jsonResponse,
  mockCustomerList,
  mockInfrastructureList,
  mockJson,
  mockStatusSummary,
};
