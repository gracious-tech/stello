
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
                    manualChunks: undefined,  // Don't split vendor code out
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
