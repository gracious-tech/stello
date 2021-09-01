
import {PlaywrightTestConfig} from '@playwright/test'


export default {
    webServer: {
        command: 'serve_displayer_dist',
        port: 8003,
        reuseExistingServer: !process.env['CI'],
    },
    projects: [
        {use: {browserName: 'chromium'}},
        {use: {browserName: 'firefox'}},
        // TODO Resolve webkit issues https://github.com/microsoft/playwright/issues/8578
    ],
} as PlaywrightTestConfig
