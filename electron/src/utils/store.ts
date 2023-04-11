// A simple means of storing state in a JSON file

import path from 'node:path'
import {readFileSync, existsSync} from 'node:fs'
import {writeFile} from 'node:fs/promises'

import {app} from 'electron'


interface StoreState {
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
let state:StoreState = {}
if (existsSync(store_path)){
    state = JSON.parse(readFileSync(store_path, 'utf8')) as StoreState
}


// Means of saving changes
async function save(){
    await writeFile(store_path, JSON.stringify(state), 'utf8')
}



// Intended to be imported as whole module
export default {state, save}
