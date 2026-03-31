
import path from 'path'
import {readFileSync} from 'fs'
import {fileURLToPath} from 'url'


// Detect if running automated testing
export const TESTING = !!process.env['TEST_WORKER_INDEX']  // A var Playwright sets when testing


// Helper for getting files from root dir
export function get_path(sub_path=''){
    return path.join(path.dirname(fileURLToPath(import.meta.url)), '../', sub_path)
}


// Load config file (created from env vars and embedded during packaging)
interface ElectronConfig {
    rollbar_electron:string
    hosted_api:string
}
export const CONFIG = JSON.parse(readFileSync(
    get_path('config.json'), {encoding: 'utf8'})) as ElectronConfig
