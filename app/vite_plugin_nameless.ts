// Vite plugin that corrects definition of nameless classes
// See https://github.com/underfin/vite-plugin-vue2/issues/119

import path from 'path'

import {Plugin} from 'vite'


export default function():Plugin{

    return {
        name: 'nameless-classes',

        transform(code:string, id:string){

            if (!id.endsWith('.vue')){
                return null  // Only applicable to regular vue file imports
            }

            // Form class name from cleaned filename
            let class_name = id.split(path.sep).pop()
                .slice(0, '.vue'.length * -1)
                .replace(/[^a-zA-Z]/g, '')

            // Replace anonymous export with named export
            code = code.replace('export default class extends Vue',
                `export default class ${class_name} extends Vue`)

            // Return code and no map (since line numbers don't change, just column)
            return {
                code,
                map: null,
            }
        }
    }
}
