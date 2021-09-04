
import path from 'path'

import {PlaywrightTestConfig} from '@playwright/test'


export default {
    webServer: {
        command: path.join(__dirname, '../../.bin/serve_displayer_dist'),
        port: 8003,
        reuseExistingServer: !process.env['CI'],
    },
    projects: [
        {use: {browserName: 'chromium'}},
        {use: {browserName: 'firefox'}},
        {use: {browserName: 'webkit'}},
        // TODO Resolve webkit issues https://github.com/microsoft/playwright/issues/8578
    ],
} as PlaywrightTestConfig
