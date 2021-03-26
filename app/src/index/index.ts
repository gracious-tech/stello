/* First code to be loaded and executed

Contains error handling code so that at minimum a debug message can be displayed
Not bundled with main code in case main has parsing or execution issues
NOTE Ok to import specific utils etc as only what is imported will be bundled and used
NOTE Declare window-level properties and methods in `services/types.d.ts`

*/


import app_config from '@/app_config.json'
import {mailto} from '@/services/utils/misc'
import {drop, error_to_string} from '@/services/utils/exceptions'


// Trigger packaging of index's styles
// TODO Import from index.pug so this file doesn't have lots of import code when bundled (use vite?)
import './index.sass'


self._error_to_debug = (error:any):string => {
    // Take an error, convert to string, and add additional debugging info to it
    let debug = error_to_string(error)

    // SECURITY Remove file paths in stack trace which may expose user's username
    // NOTE Windows uses forward slashes for file URLs, same as Linux and Mac
    debug = debug.replaceAll(/file\:\/\/\/.*\/app_dist\//g, '')

    // Detect current route
    // SECURITY Don't include path which might include a system username
    // SECURITY Might include an object id but all are so far random strings anyway
    const route = self.location.hash

    // Add additional info
    const os = self.navigator.platform
    debug = `Version: ${app_config.version}\nRoute: ${route}\nOS: ${os}\n\n${debug}`

    return debug
}


self._debug_to_mailto = (debug:string):string => {
    // Generate a mailto href for reporting bugs, attaching given debugging details
    return mailto(app_config.author.email, "Problem with Stello", ""
        + "Hi, I was using Stello and encountered an error. This happened when I was trying to..."
        + "\n\n[ADD AS MUCH DETAIL AS POSSIBLE]"
        + `\n\n\n\n\n\n----------\n${debug}`)
}


self._fail_splash = (debug:string):void => {
    // Display debugging details in a user friendly splash

    // Don't show if a fail splash already exists
    if (self.document.querySelector('.fail-splash') !== null){
        return
    }

    // Insert the splash
    self.document.body.innerHTML += `
        <div class="fail-splash">
            <h1>Fail :(</h1>
            <p>
                Something went wrong, sorry about that.
                Help us prevent this happening again by
                <a href="${self._debug_to_mailto(debug)}">letting us know</a>.
            </p>
            <p>
                <button onclick="location.assign('#/');location.reload(true)">
                    RESTART
                </button>
            </p>
            <pre></pre>
        </div>
    `
    self.document.body.querySelector('.fail-splash pre').textContent = debug
}


self._fail_report = (debug:string):void => {
    // Report bugs by posting to author's contact API
    if (process.env.NODE_ENV === 'production'){
        drop(fetch(app_config.author.post, {
            method: 'POST',
            body: JSON.stringify({
                app: app_config.codename,
                type: 'failure',
                version: app_config.version,  // Important for silencing reports from old versions
                message: debug,
            }),
        }))
    }
}


self.addEventListener('error', (event:ErrorEvent):void => {
    // Handle uncaught errors

    // Ignore ResizeObserver loop limit errors
    // https://stackoverflow.com/questions/49384120/#comment86691361_49384120
    if (event.message === 'ResizeObserver loop limit exceeded'){
        console.warn(event.message)
        return
    }

    // NOTE error property should usually exist, but fallback on message
    const error = event.error ?? event.message ?? 'unknown'
    console.error(error)  // tslint:disable-line:no-console
    const debug = self._error_to_debug(error)
    self._fail_report(debug)
    self._fail_splash(debug)
})


self.addEventListener('unhandledrejection', (event:PromiseRejectionEvent):void => {
    // Handle uncaught errors in promises
    // NOTE Don't trigger failure as can usually safely continue after promise failures or retry
    // NOTE Not even logging to avoid duplication, as Chrome already does this by default
    // NOTE Can't prevent this even for user-fault failed tasks (e.g. reauth) then not reporting...
})
