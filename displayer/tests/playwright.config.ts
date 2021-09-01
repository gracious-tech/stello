
import {PlaywrightTestConfig} from '@playwright/test'


export default {
    webServer: {
        command: 'serve_displayer_dist',
        port: 8003,
        reuseExistingServer: !process.env['CI'],
    },
} as PlaywrightTestConfig
