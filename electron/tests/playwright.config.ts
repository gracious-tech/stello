
import path from 'path'

import {PlaywrightTestConfig, test, _electron as electron, Page} from '@playwright/test'


// Extend test interface to start Electron app and use it for tests
const extended_test = test.extend<unknown, {electron_page:Page}>({

    // Worker fixture that provides access to the Electron app's page (set once for whole run)
    // eslint-disable-next-line no-empty-pattern -- Playwright requires destructing first arg {}
    electron_page: [async ({}, use, worker_info) => {

        // Start the electron app
        const electron_app = await electron.launch({
            // WARN Testing AppImage requires fuse kernal stuff and therefore docker --privileged
            // TODO Change path depending on OS
            executablePath: path.join(__dirname, '../packaged/stello.AppImage'),
            // TODO Use xvfb-run to run headless
        })

        // Provide the window/page to tests
        // NOTE Single window used for all tests to stay close to actual app which forbids multiple
        await use(await electron_app.firstWindow())

        // Close app when done
        await electron_app.close()

    }, {scope: 'worker'}],

    // Override standard page fixture with the electron page
    page: async ({electron_page}, run) => {
        // Ensure each test begins from root route
        await electron_page.goto(electron_page.url().split('#')[0]! + '#/')
        await run(electron_page)
    },

})
export {extended_test as test}


export default {} as PlaywrightTestConfig
