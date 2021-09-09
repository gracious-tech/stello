
import path from 'path'

import plugin_vue from '@vitejs/plugin-vue'
import {defineConfig} from 'vite'

import plugin_index from './vite_plugin_index'


export default defineConfig(({mode}) => {
    return {
        clearScreen: false,
        plugins: [plugin_index(path.join(__dirname, 'src/index.pug')), plugin_vue()],
        resolve: {
            alias: [
                {
                    find: '@',
                    replacement: path.resolve(__dirname, 'src'),
                },
            ],
        },
        server: {
            fs: {
                strict: true,
            },
        },
        build: {
            target: 'es2015',  // Currently supporting browsers ES2015+
            rollupOptions: {
                output: {
                    manualChunks: () => 'everything.js',  // Hack to force all imports into one file
                },
            },
        },
        optimizeDeps: {
            include: [
                'core-js/features/string/replace-all',
            ],
        },
    }
})
