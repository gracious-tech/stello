
// Playwright config for app E2E tests (runs app in a plain browser via its dev server)

import path from 'path'

import {defineConfig} from '@playwright/test'


export default defineConfig({
    testDir: './e2e',
    outputDir: './test-results',
    timeout: 60 * 1000,
    expect: {timeout: 15 * 1000},
    fullyParallel: true,
    retries: process.env['CI'] ? 1 : 0,
    globalSetup: './e2e/coverage_setup.ts',
    globalTeardown: './e2e/coverage_teardown.ts',
    webServer: {
        // NOTE Dev server (rather than build) so coverage maps to individual source files
        command: path.join(__dirname, '../../.bin/serve_app'),
        port: 8000,
        reuseExistingServer: !process.env['CI'],
        timeout: 120 * 1000,
    },
    use: {
        baseURL: 'http://localhost:8000/',
        viewport: {width: 1280, height: 900},
        trace: 'retain-on-failure',
    },
    projects: [
        // NOTE Only Chromium supports JS coverage (and app only ever runs in Electron's Chromium)
        {use: {browserName: 'chromium'}, name: 'chromium'},
    ],
})
