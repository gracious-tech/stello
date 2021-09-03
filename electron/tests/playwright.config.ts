
import path from 'path'
import {URL} from 'url'

import {PlaywrightTestConfig, test, expect, Page, Response, ElectronApplication,
    _electron as electron} from '@playwright/test'


// Detect path to electron binary
let binary_path:string
if (process.platform === 'linux'){
    binary_path = '../packaged/stello.AppImage'
} else if (process.platform === 'darwin'){
    binary_path = '../packaged/mac/Stello.app/Contents/MacOS/Stello'
} else {
    binary_path = '../packaged/win-unpacked/stello.exe'
}


// Common config
const test_config_common:PlaywrightTestConfig = {
}


// Util for logging and failing on js errors
function attach_js_error_handler(page:Page){

    // Log js messages via node, and fail if any are errors
    page.on('console', msg => {
        if (msg.type() === 'error' || msg.type() === 'warning'){
            console.error(msg.text())
            throw ''  // Msg not in actual throw as throw doesn't get colored as error text
        }
    })

    // Fail if any unhandled exceptions occur
    page.on('pageerror', error => {
        console.error(`${error.name}: ${error.message}\n${error.stack ?? ''}`)
        throw ''  // Msg not in actual throw as throw doesn't get colored as error text
    })
}


// Config for running tests via a packaged Electron app
const test_config_electron:PlaywrightTestConfig = {...test_config_common}
// NOTE Type passed to extend is <test fixtures, worker fixtures>
const test_interface_electron = test.extend<
        {gotohash:(path:string)=>Promise<Response|null>}, {_electron_app:ElectronApplication}>({

    // Worker fixture that provides access to the Electron app (set once for whole run)
    // WARN Don't access this fixture within tests, as then can't run tests via port/dev server
    // eslint-disable-next-line no-empty-pattern -- Playwright requires destructing first arg {}
    _electron_app: [async ({}, use, worker_info) => {

        // Start the electron app
        const electron_app = await electron.launch({
            // WARN Testing AppImage requires fuse kernal stuff and therefore docker --privileged
            executablePath: path.join(__dirname, binary_path),
            // TODO Use xvfb-run to run headless on Linux
        })

        // Provide access to app in tests
        await use(electron_app)
        // NOTE Playwright will ensure app is closed when it itself ends (since is a subprocess)

    }, {scope: 'worker'}],

    // Override standard page fixture with the electron page
    page: async ({_electron_app}, run) => {
        // Get the app's window (app will reopen whenever closed when testing, so always present)
        const electron_page = await _electron_app.firstWindow()
        // Listen for JS errors
        attach_js_error_handler(electron_page)
        // Auto click through the welcome splashes
        await electron_page.click('button:has-text("continue")')
        await electron_page.click('.v-input--checkbox')
        await electron_page.click('button:has-text("continue")')
        // Run the test
        await run(electron_page)
        // Close page/window when done so that session data is reset (app will auto reopen)
        await electron_page.close()
    },

    gotohash: async ({page}, run) => {
        // A helper for navigating that auto-sets the base URL to whatever first loaded
        // NOTE Setting actual base url that `page.goto` uses doesn't seem to work since static
        const base_url = new URL(page.url())
        base_url.hash = ''  // Clears any existing hash, but also ensures '#' appended
        function gotohash(path:string){
            return page.goto(`${base_url}${path}`)
        }
        await run(gotohash)
    },

})


// Config for running tests via network port (serving app in development)
const test_config_port:PlaywrightTestConfig = {
    ...test_config_common,
    webServer: {
        command: 'serve_app',
        port: 8000,
        reuseExistingServer: !process.env['CI'],
    },
    projects: [
        {use: {browserName: 'chromium'}},  // WARN Chance chromium is diff version to Electron
    ],
}
const test_interface_port = test.extend<{gotohash:(path:string)=>Promise<Response|null>}>({

    // Override standard page fixture to auto click through welcome splashes
    // NOTE Must be same as Electron setup
    page: async ({page}, run) => {
        // Listen for JS errors
        attach_js_error_handler(page)
        // Click through welcome splashes
        await page.goto('http://localhost:8000')
        await page.click('button:has-text("continue")')
        await page.click('.v-input--checkbox')
        await page.click('button:has-text("continue")')
        // Run test
        await run(page)
    },

    gotohash: async ({page}, run) => {
        // Provide just to stay same as electron implementation
        await run(path => page.goto(path))
    },

})


// Test via electron app by default, but against dev server if in debug mode
export default process.env['PWDEBUG'] === '1' ? test_config_port : test_config_electron
const test_interface =
    process.env['PWDEBUG'] === '1' ? test_interface_port : test_interface_electron
export {expect, test_interface as test}
