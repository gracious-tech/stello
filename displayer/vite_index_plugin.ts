// A vite plugin that supports writing index in Pug and embedding Typescript and Sass

import path from 'path'
import {promises as fs} from 'fs'

import pug from 'pug'
import sass from 'sass'
import esbuild from 'esbuild'
import {Plugin} from 'vite'


interface PugFilterOptions {
    // Pug always sets one option (filename) but otherwise takes from filter's attributes
    filename:undefined|string
    [attr:string]:string
}


// Detect if building for production
// NOTE NODE_ENV doesn't exist when running dev server, and can't use import.meta.env
//      See https://github.com/vitejs/vite/issues/3105
const PROD = process.env.NODE_ENV === 'production'


export default function(template_path='index.pug'):Plugin{
    // Return config for plugin

    return {
        name: 'pug-index',

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
                                outputStyle: PROD ? 'compressed' : 'expanded',
                                indentWidth: 4,
                                sourceMap: PROD ? false : 'index_sass.map',  // Can't be `true`
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
                                minify: PROD,
                                // WARN Defined values are inserted as code, not strings
                                define: {
                                    'process.env.NODE_ENV': "'" + process.env.NODE_ENV + "'",
                                },
                                sourcemap: PROD ? false : 'inline',
                                // NOTE Currently supporting es2015+ browsers
                                target: PROD ? 'es2015' : 'esnext',
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
