
import plugin_vue from '@vitejs/plugin-vue'
import {defineConfig, loadEnv} from 'vite'

import plugin_index from './vite_index_plugin'


export default defineConfig(({mode}) => {

    // Make VITE_ env vars available during config/plugins rather than just src files
    Object.assign(process.env, loadEnv(mode, process.cwd()))

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
