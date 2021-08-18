// App config script that generates data files consumed by app

const yaml = require('js-yaml')  // Couldn't get ES6 import to work
import {resolve} from 'path'
import {writeFileSync, readFileSync} from 'fs'

import {generate_theme} from './theme_generation'
import {generate_electron_package} from './apply_electron_package'


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


// Write config for app
writeFileSync(resolve(__dirname, '../app/src/app_config.json'), JSON.stringify(config))


// Displayer has only necessary properties, in case sensitive in some way
const displayer = {
    codename: config.codename,
    version: config.version,
    name: config.name,
    domain: config.domain,
    author: config.author,
}
writeFileSync(resolve(__dirname, '../displayer/src/app_config.json'), JSON.stringify(displayer))


// Generate electron package.json
const electron_package_path = resolve(__dirname, '../electron/package.json')
writeFileSync(electron_package_path,
    generate_electron_package(config, JSON.parse(readFileSync(electron_package_path, 'utf-8'))))
