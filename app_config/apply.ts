// App config script that generates data files consumed by app

import yaml from 'js-yaml'
import {resolve} from 'path'
import {writeFileSync, readFileSync} from 'fs'

import {generate_theme} from './theme_generation.ts'
import type {AppConfig} from './types.ts'


// Determine branding
const branding = 'stello'  // process.argv[2]


// Helper for getting config files as objects
function get_config(name:string){
    const raw_yaml = readFileSync(resolve(import.meta.dirname, `${name}.yaml`), {encoding: 'utf-8'})
    return yaml.load(raw_yaml) as AppConfig
}


// Import config
const config = get_config('app_config')


// Apply branding specific configs over base config
Object.assign(config, get_config(`app_config_${branding}`))


// Generate colors from codes
generate_theme(config)


// Write config for app and electron
writeFileSync(resolve(import.meta.dirname, '../app/src/app_config.json'), JSON.stringify(config))
writeFileSync(resolve(import.meta.dirname, '../electron/app_config.json'), JSON.stringify(config))


// Displayer has only necessary properties, in case sensitive in some way
const displayer = {
    codename: config.codename,
    version: config.version,
    name: config.name,
    domain: config.domain,
    author: config.author,
}
writeFileSync(
    resolve(import.meta.dirname, '../displayer/src/app_config.json'), JSON.stringify(displayer))
