
// Script for creating a new release (updates version throughout project)

import {execSync} from 'child_process'
import {readFileSync, writeFileSync} from 'fs'
import {createInterface} from 'readline'


// Run a shell command and return its stdout
const run = (cmd:string) => execSync(cmd, {encoding: 'utf8'})

// Run a shell command with output inherited (visible to user)
const run_visible = (cmd:string) => execSync(cmd, {stdio: 'inherit'})


// Ensure no uncommitted changes
if (run('git status --porcelain').trim()) {
    console.error('Uncommitted changes present')
    process.exit(1)
}

// Ensure on master branch
if (!run('git status --branch --porcelain').startsWith('## master')) {
    console.error('Must be on master branch')
    process.exit(1)
}

// Ensure changes since last release
if (run('git tag --points-at HEAD').trim()) {
    console.error('No changes since last release')
    process.exit(1)
}

// Load app config and extract current version
const app_config_path = 'app_config/app_config.yaml'
const app_config = readFileSync(app_config_path, 'utf8')
const prev_version = app_config.match(/^version: (.+)$/m)![1]

// Suggest incrementing the patch number
const parts = prev_version.split('.')
const suggest_version = [...parts.slice(0, 2), String(parseInt(parts[2]) + 1)].join('.')
console.log(`Previous version was: ${prev_version}`)

// Prompt user for new version
const rl = createInterface({input: process.stdin, output: process.stdout})
const new_version = await new Promise<string>(resolve => {
    rl.question(`New version [${suggest_version}]: `, answer => {
        rl.close()
        resolve(answer.trim() || suggest_version)
    })
})

// Update version in app config and apply it
writeFileSync(app_config_path, app_config.replace(/^version: .+$/m, `version: ${new_version}`))
run_visible('apply_app_config stello')

// Commit and tag the new version
run_visible('git add .')
run_visible(`git commit -m "Version ${new_version}"`)
run_visible(`git tag --annotate -m "Version ${new_version}" v${new_version}`)

// Notes for next steps
console.log('\n\nNow push and once built, test using below before running release_publish\n')
console.log('https://stello-releases.s3-us-west-2.amazonaws.com/electron_proposed/stello.AppImage')
