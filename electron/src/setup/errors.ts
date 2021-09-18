
import path from 'path'

import Rollbar from 'rollbar'
import {app} from 'electron'

import {CONFIG, get_path} from '../utils/config'


// Report errors to Rollbar in production
const fake_app_dir = path.sep === '/' ? '/redacted' : 'C:\\redacted'
Rollbar.init({
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
            root: fake_app_dir,  // Required to trigger matching to source code
            host: 'redacted',  // SECURITY Host may identify user by real name
        },
        request: {
            // `captureIp` config doesn't work for Node so manually set in payload
            // See https://github.com/rollbar/rollbar.js/issues/963
            user_ip: '$remote_ip',
        },
    },
    onSendCallback: (isUncaught, args, payload) => {
        // SECURITY Replace all file paths with fake base dir to avoid exposing OS username etc
        // NOTE `transform` callback is called earlier and doesn't apply to `notifier` prop
        const base = path.dirname(get_path())  // Must be parent of node_modules too
        for (const [key, val] of Object.entries(payload)){
            ;(payload as Record<string, unknown>)[key] =
                JSON.parse(JSON.stringify(val).split(base).join(fake_app_dir))
        }
    },
})
