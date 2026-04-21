const { test, expect } = require("@playwright/test");
const { mockInfrastructureList, jsonResponse } = require("./helpers/mockApi");

function infrastructureRow(id, overrides = {}) {
  return {
    inventoryItemId: id,
    deviceName: `Device ${id}`,
    status: "Good",
    ipAddresses: [`192.168.1.${id}`],
    networkSiteId: id,
    networkSiteName: `Site ${id}`,
    ...overrides,
  };
}

const infrastructurePages = [
  {
    title: "Good infrastructure page",
    path: "/infrastructure-good.html",
    endpoint: "/api/infrastructure-good",
    heading: "Good Infrastructure Equipment",
    badgeClass: "badge--good",
    row: infrastructureRow(11, { deviceName: "Tower AP", status: "Good", networkSiteName: "North Tower" }),
  },
  {
    title: "Warning infrastructure page",
    path: "/infrastructure-warning.html",
    endpoint: "/api/infrastructure-warning",
    heading: "Warning Infrastructure Equipment",
    badgeClass: "badge--warning",
    row: infrastructureRow(12, {
      deviceName: "Backhaul Radio",
      status: "Warning",
      networkSiteName: "South Tower",
    }),
  },
  {
    title: "Down infrastructure page",
    path: "/infrastructure-down.html",
    endpoint: "/api/infrastructure-down",
    heading: "Down Infrastructure Equipment",
    badgeClass: "badge--down",
    row: infrastructureRow(13, { deviceName: "Core Router", status: "Down", networkSiteName: "Core Site" }),
  },
  {
    title: "Unmonitored infrastructure page",
    path: "/infrastructure-unmonitored.html",
    endpoint: "/api/infrastructure-unmonitored",
    heading: "Unmonitored Infrastructure Equipment",
    badgeClass: "badge--neutral",
    row: infrastructureRow(14, {
      deviceName: "Legacy Switch",
      status: "Unmonitored",
      networkSiteName: "Legacy Site",
    }),
  },
];

for (const pageCase of infrastructurePages) {
  test(pageCase.title, async ({ page }) => {
    await mockInfrastructureList(page, pageCase.endpoint, [pageCase.row]);

    await page.goto(pageCase.path);

    await expect(page.getByRole("heading", { name: pageCase.heading })).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr")).toContainText(pageCase.row.deviceName);
    await expect(page.locator("tbody tr")).toContainText(pageCase.row.networkSiteName);
    await expect(page.locator("tbody tr .badge")).toHaveClass(new RegExp(pageCase.badgeClass));

    await page.getByRole("searchbox").fill(pageCase.row.networkSiteName);
    await expect(page.locator("tbody tr")).toHaveCount(1);

    await page.getByRole("searchbox").fill("missing device");
    await expect(page.locator("#empty")).toBeVisible();
  });
}

test("suppressed infrastructure page refreshes after unsuppress", async ({ page }) => {
  let suppressedRows = [
    infrastructureRow(99, {
      deviceName: "Suppressed OLT",
      status: "Suppressed",
      networkSiteName: "Hub Site",
    }),
  ];

  await page.route(/\/api\/suppressed-infrastructure$/, async (route) => {
    await route.fulfill(
      jsonResponse({
        ok: true,
        source: "mock",
        rows: suppressedRows,
      }),
    );
  });

  await page.route(/\/api\/suppressions\/infrastructure-items\/\d+$/, async (route) => {
    if (route.request().method() === "DELETE") {
      suppressedRows = [];
      await route.fulfill(jsonResponse({ ok: true }));
      return;
    }

    await route.continue();
  });

  await page.goto("/infrastructure-suppressed.html");

  await expect(page.getByRole("heading", { name: "Suppressed Infrastructure Equipment" })).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody tr")).toContainText("Suppressed OLT");

  await page.getByRole("button", { name: "Unsuppress" }).click();

  await expect(page.locator("#empty")).toBeVisible();
  await expect(page.locator("#count")).toHaveText("0 devices");
});
