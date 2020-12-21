// Code to be embedded in index.html during build
// NOTE Declare window-level properties and methods in `services/types.d.ts`

// Trigger packaging of index's styles
import './index.sass'


// Handle errors


self._fail_alert = msg => {
    // Show alert with option to reload/clear-data or contact developers

    // Don't show if a fail splash already exists
    if (self.document.querySelector('.fail-splash') !== null){
        return
    }

    // TODO Button to reset app or contact developers

    // Show the alert
    self.document.body.innerHTML += `
        <div class="fail-splash error">
            <h1>Fail :(</h1>
            <p class='btn-wrap'>
                <button onclick="location.assign('#/');location.reload(true)">
                    TRY RECOVER
                </button>
            </p>
            <pre></pre>
        </div>
    `
    self.document.body.querySelector('.fail-splash.error pre').textContent = msg
}


self._error_to_msg = error => {
    // Convert an error object into a string (standard toString doesn't include stack)
    // NOTE Chrome (and probably others too) ONLY has properties name, message, and stack
    // NOTE While Chrome includes name/message in the stack, Firefox and Safari do not
    return error ? `${error.name}: ${error.message}\n\n${error.stack}` : "unknown"
}


self._fail = msg => {
    // Handle app failure
    self._fail_alert(msg)
}

self.addEventListener('error', event => {
    // Handle uncaught errors
    // NOTE error property should always exist, but fallback on message (also if a custom throw?)
    console.error(event)  // tslint:disable-line:no-console
    const msg = event.error ? self._error_to_msg(event.error) : event.message
    self._fail(msg)
})


self.addEventListener('unhandledrejection', event => {
    // Handle uncaught errors in promises
    // NOTE Don't cause failure as can usually safely continue after promise failures or retry
    console.error(event)  // tslint:disable-line:no-console
})
