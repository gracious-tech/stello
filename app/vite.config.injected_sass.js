// Generation of sass variables to provide to all sass files during build
// WARN Do not @import anything in here as importing in every single sass file cripples performance

const app_config = require('./src/app_config.json')


/* Notes on Vuetify variables and styles

Locations of useful Vuetify application-wide classes
    node_modules/vuetify/src/styles/elements/_typography.sass
    node_modules/vuetify/src/styles/generic/_elevation.scss
    node_modules/vuetify/src/styles/generic/_transitions.scss

Locations of useful Vuetify sass variables
    node_modules/vuetify/src/styles/settings/_dark.scss
    node_modules/vuetify/src/styles/settings/_light.scss
    node_modules/vuetify/src/styles/settings/_variables.scss

NOTE .secondary--text & .text--secondary are different!

*/


// Generate string to inject into beginning of all sass files and components' sass
let inject = ''
for (const [key, value] of Object.entries(app_config.theme)){
    inject += `$${key}: ${value}\n`
}
module.exports = {inject}
