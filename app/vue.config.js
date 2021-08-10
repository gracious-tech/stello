
const fs = require('fs')

const sass = require('sass')


module.exports = {

    publicPath: '',  // Must be relative so URLs work for file protocol

    assetsDir: '_assets',

    css: {
        extract: false,
        loaderOptions: {
            sass: {
                // Make node_modules and variables available in both components and regular files
                additionalData: require('./vue.config.injected_sass').inject,
                sassOptions: {
                    includePaths: ['node_modules'],
                },
            },
            // Disable postcss by removing default autoprefixer plugin
            // NOTE Too complicated to remove postcss itself since in many different locations
            postcss: {
                plugins: [],
            },
        },
    },

    configureWebpack: {
        devtool: 'source-map',  // Needed for vscode debug
        optimization: {
            // Don't minimize as makes debugging in prod harder and size reduction insignificant
            // WARN uglifying will break code that relies on function names
            minimize: false,
            splitChunks: false,
        },
    },

    chainWebpack: config => {

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

        // Add sass filter to pug loader
        // WARN Vue templates use pug-plain-loader
        //      But pug-loader returns template fn (rather than string) so plugin can pass in env
        config.module.rule('pug').oneOf('pug-index').before('pug-vue').test(/index\.pug$/)
                .use('pug-loader').loader('pug-loader').options({
            filters: {
                sass: (text, options) => {
                    // Render sass blocks
                    delete options.filename  // Don't include pug-specific config
                    return sass.renderSync({
                        data: text,
                        indentedSyntax: true,
                        outputStyle: 'expanded',
                        indentWidth: 4,
                        sourceMap: 'sass.map',  // Name not important and can't be `true`
                        sourceMapEmbed: true,
                        sourceMapContents: true,
                        ...options
                    }).css.toString()
                },
            }
        })

        // Customise HTML plugin
        config.plugin('html').tap(args => {
            // Load pug index template from custom location
            args[0].template = 'src/index.pug'  // Relative to project root
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
