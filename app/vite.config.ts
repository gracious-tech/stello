
import path from 'path'

import {defineConfig} from 'vite'
import {createVuePlugin} from 'vite-plugin-vue2'
import ViteComponents, {VuetifyResolver} from 'vite-plugin-components'
import plugin_optimize_persist from 'vite-plugin-optimize-persist'
import plugin_package_config from 'vite-plugin-package-config'

import plugin_iife from './vite_plugin_iife'
import plugin_nameless from './vite_plugin_nameless'
import plugin_index from './vite_plugin_index'
import plugin_svg from './vite_plugin_svg'


export default defineConfig(({mode}) => {

    return {
        clearScreen: false,
        base: './',  // Important when served from file:///
        publicDir: 'static',
        plugins: [
            plugin_optimize_persist(),  // Auto-manual-include modules (avoids reloads at startup)
            plugin_package_config(),  // Dependency of plugin_optimize_persist
            plugin_index('src/index.pug'),
            plugin_svg(),
            plugin_nameless(),
            createVuePlugin(),
            ViteComponents({customComponentResolvers: [VuetifyResolver()]}),
            plugin_iife(),
        ],
        resolve: {
            alias: [
                {
                    find: '@',
                    replacement: path.resolve(__dirname, 'src'),
                },
                // AWS SDK has a resolve issue due to different behaviour with Webpack vs Vite
                // See https://github.com/aws-amplify/amplify-js/issues/7499#issuecomment-890594870
                {
                    find: './runtimeConfig',
                    replacement: './runtimeConfig.browser',
                },
            ],
        },
        server: {
            fs: {
                strict: true,
            },
        },
        build: {
            target: 'esnext',
            assetsDir: '_assets',
            cssCodeSplit: false,
            // NOTE Shouldn't affect dev anyway, but plugin has a bug
            //      See https://github.com/antfu/unplugin-vue-components/issues/116
            sourcemap: mode !== 'development',  // Large, but very small once package compressed
            minify: false,  // Electron builder minifies whole package anyway, so avoid obfuscating
            polyfillModulePreload: false,  // Chrome doesn't need polyfill
            rollupOptions: {
                output: {
                    // File protocol doesn't support modules, so convert everything to an iife
                    format: 'iife',  // Make whole module self-executing fn rather than real module
                    manualChunks: () => 'everything.js',  // Hack to force all imports into one file
                },
            },
        },
    }
})
