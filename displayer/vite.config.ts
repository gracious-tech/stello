
import path from 'path'

import plugin_vue from '@vitejs/plugin-vue'
import {defineConfig} from 'vite'

import plugin_index from './vite_plugin_index'


export default defineConfig(({mode}) => {
    return {
        clearScreen: false,
        plugins: [
            plugin_index(path.join(__dirname, 'src/index.pug')),
            plugin_vue(),
        ],
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
            cssTarget: 'safari10',  // Prevent things like top/left/bottom/right -> 'inset'
        },
        optimizeDeps: {
            include: [
                'core-js/features/string/replace-all',
            ],
        },
    }
})
