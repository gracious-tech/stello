
// Include polyfills
import 'core-js/features/string/replace-all'

import {createApp} from 'vue'

import {store} from './services/store'
import {database} from './services/database'
// @ts-ignore For some reason TS imports below fine but says it can't when checking types
import App from './App.vue'


// Embed stello styles in JS (so doesn't block first render)
import './styles.sass'


// Dynamically add icon so that it's packaged in JS and don't have to upload as separate file
// @ts-ignore special image import
import icon_url from './assets/icon.png'
;(self.document.querySelector('link[rel="icon"]') as HTMLLinkElement).href = icon_url


// Do init within an async function so can use await
async function init(){

    // Init Vue app
    self._app = createApp(App)

    // Wait for dependencies to be ready
    await database.connect()
    await store.init()

    // Mount the app
    self._app.mount('#app')
}
init()
