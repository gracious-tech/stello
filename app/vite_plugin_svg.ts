// Vite plugin that passes any module with ?raw-svg suffix through SVGO and embeds as a string

import {promises as fs} from 'fs'

import {Plugin, ResolvedConfig} from 'vite'
import {optimize, OptimizeOptions} from 'svgo'


export default function():Plugin{

    let config:ResolvedConfig

    return {
        name: 'raw-svg',
        enforce: 'pre',

        configResolved(resolved_config){
            // Get access to config when it's ready
            config = resolved_config
        },

        async load(id:string){

            // Split path from loader query
            const [path, loader] = id.split('?', 2) as [string, string?]

            // This plugin must be specifically requested via query arg
            if (loader !== 'raw-svg'){
                return null
            }

            // Load the file contents
            let contents = await fs.readFile(path, 'utf-8')

            // Configure SVGO
            const svgo_options:OptimizeOptions = {
                plugins: [
                    // Include default plugins
                    {
                        name: 'preset-default',
                        params: {
                            overrides: {
                                // Don't remove `viewBox` as it's needed for scaling correctly
                                // NOTE Also not removing width/height as overwise svg is 100%/100%
                                removeViewBox: false,
                                // Don't merge paths as can't then style individually via CSS
                                mergePaths: false,
                                // Don't collapse groups as can use to group elements for styling
                                collapseGroups: false,
                                // Don't remove ids which can be used for styling
                                cleanupIDs: false,
                            },
                        },
                    },
                    // Extra plugins
                    'removeXMLNS',  // Unnecessary for inline SVGs
                ],
            }

            // Skip SVGO if not in production
            if (config.env['MODE'] === 'production'){
                contents = optimize(contents, svgo_options).data
            } else {
                // Just strip xml tag if dev to save time and still parse correctly
                // NOTE Might also be a comment before <svg (e.g. Inkscape)
                contents = contents.slice(contents.indexOf('<svg'))
            }

            return `export default ${JSON.stringify(contents)}`
        }
    }
}
