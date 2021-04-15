// Generation of sass variables to provide to all sass files during webpack build

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
let inject = `
    @import 'src/shared/shared_mixins.sass'
    @import 'src/styles/globals.sass'
`
for (const [key, value] of Object.entries(app_config.theme)){
    inject += `\n$${key}: ${value}`
}
module.exports = {inject}
