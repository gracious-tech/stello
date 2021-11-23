// Unsupported browser handling
// WARN This code is intentionally unprocessed as must be simple and support ES4/5 etc
// NOTE Only fails if error, in case browser support test not 100% precise
// NOTE `app_browser_supported` is false for http (except localhost) as crypto only for https
self.app_hash = self.location.hash
self.location.hash = ''
self.app_failed = false
self.app_browser_supported = !! (crypto && crypto.subtle && CSS && CSS.supports
    && CSS.supports('grid-template-rows', 'none'))
self.app_splash_unsupported = function(){
    self.document.body.innerHTML = "<div class='fail-splash'>"
        + "<h1>Sorry, your browser is too old</h1>"
        + "<p>Please update your browser or use another browser to view this message.</p>"
        + "<p>You may need to change your device's default browser,"
        + " or copy and paste the link into the address bar of a different browser.</p>"
        + "</div>"
}
self.addEventListener('error', function(){
    if (!self.app_failed && !self.app_browser_supported){
        self.app_failed = true
        self.location.hash = self.app_hash
        self.app_splash_unsupported()
    }
})
