// A vite plugin that supports writing index in Pug and embedding Typescript and Sass

import path from 'path'
import {promises as fs} from 'fs'

import pug from 'pug'
import sass from 'sass'
import esbuild from 'esbuild'
import {Plugin, ResolvedConfig} from 'vite'


interface PugFilterOptions {
    // Pug always sets one option (filename) but otherwise takes from filter's attributes
    filename:undefined|string
    [attr:string]:string
}


export default function(template_path='index.pug'):Plugin{
    // Return config for plugin

    let config:ResolvedConfig
    const define_env:Record<string, string> = {}

    return {
        name: 'pug-index',

        configResolved(resolved_config){
            // Provide access to config when it's available
            config = resolved_config
            // Expose all the same env that vite does normally
            // WARN Defined values are inserted as code, not strings, hence `stringify()`
            for (const [key, val] of Object.entries(config.env)){
                define_env[`import.meta.env.${key}`] = JSON.stringify(val)
            }
        },

        transformIndexHtml: {
            // Replace default index contents with rendered pug template instead

            // Run before all core Vite plugins
            enforce: 'pre',

            async transform(html, context){
                // NOTE index.html is ignored as replacing entirely by index.pug
                // NOTE context.bundle will never be available because plugin runs 'pre' others
                const template = await fs.readFile(template_path, {encoding: 'utf-8'})
                return pug.compile(template, {
                    // NOTE pretty is deprecated and can cause bugs with dev vs prod
                    filters: {
                        sass: (text:string, options:PugFilterOptions) => {
                            // Render sass blocks
                            delete options.filename  // Don't include pug-specific config
                            return sass.renderSync({
                                data: text,
                                indentedSyntax: true,
                                outputStyle: config.isProduction ? 'compressed' : 'expanded',
                                indentWidth: 4,
                                // NOTE Below can't be `true` so give a filename
                                sourceMap: config.isProduction ? false : 'index_sass.map',
                                sourceMapEmbed: true,
                                sourceMapContents: true,
                                ...options
                            }).css.toString()
                        },
                        ts: (text:string, options:PugFilterOptions) => {
                            // Render typescript blocks
                            delete options.filename  // Don't include pug-specific config
                            return esbuild.buildSync({
                                stdin: {
                                    contents: text,
                                    loader: 'ts',
                                    resolveDir: path.join(__dirname, 'src'),
                                },
                                write: false,
                                bundle: true,
                                minify: config.isProduction,
                                define: define_env,
                                sourcemap: config.isProduction ? false : 'inline',
                                // NOTE Currently supporting es2015+ browsers
                                target: config.isProduction ? 'es2015' : 'esnext',
                                ...options,
                            }).outputFiles[0].text
                        }
                    },
                })()
            },
        },

        handleHotUpdate(context){
            // Index changed whenever pug template does, so reload page
            // NOTE filename is absolute, so first make relative
            const filename = context.file.slice(context.server.config.root.length)
            if (filename === '/index.pug'){
                context.server.ws.send({type: 'full-reload'})
            }
        },

    }
}
