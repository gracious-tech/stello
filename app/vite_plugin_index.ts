// A vite plugin that supports writing index in Pug and embedding Typescript and Sass
// WARN Do not use __dirname etc in this file since it is symlinked and node resolves symlinks :/

import path from 'path'
import {readFileSync} from 'fs'

import pug from 'pug'
import sass from 'sass'
import esbuild from 'esbuild'
import {Plugin, ResolvedConfig} from 'vite'


export default function(template_path:string):Plugin{
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
                const template = readFileSync(template_path, {encoding: 'utf-8'})
                return pug.compile(template, {
                    // NOTE pretty is deprecated and can cause bugs with dev vs prod
                    // WARN Filters cannot be async
                    filters: {

                        sass: (text:string, options:Record<string, unknown>) => {
                            // Render sass blocks
                            delete options['filename']  // Don't include pug-specific config
                            return sass.renderSync({
                                data: text,
                                indentedSyntax: true,
                                outputStyle: config.isProduction ? 'compressed' : 'expanded',
                                indentWidth: 4,
                                // NOTE Below can't be `true` so give a filename
                                sourceMap: config.isProduction ? false : 'index_sass.map',
                                sourceMapEmbed: true,
                                sourceMapContents: true,
                                ...options,
                            }).css.toString()
                        },

                        ts_embed: (ts_path:string, options:Record<string, unknown>) => {
                            // Expects a file path as contents and embeds the Typescript found
                            // NOTE This allows type checking the embedded code
                            // WARN ts_path must be absolute due to Node resolving symlinks

                            // Resolve paths relative to the pug template file
                            const template_dir = path.join(template_path, '../')

                            // Load the code the path points to
                            ts_path = path.join(template_dir, ts_path.trim())
                            const code = readFileSync(ts_path, {encoding: 'utf-8'})

                            // Remove pug-included options so only ESBuild options remain
                            delete options['filename']

                            // Return processed js to embed in the HTML
                            return esbuild.buildSync({
                                stdin: {
                                    contents: code,
                                    loader: 'ts',
                                    resolveDir: path.join(ts_path, '../'),
                                },
                                write: false,
                                bundle: true,
                                minify: config.isProduction,
                                define: define_env,
                                sourcemap: config.isProduction ? false : 'inline',
                                // NOTE Currently supporting es2015+ browsers
                                target: config.isProduction ? 'es2015' : 'esnext',
                                ...options,
                            }).outputFiles[0]?.text
                        },

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
