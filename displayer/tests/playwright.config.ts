
import path from 'path'

import {PlaywrightTestConfig} from '@playwright/test'


export default {
    webServer: {
        command: path.join(__dirname, '../../.bin/serve_displayer_dist'),
        port: 8003,
        reuseExistingServer: !process.env['CI'],
    },
    projects: [
        // WARN Without name, cannot identify which browser failed
        {use: {browserName: 'chromium'}, name: 'chromium'},
        {use: {browserName: 'firefox'}, name: 'firefox'},
        {use: {browserName: 'webkit'}, name: 'wekbit'},
        // TODO Resolve webkit issues https://github.com/microsoft/playwright/issues/8578
    ],
} as PlaywrightTestConfig
