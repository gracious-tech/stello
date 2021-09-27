
import {readFileSync, writeFileSync} from 'fs'


// Read in base template
let template = readFileSync('template_base.yml', {encoding: 'utf-8'})


// Generate list of expiry rules for each lifespan
// NOTE tag value should never be 0, but it is included just to be double safe
const rules = []
for (let n=0; n <= 365*2; n++){
    rules.push(
        `{Status: Enabled, TagFilters: [{Key: stello-lifespan, Value: '${n}'}], ExpirationInDays: ${n}},`)
}


// Amazon doesn't accept 0 as a value, so replace with 1 (still much better than not expiring!)
rules[0] = rules[0]!.replace('ExpirationInDays: 0', 'ExpirationInDays: 1')


// Insert the rules into base template
template = template.replace('MESSAGE_EXPIRY_RULES', rules.join('\n'))


// Insert the current version
const app_config = readFileSync('../electron/app_config.json', {encoding: 'utf-8'})
const version = (JSON.parse(app_config) as {version:string}).version
template = template.replace('INPUT_VERSION', `"${version}"`)


// Save to actual template file
writeFileSync('template.yml', template, {encoding: 'utf-8'})
