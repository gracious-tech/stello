// A simple means of storing state in a JSON file

import path from 'node:path'
import {readFileSync, existsSync, writeFileSync} from 'node:fs'

import {app} from 'electron'


interface StoreState {
    version:string
    window_bounds?: {
        x:number
        y:number
        width:number
        height:number
    }
    window_maximized?:boolean
}


// Load initial state
const store_path = path.join(app.getPath('userData'), 'stello_store.json')
let state:StoreState = {version: app.getVersion()}
if (existsSync(store_path)){
    try {
        state = {
            ...state,
            ...JSON.parse(readFileSync(store_path, 'utf8')) as StoreState,
        }
    } catch {
        // If file is corrupted for some reason, overwrite it
        save()
    }
} else {
    save()
}


// Means of saving changes
function save(){
    // WARN This must be sync or will end up with an empty file if app exits before finishing write
    writeFileSync(store_path, JSON.stringify(state), 'utf8')
}



// Intended to be imported as whole module
export default {state, save}
