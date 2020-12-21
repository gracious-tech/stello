
const fs = require('fs')


module.exports = {

    publicPath: '',  // Must be relative so URLs work for file protocol

    assetsDir: '_assets',

    /* NOTE Despite Vuetify saying this setting is only need for IE11 support, in fact Vuetify also
        uses object = {...object} syntax which is an ES2018 feature!
        Vue CLI is configured to not apply babel to node_modules, so must tell it to here.
    */
    transpileDependencies: ['vuetify'],  // NOTE Doesn't seem to affect build time

    css: {

        // Embed CSS in JS so downloading it doesn't block first paint (progress wheel)
        extract: false,

        loaderOptions: {
            sass: {
                // Make node_modules and variables available in both components and regular files
                additionalData: require('./vue.config.injected_sass').inject,
                sassOptions: {
                    includePaths: ['node_modules'],
                },
            },
        },
    },

    configureWebpack: {
        devtool: 'source-map',  // Needed for vscode debug
        optimization: {
            // Webpack by default outputs common modules (for index & app) to a separate file
            // This causes index JS to wait for the "vendors" chunk before executing
            // This happens even if index and app JS have nothing in common, so must be disabled
            // TODO index JS is still mostly just unnecessary webpack module stuff (remove somehow?)
            splitChunks: false,
        },
    },

    chainWebpack: config => {

        // Add entry file for index script
        config.entry('index').add('@/index/index.ts')

        // Default to loading svg files as strings (instead of separate files)
        config.module.rule('svg').uses.clear()
        config.module.rule('svg').use('raw-loader').loader('raw-loader')

        // Before loading, cleanup SVGs (to make inline compatible, not just optimisation)
        config.module.rule('svg').use('svgo-loader').loader('svgo-loader').options({
            // These are in addition to the defaults
            plugins: [
                // Unnecessary for inline SVGs
                {'removeXMLNS': true},
                // Don't remove `viewBox` as it's needed for scaling correctly
                // NOTE Also not removing width/height as overwise svg is 100%/100%
                {'removeViewBox': false},
                // Don't merge paths as can't then style individually via CSS
                {'mergePaths': false},
                // Don't collapse groups as can use to group elements for styling
                {'collapseGroups': false},
                // Don't remove ids which can be used for styling
                {'cleanupIDs': false},
            ],
        })

        // Write i18n data in YAML
        config.module.rule('i18n').use('yaml').loader('yaml-loader')

        // Customise HTML plugin
        config.plugin('html').tap(args => {
            // Load pug index template from custom location
            // WARN Cannot use pug-plain-loader and must use !loader! syntax
            //      The html plugin looks for '!' and changes its behaviour if found
            //      pug-loader returns template fn (rather than string) so plugin can pass in env
            args[0].template = '!!pug-loader!src/index/index.pug'  // Relative to project root
            args[0].templateParameters = (compilation, assets, assetTags, options) => {
                // Extend default vars available in template
                // NOTE These end up with names different to what docs describe but still all there
                //      See `templateParametersGenerator` in source code for details
                return {
                    compilation, assets, assetTags, options,  // Provide all defaults
                    // Own additions
                    node_env: process.env.NODE_ENV,
                    app_config: JSON.parse(fs.readFileSync('src/app_config.json')),
                }
            }
            return args
        })

        // Copy files from static folder
        // NOTE This basically just renames `public` to `static`, but not able to override default
        config.plugin('copy').use(require('copy-webpack-plugin'), [[{from: 'static'}]])

        // Production specific
        if (process.env.NODE_ENV !== 'development'){
            // Prevent inlined index assets from getting emitted as separate files as well
            const match_emit_inlined = /^_assets\/(js|css)\/index\./
            config.plugin('ignore-emit').use(require('ignore-emit-webpack-plugin'),
                [match_emit_inlined])
        }
    },

    pluginOptions: {
        // NOTE These configure Webpack, while any config in main.ts is runtime only
        i18n: {
            locale: 'en',
            fallbackLocale: 'en',
            localeDir: 'locales',
            enableInSFC: true,
        },
    },

}
