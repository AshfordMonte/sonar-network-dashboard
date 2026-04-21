const { test, expect } = require("@playwright/test");
const { mockStatusSummary } = require("./helpers/mockApi");

test("overview renders live counts and links to primary detail pages", async ({ page }) => {
  await mockStatusSummary(page, {
    infrastructureEquipment: {
      good: 11,
      warning: 3,
      unmonitored: 2,
      down: 1,
      total: 17,
    },
    customerEquipment: {
      good: 1204,
      warning: 12,
      uninventoried: 5,
      down: 8,
      total: 1229,
    },
    tickets: {
      open: 4,
    },
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Network Overview" })).toBeVisible();
  await expect(page.locator("#infra-good")).toHaveText("11");
  await expect(page.locator("#infra-warning")).toHaveText("3");
  await expect(page.locator("#infra-uninventoried")).toHaveText("2");
  await expect(page.locator("#infra-down")).toHaveText("1");
  await expect(page.locator("#cust-good")).toHaveText("1,204");
  await expect(page.locator("#cust-warning")).toHaveText("12");
  await expect(page.locator("#cust-uninventoried")).toHaveText("5");
  await expect(page.locator("#cust-down")).toHaveText("8");
  await expect(page.locator("#tickets-open")).toHaveText("4");

  await expect(page.locator('a[href="/good.html"]')).toBeVisible();
  await expect(page.locator('a[href="/warning.html"]')).toBeVisible();
  await expect(page.locator('a[href="/uninventoried.html"]')).toBeVisible();
  await expect(page.locator('a[href="/down.html"]')).toBeVisible();
  await expect(page.locator('a[href="/infrastructure-good.html"]')).toBeVisible();
  await expect(page.locator('a[href="/infrastructure-warning.html"]')).toBeVisible();
  await expect(page.locator('a[href="/infrastructure-unmonitored.html"]')).toBeVisible();
  await expect(page.locator('a[href="/infrastructure-down.html"]')).toBeVisible();
  await expect(page.locator("#api-status")).toHaveText("API: Connected");
});
