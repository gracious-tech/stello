
import {join} from 'node:path'
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'original-fs'

import {app} from 'electron'


// Config file stored in OS appData dir — separate from Stello Files, so it survives user moves
const config_dir = join(app.getPath('appData'), 'stello')
const config_path = join(config_dir, 'immobile_config.json')


interface ImmobileConfig {
    files_dirs:string[]  // Any array in case want to support switching between dirs in future
}


export function read_immobile_config():string|null {
    // Read the primary saved files_dir, or null if none saved yet
    if (!existsSync(config_path))
        return null
    try {
        const json = readFileSync(config_path, {encoding: 'utf8'})
        const config = JSON.parse(json) as Partial<ImmobileConfig>
        return config.files_dirs?.[0] ?? null
    } catch {
        return null
    }
}


export function write_immobile_config(files_dir:string|null):void {
    // Save the current files_dir so Stello can find it again after a user-initiated move
    mkdirSync(config_dir, {recursive: true})
    const config:ImmobileConfig = {files_dirs: files_dir ? [files_dir] : []}
    writeFileSync(config_path, JSON.stringify(config))
}
