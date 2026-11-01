
// Vitest config for unit tests across the whole project (each subproject is a separate project)
// NOTE App Vue components (Vue 2) are covered by Playwright E2E instead (see app/tests)

import path from 'path'
import {readFileSync} from 'fs'
import {createRequire} from 'module'

import plugin_vue from '@vitejs/plugin-vue'
import {defineConfig} from 'vitest/config'

import type {Plugin} from 'vite'


// Helper for resolving paths relative to project root
const root = (...parts:string[]) => path.resolve(import.meta.dirname, ...parts)


// Require modules from displayer's own node_modules
const displayer_require = createRequire(root('displayer/package.json'))


// Minimal version of app's raw-svg plugin (just embeds svg contents as string)
export function plugin_raw_svg():Plugin{
    return {
        name: 'raw-svg',
        enforce: 'pre',
        load(id:string){
            const [file_path, loader] = id.split('?', 2) as [string, string?]
            if (loader !== 'raw-svg'){
                return null
            }
            const contents = readFileSync(file_path, 'utf-8')
            return `export default ${JSON.stringify(contents.slice(contents.indexOf('<svg')))}`
        },
    }
}


// Stub app imports that can't be loaded outside of the app's own Vite 2 build
// NOTE Vue 2 components are tested via E2E, so services only need a placeholder object
export function plugin_app_stubs():Plugin{
    return {
        name: 'app-stubs',
        enforce: 'pre',
        resolveId(id:string){
            // Redirect special queries to virtual modules so other plugins don't process them
            const query = id.split('?', 2)[1]
            if (query === 'inline' || query === 'worker'){
                return `\0stub-${query}`
            }
            return null
        },
        load(id:string){
            if (id === '\0stub-inline'){
                return 'export default ""'
            }
            if (id === '\0stub-worker'){
                return 'export default class StubWorker {postMessage(){} terminate(){}}'
            }
            const file_path = id.split('?', 2)[0]!
            if (file_path.endsWith('.vue')){
                const name = path.basename(file_path, '.vue')
                return `export default {name: ${JSON.stringify(name)}, render(){return null}}`
            }
            return null
        },
    }
}


// Skip SFC style blocks as styles aren't tested (and displayer's old sass is incompatible)
function plugin_skip_styles():Plugin{
    return {
        name: 'skip-styles',
        enforce: 'pre',
        resolveId(id:string){
            return id.includes('?vue&type=style') || /\.s[ac]ss$/.test(id) ? '\0stub-style' : null
        },
        load(id:string){
            return id === '\0stub-style' ? 'export default {}' : null
        },
    }
}


// Allow loading deps via symlinked node_modules (e.g. mutation testing's worktree)
// NOTE Only affects serving modules to tests, so no security concern
const test_server = {fs: {strict: false}}


export default defineConfig({
    test: {
        coverage: {
            provider: 'v8',
            reportOnFailure: true,  // Tests for known bugs fail on purpose (see docs/test_bugs.md)
            reportsDirectory: root('coverage/unit'),
            reporter: ['text-summary', 'html', 'json-summary', 'json'],
            include: [
                'app/src/services/**/*.ts',
                'app_config/*.ts',
                'displayer/src/**/*.{ts,vue}',
                'electron/src/**/*.ts',
                'host/accounts/src/**/*.ts',
            ],
            exclude: [
                '**/*.test.ts',
                '**/*.test_utils.ts',
                '**/*.d.ts',
                '**/types.ts',
                '**/native_types.ts',
                'electron/src/app/**',  // Built copy of app
                'displayer/src/services/utils/**',  // Symlink to app's utils
                'displayer/src/locales/**',
            ],
        },
        projects: [

            // App services (Vue 2 components are covered by E2E)
            {
                plugins: [plugin_raw_svg(), plugin_app_stubs()],
                server: test_server,
                resolve: {
                    alias: [
                        {find: '@', replacement: root('app/src')},
                    ],
                },
                test: {
                    name: 'app',
                    root: root('app/src'),
                    include: ['**/*.test.ts'],
                    exclude: ['**/node_modules/**', 'shared/**'],  // Symlink tested by displayer
                    environment: 'node',
                    setupFiles: [root('app/tests/unit_setup.ts')],
                },
            },

            // Displayer services and components (Vue 3)
            {
                // Use displayer's own SFC compiler so it can find displayer's pug dependency
                plugins: [plugin_skip_styles(), plugin_vue({compiler: displayer_require(
                    '@vue/compiler-sfc') as NonNullable<Parameters<typeof plugin_vue>[0]>['compiler'],
                })],
                server: test_server,
                resolve: {
                    alias: [
                        {find: '@', replacement: root('displayer/src')},
                        // Share a single Vue instance with @vue/test-utils (root node_modules)
                        {find: /^vue$/, replacement: root('node_modules/vue')},
                    ],
                },
                test: {
                    name: 'displayer',
                    root: root('displayer/src'),
                    include: ['**/*.test.ts'],
                    exclude: ['**/node_modules/**', 'services/utils/**'],  // Symlink tested by app
                    environment: 'happy-dom',
                    setupFiles: [root('displayer/tests/unit_setup.ts')],
                },
            },

            // Electron main process
            {
                resolve: {
                    alias: [
                        // Electron's unpatched fs is only available inside Electron itself
                        {find: /^(node:)?original-fs$/, replacement: 'fs'},
                    ],
                },
                test: {
                    name: 'electron',
                    root: root('electron/src'),
                    include: ['**/*.test.ts'],
                    environment: 'node',
                },
            },

            // Host account management lambdas
            {
                test: {
                    name: 'host',
                    root: root('host/accounts/src'),
                    include: ['**/*.test.ts'],
                    environment: 'node',
                },
            },

            // App config generation
            {
                test: {
                    name: 'app_config',
                    root: root('app_config'),
                    include: ['**/*.test.ts'],
                    environment: 'node',
                },
            },
        ],
    },
})
