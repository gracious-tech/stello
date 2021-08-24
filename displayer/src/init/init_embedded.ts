
import * as app_config from '../app_config.json'
import {error_to_string, drop} from '../services/utils/exceptions'
import {generate_token} from '../services/utils/crypt'
import {sleep} from '../services/utils/async'


// ERROR VALUES


// List of keywords that if present anywhere in an error message, should ignore
const ignore_errors = ['@safari-extension://']


// Mark start time so know runtime when errors occur
const start_ms = new Date().getTime()


// Preserve date of last error report so can throttle them
let fail_report_last = 0  // i.e. 1970


// Consider errors critical up till msg contents displayed
self._fail_report_critical = true


// ERROR UTILS


function rollbar(message:string):void{
    // Send an error report to Rollbar
    // NOTE Not using Rollbar's own SDK as it is too large and unnecessary
    void drop(fetch('https://api.rollbar.com/api/1/item/', {
        method: 'POST',
        body: JSON.stringify({
            access_token: import.meta.env.VITE_ROLLBAR_DISPLAYER,
            data: {
                environment: import.meta.env.MODE,
                platform: 'browser',
                language: 'javascript',
                level: self._fail_report_critical ? 'critical' : 'error',
                uuid: generate_token(),
                timestamp: Math.round(new Date().getTime() / 1000),  // In secs
                code_version: 'v' + app_config.version,  // 'v' to match git tags
                request: {
                    url: self.location.origin,  // SECURITY Don't expose hash
                    user_ip: '$remote_ip',  // Rollbar will set from requests' IP
                },
                client: {
                    runtime_ms: new Date().getTime() - start_ms,
                    javascript: {
                        browser: self.navigator.userAgent,
                        language: self.navigator.language,
                    },
                },
                body: {
                    message: {
                        body: message,
                    },
                },
            },
        }),
    }))
}


self._fail_report = async (msg:string):Promise<void> => {
    // Report an error

    // Don't report if browser not supported, as not actionable
    if (import.meta.env.MODE !== 'production' || !self._browser_supported){
        return
    }

    // Throttle reports since multiple in quick succession usually repetitive
    const time_since_last_report = new Date().getTime() - fail_report_last
    if (time_since_last_report < 3000){
        return
    }
    fail_report_last = new Date().getTime()

    // If JS only just loaded, delay the report to see if message will load anyway or not
    // Gives self._fail_report_critical a chance to be changed before submitting the report
    const time_since_start = fail_report_last - start_ms
    const time_till_allowed = 3000 - time_since_start
    if (time_till_allowed > 0){
        await sleep(time_till_allowed)
    }

    // Send the report
    rollbar(msg)
}

self._fail_visual = (network=false):void => {
    // Visually display failure, either via a splash or a top bar

    // First error takes priority, so ignore any future failures
    if (self._failed){
        return
    }
    self._failed = true

    // Restore hash to address bar so user can copy to different browser if needed
    self.location.hash = self._hash

    // Add HTML for message
    if (network){
        // Critical network failure shows full page splash
        self.document.body.innerHTML = `
            <div class="fail-splash">
                <h1>Could not download message</h1>
                <p>Please check your internet connection and try again</p>
                <button onclick="location.reload(true)">RETRY</button>
            </div>
        `
    } else if (self._browser_supported){
        // Message quite likely already visible, so just show a top bar
        // NOTE Since only showing a bar, ensure loading animation no longer exists
        self.document.querySelector('#app > svg.loading')?.remove()
        self.document.body.insertAdjacentHTML('afterbegin', `
            <div class="fail-bar">
                <div>
                    <h1>Your browser had trouble displaying this message</h1>
                    <p>Changing browser may help if problems persist</p>
                </div>
                <button onclick="location.reload(true)">RELOAD</button>
            </div>
        `)
    } else {
        // Unsupported browser, so show full page splash
        // NOTE This is especially needed for errors Vue catches
        self._fail_splash_unsupported()
    }
}


// ERROR HANDLING


self.addEventListener('error', (event:ErrorEvent):void => {
    // Handle uncaught errors
    const error = event.error ?? event.message ?? 'unknown'
    const msg = error_to_string(error)
    for (const code of ignore_errors){
        if (msg.includes(code)){
            return
        }
    }
    console.error(error)
    self._fail_report(msg)
    self._fail_visual()
})


self.addEventListener('unhandledrejection', event => {
    // Report uncaught errors in promises
    const msg = error_to_string(event.reason)
    for (const code of ignore_errors){
        if (msg.includes(code)){
            return
        }
    }
    self._fail_report(msg)
    self._fail_visual()
})