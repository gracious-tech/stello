
// Splash screens shown on first run, and the dashboard

import {test, expect, wait_for_app} from './fixtures'


test('first run shows welcome then disclaimer then dashboard', async ({page, app}) => {
    // Fresh install starts with the welcome splash
    await page.goto('/')
    await wait_for_app(page)
    await expect(page.getByText("A new way to send newsletters")).toBeVisible()
    await page.getByRole('button', {name: "Continue"}).click()

    // Disclaimer must be agreed to
    await expect(page.getByText("A balance of")).toBeVisible()
    await page.getByRole('button', {name: "I agree to both"}).click()

    // Dashboard then shows with sidebar
    await expect(page.getByText(/Version \d/)).toBeVisible()
    await expect(page.locator('.v-navigation-drawer, nav').first()).toBeVisible()
})


test('seeded data shows on dashboard', async ({page, app}) => {
    // Seed everything then view dashboard
    await app.open()
    await expect(page.getByText(/Version \d/)).toBeVisible()
    await expect(page.getByText("Requests to subscribe")).toBeVisible()
})
