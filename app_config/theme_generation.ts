// Theme generator

const chroma = require('chroma-js')  // Couldn't get ES6 import to work
import {colors} from './colors'


export function generate_theme(config){
    // Generate a theme from the given base colors
    config.theme = {}
    for (const [key, codes] of Object.entries(config.theme_codes)){
        config.theme[key] = colors[codes[0]][codes[1]]
    }
    add_variations(config.theme)
}


function add_variations(theme){
    // Generate all required theme colors from given base colors

    // Add darker/lighter variants
    // NOTE Uses same library as the official Material color tool
    for (const [key, val] of Object.entries(theme)){
        theme[`${key}_lighter`] = chroma(val).brighten().hex()
        theme[`${key}_darker`] = chroma(val).darken().hex()
    }

    // Possible text colors on colored backgrounds in order of preference (preferring dark theme)
    // NOTE 87% alpha is spec for both light/dark themes
    // NOTE Using rgba() since Chrome 57-61 doesn't support #rgba
    const text_colors = ['rgba(255, 255, 255, 0.87)', 'rgba(255, 255, 255, 1)',
        'rgba(0, 0, 0, 0.87)', 'rgba(0, 0, 0, 1)']

    // Add on_ text colors for all color variants when used as backgrounds
    for (const [key, bg_color] of Object.entries(theme)){
        for (const text_color of text_colors){
            theme[`on_${key}`] = text_color
            // NOTE Min 3 contrast recommended for large text
            if (chroma.contrast(bg_color, text_color) >= 3){
                break
            }
        }
    }
}
