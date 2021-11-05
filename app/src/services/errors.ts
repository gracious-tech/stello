
import Vue from 'vue'
import Rollbar from 'rollbar/src/browser/core'  // Rollbar defaults to a minified general version

import app_config from '@/app_config.json'


// Visual failure util
function show_fail_bar(){
    // Display fail bar with button to reload app

    // Don't show if a fail bar or update bar already exists
    if (self.document.querySelector('.reload-bar') !== null){
        return
    }

    // Insert the bar
    self.document.body.insertAdjacentHTML('afterbegin', `
        <div class="reload-bar fail">
            A problem was detected
            <div>
                Please
                <a href="https://gracious.tech/support/stello/" target='_blank'>LET US KNOW</a>
                and then
                <button>RELOAD</button>
            </div>
        </div>
    `)
    ;(self.document.querySelector('.reload-bar.fail button') as HTMLButtonElement)
        .addEventListener('click', () => {location.assign('#/');location.reload()})
}


// Setup Rollbar
const fake_base_url = 'file:///redacted'
const rollbar = new Rollbar({
    transmit: import.meta.env.MODE === 'production',  // Call handlers but don't transmit in dev
    environment: import.meta.env.MODE,
    accessToken: import.meta.env.VITE_ROLLBAR_APP,
    captureUncaught: true,  // NOTE Rollbar does more special handling than just `.error()`
    captureUnhandledRejections: true,
    autoInstrument: {
        // Report CSP issues
        contentSecurityPolicy: true,
        errorOnContentSecurityPolicy: true,
        // SECURITY Don't track use via telemetry to protect privacy
        connectivity: false,
        dom: false,
        navigation: false,
        network: false,
        log: false,
    },
    uncaughtErrorLevel: 'critical',  // Default to critical (shows fail bar)
    payload: {
        server: {
            root: fake_base_url,  // So rollbar points to correct source code location
        },
        // Version must be within payload prop (https://github.com/rollbar/rollbar.js/issues/842)
        code_version: 'v' + app_config.version,  // 'v' to match git tags
    },
    // Below are regex strings that will have global & case-insensitive flags applied
    ignoredMessages: [
        // ResizeObserver errors are apparently harmless
        // https://stackoverflow.com/questions/49384120/#comment86691361_49384120
        'ResizeObserver loop limit exceeded',
    ],
    onSendCallback: (isUncaught, args, payload:Record<string, unknown>) => {

        // SECURITY Replace all file urls with fake base url to avoid exposing OS username etc
        // NOTE `transform` callback is called earlier and doesn't apply to `notifier` prop
        const base_url = new URL('./', self.location.href).href.slice(0, -1)
        for (const [key, val] of Object.entries(payload)){
            payload[key] = JSON.parse(JSON.stringify(val).replaceAll(base_url, fake_base_url))
        }

        // If critical (not handled by other UI like tasks etc) show fail bar
        if (payload['level'] === 'critical'){
            show_fail_bar()
        }
    },
})


// Error reporting abstraction
self.app_report_error = function(error:unknown):string{
    // Report an error and return id for the report
    // NOTE Uses 'error' level so that a UI fail bar is NOT shown
    console.error(error)
    return rollbar.error(error as Error).uuid
}


// Vue error handling
Vue.config.errorHandler = (error, vm, info) => {
    // Errors within Vue components do not bubble up to Window and must be addressed separately
    // NOTE Vue's info arg says what part of Vue the error occured in (e.g. render/hook/etc)
    console.error(error)
    rollbar.critical(error, info)  // critical levels triggers UI error bar
}
Vue.config.warnHandler = (msg, vm, trace) => {
    // Vue will by default just log warnings, where as hard fail during dev is preferred
    const error = new Error(`VUE WARNING: ${msg}\n\n${trace}`)
    console.error(error)
    rollbar.critical(error)  // Vue won't actually throw in production; just shows fail bar for dev
}
