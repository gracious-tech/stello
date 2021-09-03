
import path from 'path'

import {PlaywrightTestConfig, test, ElectronApplication, _electron as electron,
    } from '@playwright/test'


// Extend test interface to start Electron app and use it for tests
const extended_test = test.extend<unknown, {electron_app:ElectronApplication}>({

    // Worker fixture that provides access to the Electron app (set once for whole run)
    // eslint-disable-next-line no-empty-pattern -- Playwright requires destructing first arg {}
    electron_app: [async ({}, use, worker_info) => {

        // Start the electron app
        const electron_app = await electron.launch({
            // WARN Testing AppImage requires fuse kernal stuff and therefore docker --privileged
            // TODO Change path depending on OS
            executablePath: path.join(__dirname, '../packaged/stello.AppImage'),
            // TODO Use xvfb-run to run headless
        })

        // Provide access to app in tests
        await use(electron_app)
        // NOTE Playwright will ensure app is closed when it itself ends (since is a subprocess)

    }, {scope: 'worker'}],

    // Override standard page fixture with the electron page
    page: async ({electron_app}, run) => {
        // Get the app's window (app will reopen whenever closed when testing, so always present)
        const electron_page = await electron_app.firstWindow()
        // Auto click through the welcome splashes
        await electron_page.click('button:has-text("continue")')
        await electron_page.click('.v-input--checkbox')
        await electron_page.click('button:has-text("continue")')
        // Run the test
        await run(electron_page)
        // Close page/window when done so that session data is reset (app will auto reopen)
        await electron_page.close()
    },

})
export {extended_test as test}


export default {} as PlaywrightTestConfig
