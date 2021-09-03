
import path from 'path'

import {PlaywrightTestConfig, test, Page, ElectronApplication, _electron as electron,
    } from '@playwright/test'


// Util for logging and failing on js errors
function attach_js_error_handler(page:Page){

    // Setup a tracker obj that can be updated after returning to caller
    const js_tracker = {success: true}

    // Util for failing and logging the error
    const fail = (msg:string) => {
        console.error(msg)
        js_tracker.success = false
    }

    // Log js messages via node, and fail if any are errors
    page.on('console', msg => {
        if (msg.type() === 'error'){
            fail(msg.text())
        } else {
            console.log(msg.text())
        }
    })

    // Fail if any unhandled exceptions occur
    page.on('pageerror', error => {
        fail(`${error.name}: ${error.message}\n${error.stack ?? ''}`)
    })

    // Return tracker to caller
    return js_tracker
}


// Config for running tests via a packaged Electron app
const test_config_electron:PlaywrightTestConfig = {}
const test_interface_electron = test.extend<unknown, {electron_app:ElectronApplication}>({

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
        // Listen for JS errors
        const tracker = attach_js_error_handler(electron_page)
        // Auto click through the welcome splashes
        await electron_page.click('button:has-text("continue")')
        await electron_page.click('.v-input--checkbox')
        await electron_page.click('button:has-text("continue")')
        // Run the test
        await run(electron_page)
        // Throw if any JS errors occured while testing
        if (!tracker.success){
            throw new Error()  // TODO Shows a 404 message rather than actual error
        }
        // Close page/window when done so that session data is reset (app will auto reopen)
        await electron_page.close()
    },

})


// Config for running tests via network port (serving app in development)
const test_config_port:PlaywrightTestConfig = {
    webServer: {
        command: 'serve_app',
        port: 8000,
        reuseExistingServer: !process.env['CI'],
    },
    projects: [
        {use: {browserName: 'chromium'}},  // WARN Chance chromium is diff version to Electron
    ],
}
const test_interface_port = test.extend({

    // Override standard page fixture to auto click through welcome splashes
    // NOTE Must be same as Electron setup
    page: async ({page}, run) => {
        // Listen for JS errors
        const tracker = attach_js_error_handler(page)
        // Click through welcome splashes
        await page.goto('http://localhost:8000')
        await page.click('button:has-text("continue")')
        await page.click('.v-input--checkbox')
        await page.click('button:has-text("continue")')
        // Run test
        await run(page)
        // Throw if any JS errors occured while testing
        if (!tracker.success){
            throw new Error()  // TODO Shows a 404 message rather than actual error
        }
    },

})


// Test via electron app by default, but against dev server if in debug mode
export default process.env['PWDEBUG'] === '1' ? test_config_port : test_config_electron
const test_interface =
    process.env['PWDEBUG'] === '1' ? test_interface_port : test_interface_electron
export {test_interface as test}
