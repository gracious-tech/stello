// App config script that generates data files consumed by app

const yaml = require('js-yaml')  // Couldn't get ES6 import to work
import {resolve} from 'path'
import {writeFileSync, readFileSync} from 'fs'

import {generate_theme} from './theme_generation'


// Determine branding
const branding = 'stello'  // process.argv[2]


// Helper for getting config files as objects
function get_config(name:string):any{
    return yaml.load(readFileSync(resolve(__dirname, `${name}.yaml`)))
}


// Import config
const config = get_config('app_config')


// Apply branding specific configs over base config
Object.assign(config, get_config(`app_config_${branding}`))


// Generate colors from codes
generate_theme(config)


// Write config for app and electron
writeFileSync(resolve(__dirname, '../app/src/app_config.json'), JSON.stringify(config))
writeFileSync(resolve(__dirname, '../electron/app_config.json'), JSON.stringify(config))


// Displayer has only necessary properties, in case sensitive in some way
const displayer = {
    codename: config.codename,
    version: config.version,
    name: config.name,
    domain: config.domain,
    author: config.author,
}
writeFileSync(resolve(__dirname, '../displayer/src/app_config.json'), JSON.stringify(displayer))
