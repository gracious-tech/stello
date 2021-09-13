
import path from 'path'
import {readFileSync} from 'fs'


// Detect if running automated testing
export const TESTING = !!process.env['TEST_WORKER_INDEX']  // A var Playwright sets when testing


// Helper for getting files from root dir
export const get_path = (sub_path='') => path.join(__dirname, '../', sub_path)


// Load config file (created from env vars and embedded during packaging)
interface ElectronConfig {
    rollbar_electron:string
}
export const CONFIG = JSON.parse(readFileSync(
    get_path('config.json'), {encoding: 'utf8'})) as ElectronConfig
