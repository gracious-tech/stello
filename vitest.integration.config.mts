// Vitest config for integration tests that run against real AWS services in the sandbox account
// WARN Only run via .bin/audit_integration (which ensures sandbox credentials are used)

import path from 'path'

import {defineConfig, loadEnv} from 'vite'

import {plugin_app_stubs, plugin_raw_svg} from './vitest.config.mts'


// Helper for resolving paths relative to project root
const root = (...parts:string[]) => path.resolve(import.meta.dirname, ...parts)


export default defineConfig({
    plugins: [plugin_raw_svg(), plugin_app_stubs()],
    resolve: {
        alias: [
            {find: '@', replacement: root('app/src')},
        ],
    },
    test: {
        name: 'integration',
        root: root('app/src'),
        include: ['**/*.integration.ts'],
        exclude: ['**/node_modules/**', 'shared/**'],
        environment: 'node',
        setupFiles: [root('app/tests/unit_setup.ts'), root('app/tests/integration_setup.ts')],
        // Hosted config (pools, domains, api) comes from app's dev env (points at sandbox)
        env: loadEnv('development', root('app'), 'VITE_'),
        // Creating real AWS services (IAM propagation, Lambda, API Gateway) is slow
        testTimeout: 10 * 60 * 1000,
        hookTimeout: 10 * 60 * 1000,
    },
})
