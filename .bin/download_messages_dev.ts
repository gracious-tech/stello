
import fs from 'fs'
import path from 'path'
import {execSync} from 'child_process'


// Determine dir that will hold the messages
const dest_path = path.join(path.dirname(__dirname), 'displayer/public/dev')
console.log(dest_path)


// Wipe destination dir
fs.rmSync(dest_path, {recursive: true, force: true})


// Extract host settings from app's dev env vars
const vars = fs.readFileSync('app/.env.development.local', {encoding: 'utf-8'})
const host = JSON.parse(vars.split('VITE_DEV_HOST_SETTINGS=')[1]!.split('\n')[0]!)


// Download all messages into dev dir in displayer
const filter_args = "--exclude '*' --include 'messages/*' --include 'config/*'"
execSync(`aws s3 sync ${filter_args} 's3://${host.bucket}/' '${dest_path}'`, {env: {
    AWS_ACCESS_KEY_ID: host.generated.credentials.accessKeyId,
    AWS_SECRET_ACCESS_KEY: host.generated.credentials.secretAccessKey,
}})
