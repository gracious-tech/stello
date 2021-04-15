
// ERRORS


self._fail = msg => {
    // Handle app failure

    // Do nothing if not supported, as don't want to fill error logs, and splash shown by index.pug
    if (!self._browser_supported){
        return
    }

    // Show alert
    self.__fail_alert("Something went wrong", msg)
}


self._fail_network = () => {
    // Handle connection issues
    self.__fail_alert("Could not connect", "Please check your internet connection and try again")
}


self.__fail_alert = (heading, msg) => {
    // Show alert with recovery buttons
    // TODO Button to reset app or contact developers

    // Don't show if a fail splash already exists
    if (self.document.querySelector('.fail-splash') !== null){
        return
    }

    // Show the alert
    self.document.body.innerHTML += `
        <div class="fail-splash error">
            <h1>${heading}</h1>
            <p class='btn-wrap'><button onclick="location.reload(true)">RETRY</button></p>
            <pre></pre>
        </div>
    `
    self.document.body.querySelector('.fail-splash.error pre')!.textContent = msg
}


self._error_to_msg = error => {
    // Convert an error object into a string (standard toString doesn't include stack)
    // NOTE Chrome (and probably others too) ONLY has properties name, message, and stack
    // NOTE While Chrome includes name/message in the stack, Firefox and Safari do not
    return error ? `${error.name}: ${error.message}\n\n${error.stack}` : "unknown"
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
    console.error(event)  // tslint:disable-line:no-console
    let msg = event.reason
    if (msg instanceof Error){
        msg = self._error_to_msg(msg)
    }
    self._fail('[rejection] ' + msg)
})


// INIT


// Immediately remove hash and store internally for security
self._hash = self.location.hash
self.location.hash = ''
