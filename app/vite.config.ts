
import path from 'path'

import {defineConfig} from 'vite'
import {createVuePlugin} from 'vite-plugin-vue2'
import ViteComponents, {VuetifyResolver} from 'vite-plugin-components'

import plugin_class from './vite_class_plugin'
import plugin_index from '../vite_index_plugin'
import plugin_svg from '../vite_svg_plugin'


export default defineConfig(({mode}) => {

    return {
        clearScreen: false,
        publicDir: 'static',
        plugins: [
            plugin_index(),
            plugin_svg(),
            plugin_class(),
            createVuePlugin(),
            ViteComponents({customComponentResolvers: [VuetifyResolver()]}),
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
        css: {
            preprocessorOptions: {
                sass: {
                    // Make node_modules & variables available in both components and regular files
                    additionalData: require('./vite.config.injected_sass').inject,
                    sassOptions: {
                        includePaths: ['node_modules'],
                    },
                },
            },
        },
        build: {
            target: 'esnext',
            assetsDir: '_assets',
            cssCodeSplit: false,
            sourcemap: true,
            minify: false,
            rollupOptions: {
                output: {
                    manualChunks: undefined,  // Don't split vendor code out
                },
            },
        },
    }
})
