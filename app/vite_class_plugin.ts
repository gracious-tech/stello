// Vite plugin that corrects definition of nameless classes
// See https://github.com/underfin/vite-plugin-vue2/issues/119

import {Plugin} from 'vite'


export default function():Plugin{

    return {
        name: 'nameless-classes',

        transform(code:string, id:string){

            if (!id.endsWith('.vue')){
                return null  // Only applicable to regular vue file imports
            }

            return code.replace('export default class extends Vue',
                'export default class ViteNamelessPluginClass extends Vue')
        }
    }
}
