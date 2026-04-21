const { test, expect } = require("@playwright/test");
const { jsonResponse, mockCustomerList } = require("./helpers/mockApi");

function customer(id, overrides = {}) {
  return {
    customerId: id,
    customerName: `Customer ${id}`,
    status: "Good",
    deviceName: "-",
    ipAddresses: [`10.0.${id}.1/32`],
    address: `${id} Main St`,
    ...overrides,
  };
}

const customerPages = [
  {
    title: "Warning customers page",
    path: "/warning.html",
    endpoint: "/api/warning-customers",
    heading: "Warning Customers",
    badgeClass: "badge--warning",
    row: customer(101, { customerName: "Acme Warning", status: "Warning", address: "101 Oak St" }),
  },
  {
    title: "Down customers page",
    path: "/down.html",
    endpoint: "/api/down-customers",
    heading: "Down Customers",
    badgeClass: "badge--down",
    row: customer(202, { customerName: "Acme Down", status: "Down", address: "202 Pine St" }),
  },
  {
    title: "Uninventoried customers page",
    path: "/uninventoried.html",
    endpoint: "/api/uninventoried-customers",
    heading: "Uninventoried Customers",
    badgeClass: "badge--neutral",
    row: customer(303, {
      customerName: "Acme Unknown",
      status: "Uninventoried",
      address: "303 Cedar St",
    }),
  },
];

for (const pageCase of customerPages) {
  test(pageCase.title, async ({ page }) => {
    await mockCustomerList(page, pageCase.endpoint, [pageCase.row]);

    await page.goto(pageCase.path);

    await expect(page.getByRole("heading", { name: pageCase.heading })).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr")).toContainText(pageCase.row.customerName);
    await expect(page.locator("tbody tr .badge")).toHaveClass(new RegExp(pageCase.badgeClass));

    await page.getByRole("searchbox").fill(pageCase.row.address);
    await expect(page.locator("tbody tr")).toHaveCount(1);

    await page.getByRole("searchbox").fill("no match");
    await expect(page.locator("#empty")).toBeVisible();
  });
}

test("good customers page paginates, filters, and refreshes after suppression", async ({ page }) => {
  const pageOneRows = [
    customer(1, { customerName: "Good Alpha", status: "Good", address: "1 Alpha Way" }),
    customer(2, { customerName: "Good Beta", status: "Good", address: "2 Beta Way" }),
  ];
  const pageTwoRows = [
    customer(501, { customerName: "Good Gamma", status: "Good", address: "501 Gamma Way" }),
  ];

  let suppressedCustomerId = null;

  await page.route(/\/api\/good-customers\?page=\d+&pageSize=500$/, async (route) => {
    const url = new URL(route.request().url());
    const pageNumber = Number(url.searchParams.get("page") || "1");
    let customers = pageNumber === 2 ? pageTwoRows : pageOneRows;

    if (suppressedCustomerId) {
      customers = customers.filter((entry) => String(entry.customerId) !== suppressedCustomerId);
    }

    const total = (pageOneRows.length + pageTwoRows.length) - (suppressedCustomerId ? 1 : 0);
    const totalPages = 2;
    const from = pageNumber === 2 ? 501 : 1;
    const to = pageNumber === 2 ? 501 : customers.length;

    await route.fulfill(
      jsonResponse({
        ok: true,
        source: "mock",
        customers,
        meta: {
          page: pageNumber,
          pageSize: 500,
          total,
          totalPages,
          from,
          to,
        },
      }),
    );
  });

  await page.route(/\/api\/suppressions\/accounts\/\d+$/, async (route) => {
    suppressedCustomerId = route.request().url().split("/").pop();
    await route.fulfill(jsonResponse({ ok: true }));
  });

  await page.goto("/good.html");

  await expect(page.getByRole("heading", { name: "Good Customers" })).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await expect(page.locator("#count")).toContainText("Showing 1-2 of 3 customers");

  await page.getByRole("searchbox").fill("Beta");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody tr")).toContainText("Good Beta");

  await page.getByRole("searchbox").fill("");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page).toHaveURL(/good\.html\?page=2$/);
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody tr")).toContainText("Good Gamma");

  await page.getByRole("button", { name: "1" }).click();
  await expect(page).toHaveURL(/good\.html\?page=1$/);
  await expect(page.locator("tbody")).toContainText("Good Alpha");

  await page.locator("tbody tr").filter({ hasText: "Good Beta" }).getByRole("button", {
    name: "Suppress",
  }).click();

  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody tr")).not.toContainText("Good Beta");
  await expect(page.locator("#count")).toContainText("Showing 1-1 of 2 customers");
});

test("suppressed customers page refreshes after unsuppress", async ({ page }) => {
  let suppressedRows = [
    customer(801, {
      customerName: "Suppressed One",
      status: "Suppressed",
      address: "801 Hidden Rd",
    }),
  ];

  await page.route(/\/api\/suppressed-customers$/, async (route) => {
    await route.fulfill(
      jsonResponse({
        ok: true,
        source: "mock",
        customers: suppressedRows,
      }),
    );
  });

  await page.route(/\/api\/suppressions\/accounts\/\d+$/, async (route) => {
    if (route.request().method() === "DELETE") {
      suppressedRows = [];
      await route.fulfill(jsonResponse({ ok: true }));
      return;
    }

    await route.continue();
  });

  await page.goto("/suppressed.html");

  await expect(page.getByRole("heading", { name: "Suppressed Customers" })).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody tr")).toContainText("Suppressed One");

  await page.getByRole("button", { name: "Unsuppress" }).click();

  await expect(page.locator("#empty")).toBeVisible();
  await expect(page.locator("#count")).toHaveText("0 customers");
});
