// Vite plugin that removes the module attributes from scripts for use with file protocol

import {Plugin} from 'vite'


export default function():Plugin{

    return {
        name: 'iife',
        apply: 'build',
        enforce: 'post',

        transformIndexHtml(html){
            // This stops the browser treating the <script> like a module
            return html.replace(' type="module" crossorigin ', ' ')
        }
    }
}
