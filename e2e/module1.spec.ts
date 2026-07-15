import { test, expect } from "@playwright/test";

/**
 * These require a real Supabase project (real auth, real RLS, real seed
 * data) reachable from wherever they run — set PLAYWRIGHT_BASE_URL and the
 * standard NEXT_PUBLIC_SUPABASE_* env vars before running. Credentials
 * below assume the dev seed data's convention (@ffc-dev.local emails) —
 * swap in your project's actual test accounts.
 */

const DEV_USER = { email: "sara.abdullah@ffc-dev.local", password: process.env.TEST_USER_PASSWORD ?? "" };
const READ_ONLY_USER = { email: "khalid.al.farsi@ffc-dev.local", password: process.env.TEST_READONLY_PASSWORD ?? "" };

test.describe("Authentication", () => {
  test("valid login redirects to dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(DEV_USER.email);
    await page.getByLabel("Password").fill(DEV_USER.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("invalid password shows an error and does not redirect", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(DEV_USER.email);
    await page.getByLabel("Password").fill("definitely-wrong");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toContainText(/incorrect email or password/i);
    await expect(page).toHaveURL(/\/login/);
  });

  test("logout returns to login and blocks further access", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(DEV_USER.email);
    await page.getByLabel("Password").fill(DEV_USER.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.getByTitle("Sign out").click();
    await expect(page).toHaveURL(/\/login/);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("an authenticated user with no valid profile lands on /access-denied, not a redirect loop", async ({ page }) => {
    // Requires a real auth.users row with no matching profiles row —
    // provision one named TEST_NO_PROFILE_USER_EMAIL/PASSWORD before running.
    test.skip(!process.env.TEST_NO_PROFILE_USER_EMAIL, "no unprovisioned test account configured");
    await page.goto("/login");
    await page.getByLabel("Email").fill(process.env.TEST_NO_PROFILE_USER_EMAIL!);
    await page.getByLabel("Password").fill(process.env.TEST_NO_PROFILE_USER_PASSWORD ?? "");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/access-denied\?reason=no-profile/);
    // The specific regression this guards: bouncing back to /login and
    // re-redirecting forever instead of settling here.
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(/\/access-denied/);
  });
});

test.describe("Shipment lifecycle", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(DEV_USER.email);
    await page.getByLabel("Password").fill(DEV_USER.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("new shipment creates a row and lands on its detail page", async ({ page }) => {
    await page.goto("/shipments/new");
    await page.getByPlaceholder("Search suppliers…").fill("BE Fresh");
    await page.getByText("BE Fresh Produce B.V.").click();
    await page.getByRole("button", { name: "Create shipment" }).click();
    await expect(page).toHaveURL(/\/shipments\/[0-9a-f-]{36}/);
    await expect(page.getByText("BE Fresh Produce B.V.")).toBeVisible();
  });

  test("read-only role cannot see the New Shipment button", async ({ page }) => {
    await page.getByTitle("Sign out").click();
    await page.getByLabel("Email").fill(READ_ONLY_USER.email);
    await page.getByLabel("Password").fill(READ_ONLY_USER.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.goto("/shipments");
    await expect(page.getByRole("link", { name: "New Shipment" })).not.toBeVisible();
  });
});

test.describe("Register", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(DEV_USER.email);
    await page.getByLabel("Password").fill(DEV_USER.password);
    await page.getByRole("button", { name: "Sign in" }).click();
  });

  test("a filter-syntax-like search string does not error or alter the query", async ({ page }) => {
    await page.goto("/shipments");
    await page.getByPlaceholder(/search ref, awb, supplier/i).fill("%,,)) OR 1=1 --");
    await page.keyboard.press("Enter");
    // Should render a normal (possibly empty) results table, not a 500.
    await expect(page.getByRole("table")).toBeVisible();
  });

  test("an invalid status URL param is ignored rather than erroring", async ({ page }) => {
    await page.goto("/shipments?status=NotARealStatus");
    await expect(page.getByRole("table")).toBeVisible();
  });
});
