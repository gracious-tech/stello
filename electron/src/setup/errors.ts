
import Rollbar from 'rollbar'
import {app} from 'electron'

import {CONFIG} from '../utils/config.js'


// Report errors to Rollbar in production
const rollbar = Rollbar.init({
    transmit: app.isPackaged,  // Call handlers but don't transmit in dev
    environment: app.isPackaged ? 'production' : 'development',
    accessToken: CONFIG.rollbar_electron,
    captureUncaught: true,
    captureUnhandledRejections: true,
    codeVersion: 'v' + app.getVersion(),  // 'v' to match git tags
    autoInstrument: false,  // SECURITY Don't track use via telemetry to protect privacy
    payload: {
        platform: 'client',  // Allows using public client token rather than server
        server: {
            // root: app dir with user replaced,  // Required to trigger matching to source code
            host: 'redacted',  // SECURITY Host may identify user by real name
        },
        request: {
            // `captureIp` config doesn't work for Node so manually set in payload
            // See https://github.com/rollbar/rollbar.js/issues/963
            user_ip: '$remote_ip',
        },
    },
    onSendCallback: (isUncaught, args, payload) => {
        // SECURITY Avoid exposing OS username in paths
        // NOTE `transform` callback is called earlier and doesn't apply to `notifier` prop
        try {
            const home = app.getPath('home')
            for (const [key, val] of Object.entries(payload)){
                ;(payload as Record<string, unknown>)[key] = JSON.parse(
                    JSON.stringify(val).replaceAll(home, '~'))
            }
        } catch {
            // Ensure doesn't fail / don't need to return anything
        }
    },
})


export function report_error(error:unknown):string{
    // Report an error and return id for the report
    console.error(error)
    return rollbar.error(error as Error).uuid
}


let file_remove_eperm_reported = false
export function report_file_remove_fail(error:NodeJS.ErrnoException, path:string){
    // Handle silent failure of user_file_remove

    // Report max 1 failure to remove a file due to permissions per session
    //     since permission issues are mostly the user's responsibility
    if (error.code === 'EPERM'){
        if (file_remove_eperm_reported){
            return
        }
        file_remove_eperm_reported = true
    }

    report_error(`user_file_remove error (${error.code || error})\nPath: ${path}`)
}
