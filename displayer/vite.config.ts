
import plugin_vue from '@vitejs/plugin-vue'
import {defineConfig} from 'vite'

import plugin_index from './vite_plugin_index'


export default defineConfig(({mode}) => {
    return {
        plugins: [plugin_index(), plugin_vue()],
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
